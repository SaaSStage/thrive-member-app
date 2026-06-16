/// Score preview screen (chunk 7 — basic preview only, NOT the full report).
///
/// Renders the user's latest [AnalysisResult] as a big Vitality card +
/// four sub-score tiles. Full narrative report, recommended protocols,
/// trend chart, and entitlement gating are v2.
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:radio_online/score/cubits/score_preview_cubit.dart';
import 'package:radio_online/score/score_descriptions.dart';
import 'package:radio_online/score/widgets/score_card.dart';

class ScorePreviewScreen extends StatelessWidget {
  const ScorePreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ScorePreviewCubit()..load(),
      child: const _ScorePreviewBody(),
    );
  }
}

class _ScorePreviewBody extends StatelessWidget {
  const _ScorePreviewBody();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your Score'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<ScorePreviewCubit>().load(),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: SafeArea(
        child: BlocBuilder<ScorePreviewCubit, ScorePreviewState>(
          builder: (context, state) {
            return switch (state) {
              ScorePreviewInitial() ||
              ScorePreviewLoading() =>
                const _LoadingView(),
              ScorePreviewEmpty() => const _EmptyView(),
              ScorePreviewPending(:final submittedAt) =>
                _PendingView(submittedAt: submittedAt),
              ScorePreviewLoaded(:final result, :final config) =>
                _LoadedView(
                  result: result,
                  thresholds: config.thresholds,
                ),
              ScorePreviewError(:final message) =>
                _ErrorView(message: message),
            };
          },
        ),
      ),
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.graphic_eq,
              size: 72,
              color: Theme.of(context).primaryColor.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 24),
            Text(
              'No voice samples yet',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Submit a voice sample to see your Vitality score and four '
              'wellness sub-scores.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.color
                        ?.withValues(alpha: 0.7),
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingView extends StatelessWidget {
  const _PendingView({required this.submittedAt});
  final DateTime submittedAt;

  @override
  Widget build(BuildContext context) {
    final waited = DateTime.now().difference(submittedAt);
    return Center(
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
            const SizedBox(height: 24),
            Text(
              'Analyzing your voice…',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              waited.inMinutes >= 5
                  ? 'This is taking longer than usual. Pull to refresh in '
                      'a moment.'
                  : 'Your most recent submission is still being processed. '
                      'This usually takes about a minute.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.color
                        ?.withValues(alpha: 0.7),
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadedView extends StatelessWidget {
  const _LoadedView({required this.result, required this.thresholds});

  final dynamic result; // AnalysisResult — kept dynamic to dodge a redundant import here
  final dynamic thresholds; // TierThresholds

  @override
  Widget build(BuildContext context) {
    // Pull values out into locals for readability.
    final vitality = result.vitalityScore as int;
    final emotional = result.emotionalWellness as int;
    final cognitive = result.cognitiveClarity as int;
    final physical = result.physicalEnergy as int;
    final voice = result.voicePower as int;
    final generatedAt = result.generatedAt as DateTime;

    return RefreshIndicator(
      onRefresh: () => context.read<ScorePreviewCubit>().load(),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        children: [
          ScoreCard(
            label: 'Vitality',
            score: vitality,
            thresholds: thresholds,
            hero: true,
            info: vitalityInfo,
          ),
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Sub-scores',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          const SizedBox(height: 12),
          // 2x2 grid of sub-score cards.
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.1,
            children: [
              ScoreCard(
                label: 'Emotional\nWellness',
                score: emotional,
                thresholds: thresholds,
                info: emotionalWellnessInfo,
              ),
              ScoreCard(
                label: 'Cognitive\nClarity',
                score: cognitive,
                thresholds: thresholds,
                info: cognitiveClarityInfo,
              ),
              ScoreCard(
                label: 'Physical\nEnergy',
                score: physical,
                thresholds: thresholds,
                info: physicalEnergyInfo,
              ),
              ScoreCard(
                label: 'Voice\nPower',
                score: voice,
                thresholds: thresholds,
                info: voicePowerInfo,
              ),
            ],
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'Last analyzed ${_relativeTime(generatedAt)}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.color
                        ?.withValues(alpha: 0.6),
                  ),
            ),
          ),
        ],
      ),
    );
  }

  static String _relativeTime(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 30) return '${diff.inDays}d ago';
    final months = (diff.inDays / 30).floor();
    return '${months}mo ago';
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 56,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              'Couldn’t load your score',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => context.read<ScorePreviewCubit>().load(),
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
