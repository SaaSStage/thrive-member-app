/// Screen E — review the three captured recordings before submitting.
/// Each row: label, duration (+ passage code for the reading), validation
/// status, play/stop toggle, re-record. "Submit All Three" is enabled here
/// once all three pass validation; the actual upload action lands in 6c.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:just_audio/just_audio.dart';

import 'package:radio_online/voice/cubit/voice_submission_cubit.dart';
import 'package:radio_online/voice/data/voice_recording_type.dart';

class VoiceReviewView extends StatefulWidget {
  const VoiceReviewView({super.key});

  @override
  State<VoiceReviewView> createState() => _VoiceReviewViewState();
}

class _VoiceReviewViewState extends State<VoiceReviewView> {
  /// A transient player just for previewing local recordings. Separate from
  /// the live-radio playback stack. (iOS audio-session coexistence is 6d.)
  final AudioPlayer _player = AudioPlayer();

  VoiceRecordingType? _playingType;
  StreamSubscription<PlayerState>? _stateSub;

  @override
  void initState() {
    super.initState();
    _stateSub = _player.playerStateStream.listen((s) {
      if (s.processingState == ProcessingState.completed) {
        _player.stop();
        if (mounted) setState(() => _playingType = null);
      }
    });
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  Future<void> _togglePlay(CapturedRecording rec) async {
    if (_playingType == rec.type) {
      await _player.stop();
      if (mounted) setState(() => _playingType = null);
      return;
    }
    try {
      await _player.stop();
      await _player.setFilePath(rec.filePath);
      if (!mounted) return;
      setState(() => _playingType = rec.type);
      await _player.play();
    } catch (e) {
      if (!mounted) return;
      setState(() => _playingType = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not play recording: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<VoiceSubmissionCubit>().state;
    final recordings = state.orderedRecordings;
    final allPass = recordings.length == 3 &&
        recordings.every((r) => r.validation.passed);

    return Scaffold(
      appBar: AppBar(title: const Text('Review Your Submission')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text(
                    'Listen back and submit',
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tap to preview each recording. Re-record any that don’t '
                    'sound right.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.textTheme.bodySmall?.color
                          ?.withValues(alpha: 0.65),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (state.uploadError != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline,
                              color: theme.colorScheme.error),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Upload failed: ${state.uploadError}',
                              style:
                                  TextStyle(color: theme.colorScheme.error),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  for (final rec in recordings) _row(theme, rec),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      // Upload action lands in 6c; gate-by-validation logic is
                      // already here so wiring 6c is just swapping the onPressed.
                      onPressed: allPass ? () => _onSubmit(context) : null,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Submit All Three'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    child: const Text('Cancel and start over'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onSubmit(BuildContext context) async {
    await _player.stop();
    if (!context.mounted) return;
    setState(() => _playingType = null);
    // ignore: use_build_context_synchronously
    context.read<VoiceSubmissionCubit>().submit();
  }

  Widget _row(ThemeData theme, CapturedRecording rec) {
    final isPlaying = _playingType == rec.type;
    final passed = rec.validation.passed;
    final seconds = (rec.duration.inMilliseconds / 1000).toStringAsFixed(1);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Icon(
              passed ? Icons.check_circle : Icons.error,
              color: passed ? Colors.green : theme.colorScheme.error,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    rec.type.shortLabel,
                    style: theme.textTheme.titleMedium,
                  ),
                  Text(
                    '${seconds}s'
                    '${rec.passageCode != null ? ' · ${rec.passageCode}' : ''}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.textTheme.bodySmall?.color
                          ?.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(isPlaying ? Icons.stop : Icons.play_arrow),
              tooltip: isPlaying ? 'Stop' : 'Play',
              onPressed: () => _togglePlay(rec),
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Re-record',
              onPressed: () async {
                await _player.stop();
                if (!context.mounted) return;
                setState(() => _playingType = null);
                context.read<VoiceSubmissionCubit>().reRecord(rec.type);
              },
            ),
          ],
        ),
      ),
    );
  }
}
