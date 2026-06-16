/// Host widget for the guided voice-submission flow. Renders the right
/// screen based on [VoiceSubmissionCubit]'s step. Auto-advance between
/// recordings is trivial here: the cubit changes step and this rebuilds.
///
/// Chunk 6a: intro (Screen A) + recording (Screens B/C/D) + a minimal
/// review placeholder. Full review with playback + re-record (6b),
/// upload + success (6c) replace the placeholder.
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:radio_online/voice/cubit/voice_submission_cubit.dart';
import 'package:radio_online/voice/screens/voice_recording_view.dart';
import 'package:radio_online/voice/screens/voice_review_view.dart';

class VoiceSubmissionFlow extends StatelessWidget {
  const VoiceSubmissionFlow({required this.preferredLanguage, super.key});

  /// The user's preferred_language ("en"/"es"); selects the passage pool.
  final String preferredLanguage;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) =>
          VoiceSubmissionCubit(preferredLanguage: preferredLanguage),
      child: const _FlowBody(),
    );
  }
}

class _FlowBody extends StatelessWidget {
  const _FlowBody();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<VoiceSubmissionCubit, VoiceSubmissionState>(
      builder: (context, state) {
        return switch (state.step) {
          VoiceFlowStep.intro => const _IntroView(),
          // Key by currentIndex so the recording view fully resets between
          // recordings (fresh recorder, timer, local state).
          VoiceFlowStep.recording =>
            VoiceRecordingView(key: ValueKey(state.currentIndex)),
          VoiceFlowStep.review => const VoiceReviewView(),
          VoiceFlowStep.uploading => _UploadingView(
              uploaded: state.uploadedCount,
              total: state.captured.length,
            ),
          VoiceFlowStep.success => const _SuccessView(),
        };
      },
    );
  }
}

class _IntroView extends StatelessWidget {
  const _IntroView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Voice Sample Submission')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Icon(Icons.graphic_eq, size: 80, color: theme.primaryColor),
              const SizedBox(height: 32),
              Text(
                'Record three short samples',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                "We'll record three short audio samples. Total time is about "
                '90 seconds. Find a quiet space and have a glass of water '
                'nearby.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.textTheme.bodyLarge?.color
                      ?.withValues(alpha: 0.7),
                ),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () =>
                      context.read<VoiceSubmissionCubit>().begin(),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: theme.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Continue'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('Cancel'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _UploadingView extends StatelessWidget {
  const _UploadingView({required this.uploaded, required this.total});
  final int uploaded;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // While files upload we show "Uploading N of 3"; after all files are up,
    // the DB inserts + analyze-voice trigger run, so show a finalizing state.
    final stillUploading = uploaded < total;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(strokeWidth: 3),
                ),
                const SizedBox(height: 28),
                Text(
                  stillUploading
                      ? 'Uploading ${uploaded + 1} of $total…'
                      : 'Finishing up…',
                  style: theme.textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Please keep the app open.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.textTheme.bodySmall?.color
                        ?.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            children: [
              const Spacer(),
              Icon(Icons.check_circle, size: 96, color: Colors.green.shade600),
              const SizedBox(height: 24),
              Text(
                'Sample submitted',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'Your scores will appear shortly. You can check them under '
                '“My Score”.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.textTheme.bodyLarge?.color
                      ?.withValues(alpha: 0.7),
                ),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: theme.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Done'),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
