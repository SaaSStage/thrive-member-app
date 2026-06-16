/// Flow-level state machine for the guided voice-submission session
/// (Screens A–G). Tracks which step the user is on and accumulates the
/// captured recordings. The actual recording (mic start/stop, elapsed timer)
/// is owned by the recording screen via [RecorderService]; the screen reports
/// the finished file back here through [captureRecording].
///
/// Chunk 6a wires intro → 3 recordings → review. Validation (6b), upload +
/// DB insert + analyze-voice trigger (6c) extend this without changing the
/// step machine's shape.
library;

import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:radio_online/voice/data/reading_passages.dart';
import 'package:radio_online/voice/data/voice_recording_type.dart';
import 'package:radio_online/voice/services/voice_uploader_service.dart';
import 'package:radio_online/voice/services/voice_validator.dart';

enum VoiceFlowStep { intro, recording, review, uploading, success }

/// A finished recording captured during the session.
class CapturedRecording {
  const CapturedRecording({
    required this.type,
    required this.filePath,
    required this.duration,
    required this.validation,
    this.passageCode,
    this.languageUsed,
  });

  final VoiceRecordingType type;
  final String filePath;
  final Duration duration;

  /// The on-device validation result. In v1 (strict pass/fail) only passing
  /// recordings ever reach the cubit, so this is always `passed == true`
  /// here — but we carry it for the review UI and for the capture_metadata
  /// JSON we upload in 6c.
  final VoiceValidationResult validation;

  /// Only set for [VoiceRecordingType.readingPassage].
  final String? passageCode;
  final String? languageUsed;
}

class VoiceSubmissionState {
  const VoiceSubmissionState({
    required this.step,
    required this.currentIndex,
    required this.captured,
    required this.passage,
    this.uploadedCount = 0,
    this.uploadError,
    this.submissionId,
  });

  factory VoiceSubmissionState.initial(ReadingPassage passage) {
    return VoiceSubmissionState(
      step: VoiceFlowStep.intro,
      currentIndex: 0,
      captured: const {},
      passage: passage,
    );
  }

  final VoiceFlowStep step;

  /// Index into [kRecordingOrder] for the recording currently being captured.
  final int currentIndex;

  /// Captured recordings keyed by type. May be partial mid-flow.
  final Map<VoiceRecordingType, CapturedRecording> captured;

  /// The reading passage selected for this session (randomized at start).
  final ReadingPassage passage;

  /// Files uploaded so far during the uploading step (for "N of 3").
  final int uploadedCount;

  /// Set when an upload attempt fails; the review screen surfaces it.
  final String? uploadError;

  /// Set on success; the success screen / score deep-link can use it.
  final String? submissionId;

  VoiceRecordingType get currentType => kRecordingOrder[currentIndex];

  bool get allCaptured => captured.length == kRecordingOrder.length;

  /// Recordings in capture order (for the review screen).
  List<CapturedRecording> get orderedRecordings =>
      [for (final t in kRecordingOrder) if (captured[t] != null) captured[t]!];

  VoiceSubmissionState copyWith({
    VoiceFlowStep? step,
    int? currentIndex,
    Map<VoiceRecordingType, CapturedRecording>? captured,
    int? uploadedCount,
    String? submissionId,
    bool clearUploadError = false,
    String? uploadError,
  }) {
    return VoiceSubmissionState(
      step: step ?? this.step,
      currentIndex: currentIndex ?? this.currentIndex,
      captured: captured ?? this.captured,
      passage: passage,
      uploadedCount: uploadedCount ?? this.uploadedCount,
      submissionId: submissionId ?? this.submissionId,
      uploadError: clearUploadError ? null : (uploadError ?? this.uploadError),
    );
  }
}

class VoiceSubmissionCubit extends Cubit<VoiceSubmissionState> {
  VoiceSubmissionCubit({
    required String preferredLanguage,
    VoiceUploaderService? uploader,
  })  : _uploader = uploader ?? VoiceUploaderService(),
        super(VoiceSubmissionState.initial(
          randomPassageForLanguage(preferredLanguage),
        ));

  final VoiceUploaderService _uploader;

  /// Intro → first recording.
  void begin() {
    emit(state.copyWith(step: VoiceFlowStep.recording, currentIndex: 0));
  }

  /// Called by the recording screen when a recording finishes. Stores it and
  /// either advances to the next recording or moves to review.
  void captureRecording(CapturedRecording recording) {
    final updated = Map<VoiceRecordingType, CapturedRecording>.from(
      state.captured,
    )..[recording.type] = recording;

    // Advance to the next uncaptured recording in order, else review.
    final nextIndex = _nextUncapturedIndex(updated, from: state.currentIndex);
    if (nextIndex == null) {
      emit(state.copyWith(step: VoiceFlowStep.review, captured: updated));
    } else {
      emit(state.copyWith(
        step: VoiceFlowStep.recording,
        currentIndex: nextIndex,
        captured: updated,
      ));
    }
  }

  /// From the review screen: re-record a specific type. (Wired in 6b's UI;
  /// the state transition lives here so the machine is complete.)
  void reRecord(VoiceRecordingType type) {
    final idx = kRecordingOrder.indexOf(type);
    emit(state.copyWith(step: VoiceFlowStep.recording, currentIndex: idx));
  }

  /// Submit: upload the three files, persist the rows, trigger analyze-voice.
  /// On success → success step (carrying the new submissionId). On failure →
  /// back to review with [uploadError] populated.
  Future<void> submit() async {
    emit(state.copyWith(
      step: VoiceFlowStep.uploading,
      uploadedCount: 0,
      clearUploadError: true,
    ));
    try {
      final id = await _uploader.submit(
        recordings: state.orderedRecordings,
        onFileUploaded: (uploaded, total) {
          emit(state.copyWith(uploadedCount: uploaded));
        },
      );
      emit(state.copyWith(step: VoiceFlowStep.success, submissionId: id));
    } catch (e) {
      emit(state.copyWith(
        step: VoiceFlowStep.review,
        uploadError: e is VoiceUploadException ? e.message : '$e',
      ));
    }
  }

  /// Find the next index (starting at [from]) whose type isn't captured yet.
  int? _nextUncapturedIndex(
    Map<VoiceRecordingType, CapturedRecording> captured, {
    required int from,
  }) {
    for (var i = from; i < kRecordingOrder.length; i++) {
      if (!captured.containsKey(kRecordingOrder[i])) return i;
    }
    // None after `from`; check the whole list (covers re-record-then-return).
    for (var i = 0; i < kRecordingOrder.length; i++) {
      if (!captured.containsKey(kRecordingOrder[i])) return i;
    }
    return null;
  }
}
