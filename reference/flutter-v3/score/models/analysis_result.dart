/// Mobile-side projection of an `analysis_results` row.
///
/// v1 reads only the five numeric score columns + a couple of housekeeping
/// fields. The rich payload (`fired_signatures`, `narratives`,
/// `recommended_protocols`, `score_breakdown`, `trend_data`) is intentionally
/// not surfaced in v1 — chunk 7 is the "basic score preview" per the LOE
/// plan; full report rendering is v2.
library;

class AnalysisResult {
  const AnalysisResult({
    required this.id,
    required this.submissionId,
    required this.vitalityScore,
    required this.emotionalWellness,
    required this.cognitiveClarity,
    required this.physicalEnergy,
    required this.voicePower,
    required this.generatedAt,
    this.sharedWithMemberAt,
    this.narrativeStatus,
  });

  factory AnalysisResult.fromJson(Map<String, dynamic> json) {
    return AnalysisResult(
      id: json['id'] as String,
      submissionId: json['submission_id'] as String,
      vitalityScore: (json['vitality_score'] as num).toInt(),
      emotionalWellness:
          (json['subscore_emotional_wellness'] as num).toInt(),
      cognitiveClarity:
          (json['subscore_cognitive_clarity'] as num).toInt(),
      physicalEnergy: (json['subscore_physical_energy'] as num).toInt(),
      voicePower: (json['subscore_voice_power'] as num).toInt(),
      generatedAt: DateTime.parse(json['generated_at'] as String),
      sharedWithMemberAt: json['shared_with_member_at'] != null
          ? DateTime.parse(json['shared_with_member_at'] as String)
          : null,
      narrativeStatus: json['narrative_status'] as String?,
    );
  }

  final String id;
  final String submissionId;
  final int vitalityScore;
  final int emotionalWellness;
  final int cognitiveClarity;
  final int physicalEnergy;
  final int voicePower;
  final DateTime generatedAt;
  final DateTime? sharedWithMemberAt;
  final String? narrativeStatus;
}
