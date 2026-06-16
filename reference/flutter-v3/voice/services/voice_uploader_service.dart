/// Uploads a completed voice submission (chunk 6c). Closes the v1 loop:
/// three WAVs → Supabase Storage → voice_submissions + voice_recordings rows
/// → analyze-voice edge function → an analysis_results row the "My Score"
/// screen reads.
///
/// Storage path convention (per mobile_app_plan.md §7.1):
///   voice-samples/{client_user_id}/{submission_uuid}/{recording_type}.wav
///
/// IMPORTANT — uploads go through SERVICE-ROLE SIGNED UPLOAD URLs, not a
/// direct client upload. Supabase Storage writes the JWT `sub` into a uuid
/// `owner_id` column and the bucket RLS keys on auth.uid(); under Clerk the
/// sub is "user_xxx" (text), so a direct upload fails with
/// "invalid input syntax for type uuid". The `voice-upload-urls` edge
/// function (service role) creates the signed URLs — the object row is then
/// created in a service context with no Clerk sub. See memory
/// project_v3_storage_clerk_blocker.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;

import 'package:radio_online/auth/config/supabase_config.dart';
import 'package:radio_online/auth/services/clerk_session.dart';
import 'package:radio_online/voice/cubit/voice_submission_cubit.dart';
import 'package:radio_online/voice/data/voice_recording_type.dart';

class VoiceUploadException implements Exception {
  VoiceUploadException(this.message);
  final String message;
  @override
  String toString() => 'VoiceUploadException: $message';
}

class VoiceUploaderService {
  VoiceUploaderService();

  static const _bucket = 'voice-samples';
  static const _maxAttempts = 3;

  /// Submit the captured recordings. Returns the new submission id on success.
  ///
  /// [onFileUploaded] fires after each file lands (1-based count) so the UI
  /// can show "Uploading N of 3".
  Future<String> submit({
    required List<CapturedRecording> recordings,
    void Function(int uploaded, int total)? onFileUploaded,
  }) async {
    if (recordings.length != 3) {
      throw VoiceUploadException(
        'Expected 3 recordings, got ${recordings.length}.',
      );
    }

    final clientUserId = ClerkSession.instance.publicUserId;
    if (clientUserId == null) {
      throw VoiceUploadException('Not signed in.');
    }

    final practiceId = await _resolvePracticeId();
    final submissionId = _uuidV4();

    // 1a. Ask the edge function (service role) for signed upload URLs — this
    // is what sidesteps Storage's Clerk owner_id problem.
    final signed = await _fetchSignedUploadUrls(
      submissionId: submissionId,
      types: [for (final r in recordings) r.type],
    );

    // 1b. Upload the three files in parallel (each with its own retry) to its
    // signed URL.
    var uploaded = 0;
    final total = recordings.length;
    final uploads = <Future<_UploadedFile>>[];
    for (final rec in recordings) {
      final target = signed[rec.type];
      if (target == null) {
        throw VoiceUploadException(
          'No signed URL returned for ${rec.type.shortLabel}.',
        );
      }
      uploads.add(() async {
        final result = await _uploadWithRetry(
          recording: rec,
          path: target.path,
          token: target.token,
        );
        uploaded++;
        onFileUploaded?.call(uploaded, total);
        return result;
      }());
    }
    final uploadedFiles = await Future.wait(uploads);

    // 2. Insert the parent submission row.
    await _insertSubmission(
      submissionId: submissionId,
      clientUserId: clientUserId,
      practiceId: practiceId,
    );

    // 3. Insert the three child recording rows.
    await _insertRecordings(
      submissionId: submissionId,
      files: uploadedFiles,
    );

    // 4. Trigger analyze-voice. A failure here doesn't undo the upload — the
    // submission is persisted; analysis can be retried server-side or by the
    // user re-opening the score screen.
    await _triggerAnalyzeVoice(submissionId);

    // 5. Best-effort cleanup of the local WAVs now that they're uploaded.
    for (final rec in recordings) {
      try {
        final f = File(rec.filePath);
        if (await f.exists()) await f.delete();
      } catch (_) {/* non-fatal */}
    }

    return submissionId;
  }

  // ---- steps ---------------------------------------------------------------

  /// The user's active practice membership's practice_id (denormalized onto
  /// the submission). v1 takes the first active membership; the
  /// one-active-practice_client constraint makes that unambiguous for members.
  Future<String?> _resolvePracticeId() async {
    try {
      final rows = await supabase
          .from('practice_memberships')
          .select('practice_id')
          .eq('status', 'active')
          .limit(1);
      if (rows.isEmpty) return null;
      return rows.first['practice_id'] as String?;
    } catch (e) {
      debugPrint('VoiceUploader._resolvePracticeId failed: $e');
      return null;
    }
  }

  /// Call the voice-upload-urls edge function to get service-role signed
  /// upload URLs for each recording. Returns a map keyed by recording type.
  Future<Map<VoiceRecordingType, _SignedTarget>> _fetchSignedUploadUrls({
    required String submissionId,
    required List<VoiceRecordingType> types,
  }) async {
    final jwt = await ClerkSession.instance.currentJwt();
    if (jwt == null) throw VoiceUploadException('Not signed in.');

    final resp = await http.post(
      Uri.parse('$supabaseUrl/functions/v1/voice-upload-urls'),
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': 'Bearer $jwt',
      },
      body: jsonEncode({
        'submission_id': submissionId,
        'recording_types': [for (final t in types) t.dbValue],
      }),
    );
    if (resp.statusCode >= 400) {
      throw VoiceUploadException(
        'Could not prepare upload (${resp.statusCode}): ${resp.body}',
      );
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    final list = (body['uploads'] as List?) ?? const [];
    final byType = <VoiceRecordingType, _SignedTarget>{};
    for (final item in list) {
      final m = item as Map<String, dynamic>;
      final type = kRecordingOrder.firstWhere(
        (t) => t.dbValue == m['recording_type'],
        orElse: () => VoiceRecordingType.sustainedVowel,
      );
      byType[type] = _SignedTarget(
        path: m['path'] as String,
        token: m['token'] as String,
      );
    }
    return byType;
  }

  Future<_UploadedFile> _uploadWithRetry({
    required CapturedRecording recording,
    required String path,
    required String token,
  }) async {
    final bytes = await File(recording.filePath).readAsBytes();

    Object? lastError;
    for (var attempt = 1; attempt <= _maxAttempts; attempt++) {
      try {
        await supabase.storage.from(_bucket).uploadBinaryToSignedUrl(
              path,
              token,
              bytes,
              const FileOptions(contentType: 'audio/wav'),
            );
        return _UploadedFile(
          recording: recording,
          storagePath: path,
          sizeBytes: bytes.length,
        );
      } catch (e) {
        lastError = e;
        debugPrint(
          'VoiceUploader upload attempt $attempt/$_maxAttempts for '
          '${recording.type.dbValue} failed: $e',
        );
        if (attempt < _maxAttempts) {
          await Future<void>.delayed(Duration(milliseconds: 400 * attempt));
        }
      }
    }
    throw VoiceUploadException(
      'Could not upload ${recording.type.shortLabel} after $_maxAttempts '
      'attempts: $lastError',
    );
  }

  Future<void> _insertSubmission({
    required String submissionId,
    required String clientUserId,
    required String? practiceId,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    try {
      await supabase.from('voice_submissions').insert({
        'id': submissionId,
        'client_id': clientUserId,
        'practice_id': practiceId,
        'provider_id': null,
        'status': 'pending',
        'recording_count': 3,
        'submitted_at': now,
      });
    } catch (e) {
      throw VoiceUploadException('Could not create submission: $e');
    }
  }

  Future<void> _insertRecordings({
    required String submissionId,
    required List<_UploadedFile> files,
  }) async {
    final appVersion = await _appVersion();
    final device = await _deviceLabel();
    final rows = <Map<String, dynamic>>[];
    for (final f in files) {
      final rec = f.recording;
      final v = rec.validation;
      rows.add({
        'submission_id': submissionId,
        'recording_type': rec.type.dbValue,
        'recording_order': rec.type.stepNumber,
        'file_path': f.storagePath,
        'file_size_bytes': f.sizeBytes,
        'duration_seconds': rec.duration.inMilliseconds / 1000.0,
        'mime_type': 'audio/wav',
        'sample_rate_hz': 44100,
        'passage_id': rec.passageCode,
        'language_used': rec.languageUsed,
        'validation_status': v.passed ? 'passed' : 'failed',
        'validation_warnings': const <String>[],
        'capture_metadata': {
          'recording_duration_seconds': rec.duration.inMilliseconds / 1000.0,
          'overall_rms': v.measuredFor('overall_rms'),
          'noise_floor_rms': v.measuredFor('noise_floor'),
          'silence_ratio': v.measuredFor('max_silence'),
          'clip_ratio': v.measuredFor('clipping'),
          'validation_status': v.passed ? 'passed' : 'failed',
          'validation_warnings': const <String>[],
          if (rec.passageCode != null) 'passage_id': rec.passageCode,
          if (rec.languageUsed != null) 'language_used': rec.languageUsed,
          'app_version': appVersion,
          'device_model': device,
          'os_version': device,
          'mic_source': 'built_in',
        },
      });
    }
    try {
      await supabase.from('voice_recordings').insert(rows);
    } catch (e) {
      throw VoiceUploadException('Could not save recordings: $e');
    }
  }

  Future<void> _triggerAnalyzeVoice(String submissionId) async {
    final jwt = await ClerkSession.instance.currentJwt();
    if (jwt == null) {
      throw VoiceUploadException('Lost session before analysis could start.');
    }
    try {
      final resp = await http.post(
        Uri.parse('$supabaseUrl/functions/v1/analyze-voice'),
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'submission_id': submissionId}),
      );
      if (resp.statusCode >= 400) {
        // Don't fail the whole submit — the rows are persisted. Surface a
        // soft warning via log; the score screen's "analyzing" poll will
        // pick it up if/when analysis lands.
        debugPrint(
          'analyze-voice returned ${resp.statusCode}: ${resp.body}',
        );
      }
    } catch (e) {
      debugPrint('analyze-voice trigger failed (non-fatal): $e');
    }
  }

  // ---- helpers -------------------------------------------------------------

  Future<String> _appVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      return '${info.version}+${info.buildNumber}';
    } catch (_) {
      return 'unknown';
    }
  }

  Future<String> _deviceLabel() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final a = await plugin.androidInfo;
        return '${a.manufacturer} ${a.model} (Android ${a.version.release})';
      } else if (Platform.isIOS) {
        final i = await plugin.iosInfo;
        return '${i.utsname.machine} (iOS ${i.systemVersion})';
      }
    } catch (_) {}
    return 'unknown';
  }

  static String _uuidV4() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    String h(int x) => x.toRadixString(16).padLeft(2, '0');
    final s = b.map(h).join();
    return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}'
        '-${s.substring(16, 20)}-${s.substring(20)}';
  }
}

class _UploadedFile {
  _UploadedFile({
    required this.recording,
    required this.storagePath,
    required this.sizeBytes,
  });
  final CapturedRecording recording;
  final String storagePath;
  final int sizeBytes;
}

class _SignedTarget {
  _SignedTarget({required this.path, required this.token});
  final String path;
  final String token;
}
