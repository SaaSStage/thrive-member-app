/// On-device WAV quality validation (chunk 6b). Reads the raw 16-bit PCM
/// samples and runs five checks before a recording is accepted into the
/// submission. Per the LOE plan, v1 is STRICT pass/fail — a failed check
/// forces a re-record. Marginal "yellow warning" handling is v2.
///
/// All thresholds are constants here and WILL need a tuning pass against
/// real-device, real-user data (LOE risk #6: Samsung/Xiaomi audio HAL
/// variance). Keep them centralized so that pass is a one-file change.
library;

import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import 'package:radio_online/voice/data/voice_recording_type.dart';

/// Tunable thresholds for the five checks. Centralized for the inevitable
/// post-launch retuning.
class VoiceValidationThresholds {
  const VoiceValidationThresholds();

  /// A sample is "silent" if its absolute normalized amplitude is below this.
  /// (~ -50 dBFS)
  final double silenceAmplitude = 0.003;

  /// Max fraction of "silent" samples, BY RECORDING TYPE. Connected speech
  /// (reading passage, pa-ta-ka) naturally has far more inter-word /
  /// inter-syllable silence than a sustained vowel, so a flat 30% wrongly
  /// rejects valid speech. Tuned conservatively; revisit with real-user data.
  double maxSilenceRatioFor(VoiceRecordingType type) => switch (type) {
        // Sustained "ah" is a continuous tone — should be almost no silence.
        VoiceRecordingType.sustainedVowel => 0.40,
        // Reading aloud: lots of natural pauses + trailing quiet.
        VoiceRecordingType.readingPassage => 0.70,
        // pa-ta-ka has gaps between syllable bursts.
        VoiceRecordingType.diadochokinetic => 0.65,
      };

  /// A sample is "clipped" if its absolute normalized amplitude is at/above
  /// this. (~ -0.09 dBFS)
  final double clipAmplitude = 0.99;

  /// Fail if more than this fraction of samples are clipped.
  final double maxClipRatio = 0.01;

  /// Window size for the noise-floor estimate. We slide this across the whole
  /// recording and take the QUIETEST window as the noise floor — robust to
  /// users who start speaking immediately (the old "first 0.5s" assumption
  /// mistook their opening word for background noise).
  final Duration noiseWindow = const Duration(milliseconds: 500);

  /// Fail if even the quietest window's RMS exceeds this normalized level.
  /// (~ -26 dBFS) — a genuinely noisy room with no quiet moment. Lenient on
  /// purpose; the silence + RMS checks already guard "did they speak."
  final double maxNoiseFloorRms = 0.05;

  /// Fail if the overall RMS is below this. (~ -40 dBFS) — mic didn't pick
  /// up the voice.
  final double minOverallRms = 0.01;
}

class VoiceCheck {
  const VoiceCheck({
    required this.id,
    required this.passed,
    required this.measured,
    this.failureMessage,
  });

  final String id;
  final bool passed;

  /// The measured value (ratio, RMS, or seconds) — useful for tuning + logs.
  final double measured;

  /// User-facing message shown when this check fails.
  final String? failureMessage;
}

class VoiceValidationResult {
  const VoiceValidationResult({required this.checks});

  /// Sentinel used when the file couldn't be read/parsed at all.
  factory VoiceValidationResult.unreadable() => const VoiceValidationResult(
        checks: [
          VoiceCheck(
            id: 'readable',
            passed: false,
            measured: 0,
            failureMessage:
                'We couldn’t read that recording. Please try again.',
          ),
        ],
      );

  final List<VoiceCheck> checks;

  bool get passed => checks.every((c) => c.passed);

  /// The first failure's user-facing message (the recording screen shows one
  /// reason at a time).
  String? get firstFailureMessage =>
      checks.firstWhere((c) => !c.passed, orElse: () => _ok).failureMessage;

  /// Measured value for a check id (e.g. 'noise_floor', 'overall_rms'),
  /// for building the capture_metadata JSON at upload time. Returns 0 if the
  /// id isn't present.
  double measuredFor(String id) {
    for (final c in checks) {
      if (c.id == id) return c.measured;
    }
    return 0;
  }

  static const _ok =
      VoiceCheck(id: '_ok', passed: true, measured: 0);
}

class VoiceValidator {
  const VoiceValidator({this.thresholds = const VoiceValidationThresholds()});

  final VoiceValidationThresholds thresholds;

  /// Validate the WAV at [path] against the [type]'s expectations. Reads the
  /// full file into memory (recordings are <3 MB) and analyzes the PCM.
  Future<VoiceValidationResult> validate(
    String path,
    VoiceRecordingType type,
  ) async {
    final file = File(path);
    if (!await file.exists()) return VoiceValidationResult.unreadable();

    final bytes = await file.readAsBytes();
    final parsed = _parsePcm16(bytes);
    if (parsed == null) return VoiceValidationResult.unreadable();

    final (samples, sampleRate) = parsed;
    if (samples.isEmpty || sampleRate <= 0) {
      return VoiceValidationResult.unreadable();
    }

    final total = samples.length;
    final durationSeconds = total / sampleRate;

    // Single pass: silence, clipping, overall energy + per-window energy for
    // the noise-floor estimate.
    final windowSize = math.max(
      1,
      thresholds.noiseWindow.inMilliseconds * sampleRate ~/ 1000,
    );
    var silentCount = 0;
    var clippedCount = 0;
    var sumSquares = 0.0;
    var windowSumSquares = 0.0;
    var windowFill = 0;
    var minWindowMeanSquare = double.infinity;

    for (var i = 0; i < total; i++) {
      final amp = samples[i].abs() / 32768.0; // normalize 16-bit → [0,1]
      if (amp < thresholds.silenceAmplitude) silentCount++;
      if (amp >= thresholds.clipAmplitude) clippedCount++;
      final sq = amp * amp;
      sumSquares += sq;

      // Quietest-window noise floor.
      windowSumSquares += sq;
      windowFill++;
      if (windowFill == windowSize) {
        final meanSq = windowSumSquares / windowSize;
        if (meanSq < minWindowMeanSquare) minWindowMeanSquare = meanSq;
        windowSumSquares = 0.0;
        windowFill = 0;
      }
    }
    // Fold in a trailing partial window so short recordings still get a floor.
    if (windowFill > 0) {
      final meanSq = windowSumSquares / windowFill;
      if (meanSq < minWindowMeanSquare) minWindowMeanSquare = meanSq;
    }

    final silenceRatio = silentCount / total;
    final clipRatio = clippedCount / total;
    final overallRms = math.sqrt(sumSquares / total);
    final noiseRms = minWindowMeanSquare.isFinite
        ? math.sqrt(minWindowMeanSquare)
        : 0.0;
    final minSeconds = type.minValidDuration.inMilliseconds / 1000.0;

    final result = VoiceValidationResult(checks: [
      VoiceCheck(
        id: 'min_duration',
        passed: durationSeconds >= minSeconds,
        measured: durationSeconds,
        failureMessage: 'Recording too short. Please try again.',
      ),
      VoiceCheck(
        id: 'max_silence',
        passed: silenceRatio <= thresholds.maxSilenceRatioFor(type),
        measured: silenceRatio,
        failureMessage: 'We didn’t pick up enough sound. Please try again.',
      ),
      VoiceCheck(
        id: 'clipping',
        passed: clipRatio <= thresholds.maxClipRatio,
        measured: clipRatio,
        failureMessage:
            'Recording was too loud. Move further from the mic and try again.',
      ),
      VoiceCheck(
        id: 'noise_floor',
        passed: noiseRms <= thresholds.maxNoiseFloorRms,
        measured: noiseRms,
        failureMessage: 'Background noise is too high. Try a quieter space.',
      ),
      VoiceCheck(
        id: 'overall_rms',
        passed: overallRms >= thresholds.minOverallRms,
        measured: overallRms,
        failureMessage:
            'Microphone didn’t pick up your voice clearly. Try again.',
      ),
    ]);

    // Always-on tuning log (LOE risk #6). Cheap, and invaluable for setting
    // thresholds against real-device data. Strip or gate behind a flag before
    // a perf-sensitive release if needed.
    if (kDebugMode) {
      final summary = result.checks
          .map((c) => '${c.id}=${c.measured.toStringAsFixed(4)}'
              '${c.passed ? '' : '✗'}')
          .join(' ');
      debugPrint('VOICE_VALIDATION ${type.dbValue} '
          'pass=${result.passed} dur=${durationSeconds.toStringAsFixed(1)}s '
          '$summary');
    }

    return result;
  }

  /// Parse a 16-bit PCM WAV. Returns (samples, sampleRate) or null if it isn't
  /// RIFF/WAVE/PCM/16-bit.
  ///
  /// Walks the RIFF chunk list rather than assuming the canonical 44-byte
  /// layout: iOS (CoreAudio) writes extra chunks — typically a 'FLLR' filler
  /// that page-aligns the audio data, sometimes a 'fact' chunk — BETWEEN 'fmt '
  /// and 'data', so 'data' is not at offset 36. Android's minimal 44-byte
  /// header is just the special case where 'data' happens to be first.
  static (Int16List, int)? _parsePcm16(Uint8List bytes) {
    if (bytes.length < 12) return null;
    final bd = ByteData.sublistView(bytes);
    // 'RIFF' .. 'WAVE'
    if (_tag(bytes, 0) != 'RIFF' || _tag(bytes, 8) != 'WAVE') return null;

    int audioFormat = 0;
    int numChannels = 1;
    int? sampleRate;
    int bitsPerSample = 0;
    int? dataStart;
    int? dataSize;

    // Chunks start right after 'WAVE' (offset 12). Each chunk is an 8-byte
    // header (4-char id + uint32 little-endian size) followed by its body,
    // word-aligned (odd sizes get a trailing pad byte).
    var offset = 12;
    while (offset + 8 <= bytes.length) {
      final id = _tag(bytes, offset);
      final size = bd.getUint32(offset + 4, Endian.little);
      final body = offset + 8;
      if (id == 'fmt ' && body + 16 <= bytes.length) {
        audioFormat = bd.getUint16(body, Endian.little);
        numChannels = bd.getUint16(body + 2, Endian.little);
        sampleRate = bd.getUint32(body + 4, Endian.little);
        bitsPerSample = bd.getUint16(body + 14, Endian.little);
      } else if (id == 'data') {
        dataStart = body;
        dataSize = size;
        break; // PCM samples follow; stop walking.
      }
      offset = body + size + (size.isOdd ? 1 : 0);
    }

    if (sampleRate == null || dataStart == null) return null;
    if (audioFormat != 1 || bitsPerSample != 16) return null;

    final available = bytes.length - dataStart;
    if (available <= 0) return null;
    // iOS can leave a placeholder/oversized data-chunk size; clamp to what is
    // actually present in the file.
    final usable = (dataSize == null || dataSize <= 0 || dataSize > available)
        ? available
        : dataSize;
    final sampleCount = usable ~/ 2;
    // Read interleaved samples; for mono this is just the stream. For stereo
    // (shouldn't happen with our config) we take the left channel.
    final out = Int16List(numChannels <= 1 ? sampleCount : sampleCount ~/ numChannels);
    var oi = 0;
    for (var i = 0; i < sampleCount; i++) {
      final s = bd.getInt16(dataStart + i * 2, Endian.little);
      if (numChannels <= 1) {
        out[oi++] = s;
      } else if (i % numChannels == 0) {
        if (oi < out.length) out[oi++] = s;
      }
    }
    return (out, sampleRate);
  }

  static String _tag(Uint8List b, int offset) =>
      String.fromCharCodes(b.sublist(offset, offset + 4));
}
