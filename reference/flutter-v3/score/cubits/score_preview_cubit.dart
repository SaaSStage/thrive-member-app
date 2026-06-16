/// State machine for [ScorePreviewScreen]. Loads the user's latest
/// analysis_result + scoring_config in parallel; emits a sealed-class state
/// the screen renders against.
library;

import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:radio_online/score/models/analysis_result.dart';
import 'package:radio_online/score/models/scoring_config.dart';
import 'package:radio_online/score/services/score_repository.dart';

sealed class ScorePreviewState {
  const ScorePreviewState();
}

class ScorePreviewInitial extends ScorePreviewState {
  const ScorePreviewInitial();
}

class ScorePreviewLoading extends ScorePreviewState {
  const ScorePreviewLoading();
}

class ScorePreviewEmpty extends ScorePreviewState {
  const ScorePreviewEmpty({required this.config});
  final ScoringConfig config;
}

class ScorePreviewPending extends ScorePreviewState {
  const ScorePreviewPending({
    required this.config,
    required this.submissionId,
    required this.submittedAt,
  });
  final ScoringConfig config;
  final String submissionId;
  final DateTime submittedAt;
}

class ScorePreviewLoaded extends ScorePreviewState {
  const ScorePreviewLoaded({required this.result, required this.config});
  final AnalysisResult result;
  final ScoringConfig config;
}

class ScorePreviewError extends ScorePreviewState {
  const ScorePreviewError({required this.message});
  final String message;
}

class ScorePreviewCubit extends Cubit<ScorePreviewState> {
  ScorePreviewCubit({ScoreRepository? repository})
      : _repo = repository ?? ScoreRepository(),
        super(const ScorePreviewInitial());

  final ScoreRepository _repo;

  Future<void> load() async {
    emit(const ScorePreviewLoading());
    try {
      final config = await _repo.loadScoringConfig();
      final latest = await _repo.loadLatest();
      switch (latest) {
        case LatestScoreLoaded(:final result):
          emit(ScorePreviewLoaded(result: result, config: config));
        case LatestScorePending(:final submissionId, :final submittedAt):
          emit(ScorePreviewPending(
            config: config,
            submissionId: submissionId,
            submittedAt: submittedAt,
          ));
        case LatestScoreEmpty():
          emit(ScorePreviewEmpty(config: config));
        case LatestScoreError(:final message):
          emit(ScorePreviewError(message: message));
      }
    } catch (e) {
      emit(ScorePreviewError(message: '$e'));
    }
  }
}
