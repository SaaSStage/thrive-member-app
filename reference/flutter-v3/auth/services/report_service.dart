/// Report service for THRIVE Radio
///
/// Submits user-submitted diagnostic reports to `public.user_reports` (v3).
/// status defaults to 'open' server-side. Enriches the report with current
/// playback state, connectivity, a quick stream probe (HEAD with 3s timeout),
/// and running playback stats.
library;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:radio_online/auth/config/supabase_config.dart';
import 'package:radio_online/auth/services/analytics_service.dart';
import 'package:radio_online/cubits/player/player_cubit.dart';

class ReportService {
  ReportService._();

  static final ReportService _instance = ReportService._();
  static ReportService get instance => _instance;

  /// Submit a user report. Returns true on success.
  Future<bool> submitReport({
    required String message,
    required PlayerCubit playerCubit,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    final connectivity = await _readConnectivity();
    final station = playerCubit.currentlyPlayingStation;
    final streamProbe = await _probeStream(station?.radioUrl);

    try {
      await supabase.from('user_reports').insert({
        'user_id': userId,
        'message': message,
        'listen_session_id': AnalyticsService.instance.currentListenSessionId,
        'player_state': playerCubit.currentPlayerStateName(),
        'connectivity': connectivity,
        'stream_probe': streamProbe,
        'playback_stats': playerCubit.getPlaybackStats(),
      });
      return true;
    } catch (e) {
      debugPrint('ReportService submit error: $e');
      return false;
    }
  }

  Future<String> _readConnectivity() async {
    try {
      final results = await Connectivity().checkConnectivity();
      if (results.contains(ConnectivityResult.wifi)) return 'wifi';
      if (results.contains(ConnectivityResult.mobile)) return 'mobile';
      if (results.contains(ConnectivityResult.ethernet)) return 'ethernet';
      if (results.contains(ConnectivityResult.none)) return 'none';
      return 'other';
    } catch (_) {
      return 'unknown';
    }
  }

  Future<Map<String, dynamic>?> _probeStream(String? url) async {
    if (url == null || url.isEmpty) return null;
    final stopwatch = Stopwatch()..start();
    try {
      final response = await http
          .head(Uri.parse(url))
          .timeout(const Duration(seconds: 3));
      stopwatch.stop();
      return {
        'rtt_ms': stopwatch.elapsedMilliseconds,
        'http_status': response.statusCode,
      };
    } catch (e) {
      stopwatch.stop();
      return {
        'rtt_ms': stopwatch.elapsedMilliseconds,
        'error': e.toString(),
      };
    }
  }
}
