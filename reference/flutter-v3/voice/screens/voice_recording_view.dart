/// Screens B / C / D — the per-recording capture UI, parameterized by the
/// current [VoiceRecordingType]. Owns the local recording state (mic
/// start/stop, countdown) and reports the finished file back to
/// [VoiceSubmissionCubit.captureRecording], which advances the flow.
///
/// Must be given a unique [Key] per recording (the flow host keys it by
/// currentIndex) so it fully resets between recordings.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:radio_online/voice/cubit/voice_submission_cubit.dart';
import 'package:radio_online/voice/data/voice_recording_type.dart';
import 'package:radio_online/voice/services/recorder_service.dart';
import 'package:radio_online/voice/services/voice_validator.dart';

class VoiceRecordingView extends StatefulWidget {
  const VoiceRecordingView({super.key});

  @override
  State<VoiceRecordingView> createState() => _VoiceRecordingViewState();
}

class _VoiceRecordingViewState extends State<VoiceRecordingView> {
  final _recorder = RecorderService();
  final _validator = const VoiceValidator();

  bool _isRecording = false;
  bool _busy = false;
  Duration _elapsed = Duration.zero;
  Timer? _ticker;
  String? _error;

  late final VoiceSubmissionState _flowState;
  late final VoiceRecordingType _type;

  @override
  void initState() {
    super.initState();
    _flowState = context.read<VoiceSubmissionCubit>().state;
    _type = _flowState.currentType;
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _recorder.start(namePrefix: _type.dbValue);
      if (!mounted) return;
      setState(() {
        _isRecording = true;
        _busy = false;
        _elapsed = Duration.zero;
      });
      _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (!mounted) return;
        final next = _elapsed + const Duration(milliseconds: 100);
        setState(() => _elapsed = next);
        if (next >= _type.targetDuration) {
          _stop(); // auto-stop at target
        }
      });
    } on RecorderPermissionDeniedException {
      _fail('Microphone permission is required to record.');
    } catch (e) {
      _fail('Could not start recording: $e');
    }
  }

  Future<void> _stop() async {
    _ticker?.cancel();
    _ticker = null;
    if (!_isRecording) return;
    setState(() {
      _isRecording = false;
      _busy = true;
    });
    try {
      final path = await _recorder.stop();
      if (!mounted) return;
      if (path == null) {
        _fail('Recording failed — no file produced. Please try again.');
        return;
      }

      // On-device validation (strict pass/fail in v1). A failure keeps the
      // user on this screen with a specific reason; the bad file is discarded
      // so a retry overwrites cleanly.
      final result = await _validator.validate(path, _type);
      if (!mounted) return;
      if (!result.passed) {
        // VoiceValidator already logs the measured values in debug mode.
        await _discard(path);
        _fail(result.firstFailureMessage ??
            'That recording didn’t pass our quality check. Please try again.');
        return;
      }

      final captured = CapturedRecording(
        type: _type,
        filePath: path,
        duration: _elapsed,
        validation: result,
        passageCode: _type == VoiceRecordingType.readingPassage
            ? _flowState.passage.code
            : null,
        languageUsed: _type == VoiceRecordingType.readingPassage
            ? _flowState.passage.language
            : null,
      );
      // Advancing the flow tears down this view (the host re-keys), so don't
      // touch local state after this call.
      context.read<VoiceSubmissionCubit>().captureRecording(captured);
    } catch (e) {
      _fail('Could not finish recording: $e');
    }
  }

  Future<void> _discard(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {
      // Best-effort cleanup; a leftover file isn't fatal.
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _isRecording = false;
      _busy = false;
      _error = message;
    });
  }

  void _playExample() {
    // Audio example WAVs (example_ah.wav / example_pataka.wav) are content
    // assets that still need to be supplied; bundling + playback lands with
    // those files. Surface a clear placeholder rather than a dead button.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Example audio coming soon.'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remaining = _type.targetDuration - _elapsed;
    final secondsLeft =
        remaining.isNegative ? 0 : (remaining.inMilliseconds / 1000).ceil();
    final isReading = _type == VoiceRecordingType.readingPassage;

    return Scaffold(
      appBar: AppBar(
        title: Text('Recording ${_type.stepNumber} of 3'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _type.title,
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                _type.instruction,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.textTheme.bodyMedium?.color
                      ?.withValues(alpha: 0.7),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),

              if (isReading) _passageCard(theme),

              const SizedBox(height: 24),

              // Countdown
              Text(
                '$secondsLeft',
                style: theme.textTheme.displayLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: _isRecording ? Colors.red : theme.primaryColor,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
                textAlign: TextAlign.center,
              ),
              Text(
                _isRecording ? 'seconds left' : 'seconds',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.textTheme.bodySmall?.color
                      ?.withValues(alpha: 0.6),
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 28),

              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.error),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 16),
              ],

              ElevatedButton.icon(
                onPressed:
                    _busy ? null : (_isRecording ? _stop : _start),
                icon: Icon(_isRecording ? Icons.stop : Icons.mic),
                label: Text(
                  _isRecording ? 'Stop' : 'Start recording',
                ),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  backgroundColor:
                      _isRecording ? Colors.red : theme.primaryColor,
                  foregroundColor: Colors.white,
                ),
              ),

              if (_type.hasAudioExample && !_isRecording) ...[
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: _busy ? null : _playExample,
                  icon: const Icon(Icons.volume_up),
                  label: const Text('Hear example'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _passageCard(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _flowState.passage.title,
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.primaryColor,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _flowState.passage.body,
            style: theme.textTheme.titleMedium?.copyWith(height: 1.5),
          ),
        ],
      ),
    );
  }
}
