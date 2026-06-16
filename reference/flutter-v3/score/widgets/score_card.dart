/// Reusable card displaying a single score (Vitality or one of the four
/// sub-scores). Colors by tier, crowns at the crown threshold.
library;

import 'package:flutter/material.dart';

import 'package:radio_online/score/models/scoring_config.dart';
import 'package:radio_online/score/score_descriptions.dart';

/// Single-score card. Used in two sizes:
/// - "hero" for the top Vitality score (large numeric)
/// - "compact" for the 2x2 grid of sub-scores (smaller numeric + label)
class ScoreCard extends StatelessWidget {
  const ScoreCard({
    required this.label,
    required this.score,
    required this.thresholds,
    this.hero = false,
    this.info,
    super.key,
  });

  final String label;
  final int score;
  final TierThresholds thresholds;
  final bool hero;

  /// When non-null, a tappable info icon is shown in the card corner that
  /// opens a short popover explaining what this score represents.
  final ScoreInfo? info;

  @override
  Widget build(BuildContext context) {
    final tier = thresholds.tierFor(score);
    final color = _colorForTier(tier);
    final crowned = thresholds.isCrowned(score);
    final theme = Theme.of(context);
    final scoreStyle = (hero
            ? theme.textTheme.displayLarge
            : theme.textTheme.displayMedium)
        ?.copyWith(
      color: color,
      fontWeight: FontWeight.bold,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    final card = Container(
      padding: EdgeInsets.symmetric(
        horizontal: hero ? 24 : 16,
        vertical: hero ? 28 : 18,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(hero ? 20 : 16),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 1.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: (hero
                          ? theme.textTheme.titleLarge
                          : theme.textTheme.titleMedium)
                      ?.copyWith(fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
              ),
              if (crowned) ...[
                SizedBox(width: hero ? 12 : 8),
                Icon(
                  Icons.emoji_events,
                  color: const Color(0xFFD4AF37), // brand-neutral gold
                  size: hero ? 28 : 20,
                ),
              ],
            ],
          ),
          SizedBox(height: hero ? 12 : 6),
          Text('$score', style: scoreStyle),
        ],
      ),
    );

    if (info == null) return card;

    // Overlay a tappable info icon in the top-right corner.
    return Stack(
      children: [
        card,
        Positioned(
          top: hero ? 8 : 4,
          right: hero ? 8 : 4,
          child: IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: BoxConstraints.tightFor(
              width: hero ? 40 : 32,
              height: hero ? 40 : 32,
            ),
            iconSize: hero ? 22 : 18,
            color: color.withValues(alpha: 0.7),
            icon: const Icon(Icons.info_outline),
            tooltip: 'What does ${info!.title} mean?',
            onPressed: () => _showInfo(context, info!),
          ),
        ),
      ],
    );
  }

  static void _showInfo(BuildContext context, ScoreInfo info) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(info.title),
        content: Text(info.description),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  static Color _colorForTier(ScoreTier tier) {
    switch (tier) {
      case ScoreTier.green:
        return const Color(0xFF2E7D32);
      case ScoreTier.yellow:
        return const Color(0xFFF59E0B);
      case ScoreTier.red:
        return const Color(0xFFC62828);
    }
  }
}
