/// Parsed view of `system_settings.scoring_config` — the singleton config
/// row the portal owns. The mobile app reads it once at startup-of-flow time
/// (it's not high-churn) to know tier thresholds for crown / color coding.
///
/// Only `tier_thresholds` matters for v1 score preview. The other keys
/// (subscore_weights, severity_deductions, baseline_ramp) are consumed
/// server-side by generate-report; mobile carries the raw payload through
/// for v2 / debugging but doesn't act on them.
library;

class ScoringConfig {
  const ScoringConfig({required this.thresholds, this.raw});

  factory ScoringConfig.fromJson(Map<String, dynamic> json) {
    final t = (json['tier_thresholds'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ScoringConfig(
      thresholds: TierThresholds(
        redMax: (t['red_max'] as num?)?.toInt() ?? 59,
        yellowMin: (t['yellow_min'] as num?)?.toInt() ?? 60,
        greenMin: (t['green_min'] as num?)?.toInt() ?? 80,
        crownMin: (t['crown_min'] as num?)?.toInt() ?? 85,
      ),
      raw: json,
    );
  }

  /// Sensible fallback when the network call to fetch the row fails. Matches
  /// the v3 dev values (red ≤59, yellow 60-79, green ≥80, crown ≥85) so
  /// nothing renders wildly off-spec if we briefly run without config.
  factory ScoringConfig.fallback() => const ScoringConfig(
        thresholds: TierThresholds(
          redMax: 59,
          yellowMin: 60,
          greenMin: 80,
          crownMin: 85,
        ),
      );

  final TierThresholds thresholds;
  final Map<String, dynamic>? raw;
}

class TierThresholds {
  const TierThresholds({
    required this.redMax,
    required this.yellowMin,
    required this.greenMin,
    required this.crownMin,
  });

  /// Inclusive upper bound for red tier (e.g. 59 → red is [0..59]).
  final int redMax;

  /// Inclusive lower bound for yellow tier.
  final int yellowMin;

  /// Inclusive lower bound for green tier.
  final int greenMin;

  /// Inclusive lower bound to show the crown icon.
  final int crownMin;

  ScoreTier tierFor(int score) {
    if (score >= greenMin) return ScoreTier.green;
    if (score >= yellowMin) return ScoreTier.yellow;
    return ScoreTier.red;
  }

  bool isCrowned(int score) => score >= crownMin;
}

enum ScoreTier { red, yellow, green }
