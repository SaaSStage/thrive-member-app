/// Repository for the score-preview flow. Reads `system_settings.scoring_config`
/// (singleton — cached for the process lifetime) and the user's most-recent
/// `analysis_results` row via Supabase REST. RLS handles user scoping;
/// `.eq('client_id', currentUserId)` is implicit through the Clerk JWT.
library;

import 'package:flutter/foundation.dart';

import 'package:radio_online/auth/config/supabase_config.dart';
import 'package:radio_online/score/models/analysis_result.dart';
import 'package:radio_online/score/models/scoring_config.dart';

class ScoreRepository {
  factory ScoreRepository() => _instance;
  ScoreRepository._();
  static final ScoreRepository _instance = ScoreRepository._();

  ScoringConfig? _cachedConfig;

  /// Fetch (and memoize) the scoring config singleton. Falls back to known
  /// dev defaults on error so the UI can still render with sane colors.
  Future<ScoringConfig> loadScoringConfig() async {
    final cached = _cachedConfig;
    if (cached != null) return cached;
    try {
      final row = await supabase
          .from('system_settings')
          .select('scoring_config')
          .limit(1)
          .maybeSingle();
      if (row == null || row['scoring_config'] == null) {
        return _cachedConfig = ScoringConfig.fallback();
      }
      return _cachedConfig = ScoringConfig.fromJson(
        Map<String, dynamic>.from(row['scoring_config'] as Map),
      );
    } catch (e) {
      debugPrint('ScoreRepository.loadScoringConfig fallback: $e');
      return _cachedConfig = ScoringConfig.fallback();
    }
  }

  /// Latest analysis for the calling user. Done as a two-step query so that
  /// "no submission" vs "submission analyzing" vs "RLS-blocked analysis" are
  /// distinguishable on the client side (an embedded select would collapse
  /// all of those into a single null).
  ///
  /// Returns:
  /// - [LatestScoreLoaded] — analysis_results row exists and is visible.
  /// - [LatestScorePending] — a submission exists but analyze-voice hasn't
  ///   landed a visible result yet (also covers the "RLS blocks the row
  ///   from this user" case — same UX, but logs a hint).
  /// - [LatestScoreEmpty] — the user has no voice_submissions at all.
  Future<LatestScoreState> loadLatest() async {
    try {
      // Step 1: latest voice_submission for this user (RLS scopes to owner).
      final submissions = await supabase
          .from('voice_submissions')
          .select('id, status, submitted_at')
          .order('submitted_at', ascending: false)
          .limit(1);
      if (submissions.isEmpty) return const LatestScoreEmpty();
      final sub = submissions.first;
      final submissionId = sub['id'] as String;
      final submittedAt = DateTime.parse(sub['submitted_at'] as String);

      // Step 2: matching analysis_results row by submission_id.
      final results = await supabase
          .from('analysis_results')
          .select(
            'id, submission_id, vitality_score, '
            'subscore_emotional_wellness, subscore_cognitive_clarity, '
            'subscore_physical_energy, subscore_voice_power, '
            'generated_at, shared_with_member_at, narrative_status',
          )
          .eq('submission_id', submissionId)
          .order('generated_at', ascending: false)
          .limit(1);
      if (results.isEmpty) {
        // Either the row doesn't exist yet (analyze-voice still running) or
        // RLS is hiding it from the client. We can't distinguish from here
        // without a separate diagnostic call; surface "pending" either way.
        debugPrint(
          'ScoreRepository.loadLatest: no analysis_results visible for '
          'submission $submissionId (status=${sub['status']}). Either '
          'analyze-voice has not yet landed a row, or the RLS policy on '
          'analysis_results is hiding it from the client. Verify by querying '
          "from a service-role context: analysis_results?submission_id=eq.$submissionId.",
        );
        return LatestScorePending(
          submissionId: submissionId,
          submittedAt: submittedAt,
        );
      }
      return LatestScoreLoaded(
        result: AnalysisResult.fromJson(
          Map<String, dynamic>.from(results.first),
        ),
      );
    } catch (e) {
      debugPrint('ScoreRepository.loadLatest error: $e');
      return LatestScoreError(message: '$e');
    }
  }
}

sealed class LatestScoreState {
  const LatestScoreState();
}

class LatestScoreEmpty extends LatestScoreState {
  const LatestScoreEmpty();
}

class LatestScorePending extends LatestScoreState {
  const LatestScorePending({required this.submissionId, required this.submittedAt});
  final String submissionId;
  final DateTime submittedAt;
}

class LatestScoreLoaded extends LatestScoreState {
  const LatestScoreLoaded({required this.result});
  final AnalysisResult result;
}

class LatestScoreError extends LatestScoreState {
  const LatestScoreError({required this.message});
  final String message;
}
