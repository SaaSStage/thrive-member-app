/// Analytics service for THRIVE Radio
///
/// Tracks station listens (start / heartbeat / end) in the `public` schema
/// (v3). user_id is the public.users.id resolved from the Clerk JWT (via
/// currentUserId). Auth events (login/logout/signup) are NOT written here —
/// the portal's Clerk webhook is the system of record for auth_events.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:radio_online/auth/config/supabase_config.dart';
import 'package:radio_online/auth/services/device_info_service.dart';
import 'package:radio_online/config/app_config_service.dart';

class AnalyticsService {
  AnalyticsService._();
  
  static final AnalyticsService _instance = AnalyticsService._();
  static AnalyticsService get instance => _instance;

  final DeviceInfoService _deviceInfo = DeviceInfoService.instance;

  /// Current active listen session ID (null if not listening)
  String? _currentListenSessionId;

  /// started_at of the current listen row, used to compute the heartbeat
  /// duration without a re-read.
  DateTime? _currentListenStartedAt;

  /// Periodic heartbeat that stamps duration_seconds on the open listen row,
  /// so a killed-mid-listen session is closed at its last-known time (orphan
  /// cleanup uses that instead of inflating to the next app open).
  Timer? _heartbeatTimer;

  /// Cached active practice_id (denormalized onto station_listens for the
  /// portal's practice-scoped reporting). Resolved once per app run.
  String? _cachedPracticeId;

  /// The user's active practice membership's practice_id. v1 takes the first
  /// active membership (the one-active-practice_client constraint makes that
  /// unambiguous for members). Returns null if none / on error — the column
  /// is nullable so a null doesn't block the insert.
  Future<String?> _resolvePracticeId() async {
    if (_cachedPracticeId != null) return _cachedPracticeId;
    try {
      final rows = await supabase
          .from('practice_memberships')
          .select('practice_id')
          .eq('status', 'active')
          .limit(1);
      if (rows.isEmpty) return null;
      return _cachedPracticeId = rows.first['practice_id'] as String?;
    } catch (e) {
      debugPrint('Analytics error (resolve practice_id): $e');
      return null;
    }
  }

  // ============================================
  // ORPHAN SESSION CLEANUP
  // ============================================

  /// Close orphaned listen sessions for the same user+device.
  /// Sets ended_at = NOW() for any rows where ended_at IS NULL.
  Future<void> closeOrphanedListenSessions(String userId, String deviceId) async {
    try {
      final openSessions = await supabase
          .from('station_listens')
          .select('id, started_at, duration_seconds')
          .eq('user_id', userId)
          .contains('device_info', {'device_id': deviceId})
          .isFilter('ended_at', null);

      for (final session in openSessions) {
        final startedAt = DateTime.parse(session['started_at'] as String);
        // Close the orphan at its LAST HEARTBEAT, not now() — the app was
        // killed mid-listen, and the last heartbeat is ~when listening
        // actually stopped (within one heartbeat interval). Falling back to
        // 0 if the session died before its first heartbeat.
        final lastDuration = (session['duration_seconds'] as int?) ?? 0;
        final endedAt = startedAt.add(Duration(seconds: lastDuration));

        await supabase
            .from('station_listens')
            .update({
              'ended_at': endedAt.toIso8601String(),
              'duration_seconds': lastDuration,
            })
            .eq('id', session['id']);
      }
    } catch (e) {
      debugPrint('Analytics error (close orphaned listen sessions): $e');
    }
  }

  // ============================================
  // STATION LISTEN TRACKING
  // ============================================

  /// Track when a user starts listening to a station
  /// Returns the session ID for later ending the session
  Future<String?> trackStationStart({
    required int stationId,
    required String stationName,
  }) async {
    debugPrint('DEBUG: trackStationStart() called - station: $stationName (id: $stationId)');
    final userId = currentUserId;
    if (userId == null) {
      debugPrint('DEBUG: trackStationStart() - no user logged in, returning null');
      return null;
    }

    // End any existing in-memory session first
    debugPrint('DEBUG: trackStationStart() - ending existing session first');
    await endCurrentListenSession();

    try {
      final deviceInfo = await _deviceInfo.getDeviceInfo();
      final deviceId = deviceInfo['device_id'] as String?;

      // Close any orphaned listen sessions from prior app runs
      if (deviceId != null) {
        await closeOrphanedListenSessions(userId, deviceId);
      }

      final response = await supabase
          .from('station_listens')
          .insert({
            'user_id': userId,
            'practice_id': await _resolvePracticeId(),
            'station_id': stationId,
            'station_name': stationName,
            'device_info': deviceInfo,
          })
          .select('id, started_at')
          .single();

      _currentListenSessionId = response['id'] as String?;
      _currentListenStartedAt = response['started_at'] != null
          ? DateTime.parse(response['started_at'] as String)
          : DateTime.now().toUtc();
      _startHeartbeat();
      return _currentListenSessionId;
    } catch (e) {
      debugPrint('Analytics error (station start): $e');
      return null;
    }
  }

  /// Track when a user stops listening (station change, pause, or app close)
  Future<void> trackStationEnd({String? sessionId}) async {
    final id = sessionId ?? _currentListenSessionId;
    if (id == null) return;

    try {
      // Get the session to calculate duration
      final session = await supabase
          .from('station_listens')
          .select('started_at, ended_at')
          .eq('id', id)
          .maybeSingle();

      if (session == null) return;
      if (session['ended_at'] != null) return;

      final startedAt = DateTime.parse(session['started_at'] as String);
      final now = DateTime.now().toUtc();
      final durationSeconds = now.difference(startedAt).inSeconds;

      await supabase
          .from('station_listens')
          .update({
            'ended_at': now.toIso8601String(),
            'duration_seconds': durationSeconds,
          })
          .eq('id', id);
    } catch (e) {
      debugPrint('Analytics error (station end): $e');
    }
  }

  /// End the current listen session if one exists
  Future<void> endCurrentListenSession() async {
    debugPrint('DEBUG: endCurrentListenSession() called - currentSessionId: $_currentListenSessionId');
    _stopHeartbeat();
    if (_currentListenSessionId != null) {
      debugPrint('DEBUG: endCurrentListenSession() - calling trackStationEnd');
      await trackStationEnd();
    } else {
      debugPrint('DEBUG: endCurrentListenSession() - no active session, skipping');
    }
    _currentListenStartedAt = null;
  }

  // ============================================
  // LISTEN HEARTBEAT
  // ============================================

  /// Start the periodic progress heartbeat for the active listen row. Interval
  /// comes from remote config (`listen_heartbeat_seconds`, default 300s).
  void _startHeartbeat() {
    _stopHeartbeat();
    final interval =
        AppConfigService.instance.getSeconds('listen_heartbeat_seconds');
    _heartbeatTimer = Timer.periodic(interval, (_) => unawaited(_heartbeat()));
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  /// Write the running duration to the open listen row. If the app is later
  /// killed, this last value is what orphan cleanup uses as the end time.
  Future<void> _heartbeat() async {
    final id = _currentListenSessionId;
    final startedAt = _currentListenStartedAt;
    if (id == null || startedAt == null) return;
    try {
      final duration = DateTime.now().toUtc().difference(startedAt).inSeconds;
      await supabase
          .from('station_listens')
          .update({'duration_seconds': duration})
          .eq('id', id);
    } catch (e) {
      // Non-fatal; the next heartbeat (or clean end) will catch up.
      debugPrint('Analytics error (heartbeat): $e');
    }
  }

  /// Check if there's an active listen session
  bool get hasActiveListenSession => _currentListenSessionId != null;

  /// Get the current listen session ID
  String? get currentListenSessionId => _currentListenSessionId;
}
