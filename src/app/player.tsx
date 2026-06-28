/**
 * Full-screen Now Playing (presented as a modal). Live radio: large artwork,
 * title/artist from the AzuraCast now-playing poll, LIVE indicator, play/pause.
 * No scrubber/seek — it's a live stream.
 *
 * When the WHOOP band is connected (wearable-store) the transport row shows a
 * pulse icon (left of play/pause). Tapping it arms live-HRV capture; tapping
 * again stops and saves. The HRV inline card and "Stop capture & save" button
 * appear while armed, exactly as before — no modal, no sheet.
 */
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSaveHrvSession } from '@/api/hrv';
import { radioPlayer, togglePlayPause } from '@/audio/player';
import { Sparkline } from '@/components/hrv/sparkline';
import { ArtTile } from '@/components/ui/art-tile';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLiveHrvControls } from '@/hrv/live-hrv-provider';
import { useHrvStore } from '@/stores/hrv-store';
import { usePlayerStore } from '@/stores/player-store';
import { useWearableStore } from '@/stores/wearable-store';

/** Format elapsed seconds as mm:ss for the session timer. */
function fmtTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function NowPlaying() {
  const t = useTheme();
  const router = useRouter();
  const activeStation = usePlayerStore((s) => s.activeStation);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const status = useAudioPlayerStatus(radioPlayer);
  const connected = useWearableStore((s) => s.connected);

  // HRV store selectors
  const armed = useHrvStore((s) => s.armed);
  const hrvStatus = useHrvStore((s) => s.status);
  const liveRmssd = useHrvStore((s) => s.liveRmssd);
  const bpm = useHrvStore((s) => s.bpm);
  const recent = useHrvStore((s) => s.recent);
  const stale = useHrvStore((s) => s.stale);
  const hrvError = useHrvStore((s) => s.error);
  // Raw R-R count — the unambiguous "live HRV has actually started" signal.
  const rrCount = useHrvStore((s) => s.rrAll.length);

  const { stopCapture, reconnect } = useLiveHrvControls();
  const saveHrvSession = useSaveHrvSession();

  // Session elapsed timer (counts up from 0, driven by a 1s interval).
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // Nothing playing (e.g., stopped while open) — dismiss.
  useEffect(() => {
    if (!activeStation) router.back();
  }, [activeStation, router]);

  // Manage the session elapsed timer: start when tracking, stop otherwise.
  useEffect(() => {
    if (hrvStatus === 'tracking') {
      if (timerRef.current) return; // already running
      elapsedRef.current = 0;
      setElapsedSecs(0);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSecs(elapsedRef.current);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hrvStatus]);

  async function handleStopCapture() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const summary = await stopCapture();
    if (summary) {
      try {
        const row = await saveHrvSession.mutateAsync(summary);
        router.replace({ pathname: '/hrv-summary', params: { id: row.id } } as Href);
      } catch {
        // If save fails, still navigate back rather than hanging.
        router.back();
      }
    } else {
      router.back();
    }
  }

  function handlePulsePress() {
    if (!activeStation) return;
    if (armed) {
      void handleStopCapture();
    } else {
      useHrvStore.getState().arm({
        id: activeStation.id,
        code: activeStation.code ?? null,
        name: activeStation.name,
      });
    }
  }

  if (!activeStation) return <View style={{ flex: 1, backgroundColor: t.background }} />;

  const title = nowPlaying?.title ?? activeStation.name;
  const artist = nowPlaying?.artist ?? 'THRIVE Radio';
  const buffering = status.isBuffering && !status.playing;

  // Card + Stop button show through the whole working phase (incl. the ~30s
  // "stabilising" wait before R-R starts). On a genuine failure (no-rr/error)
  // the card hides and inline error text appears below it.
  const isCapturing = armed && (
    hrvStatus === 'scanning' ||
    hrvStatus === 'connecting' ||
    hrvStatus === 'tracking'
  );
  // Live HRV is actually flowing once we have enough beats to compute RMSSD.
  const liveReady = hrvStatus === 'tracking' && rrCount >= 2 && liveRmssd != null;

  // Inline error message when armed but BLE needs user action.
  const hasError = armed && (hrvStatus === 'error' || hrvStatus === 'no-rr');
  const inlineErrorText =
    hrvError === 'permission-denied'
      ? 'Allow Bluetooth for THRIVE in Settings.'
      : hrvError === 'bluetooth-off'
        ? 'Turn on Bluetooth to reach your WHOOP.'
        : hrvError === 'not-found'
          ? 'No WHOOP found — make sure it\'s on and broadcasting.'
          : hrvStatus === 'no-rr'
            ? 'Connected — turn on Broadcast Heart Rate in the WHOOP app.'
            : 'Couldn\'t reach your WHOOP — check it\'s on and broadcasting.';

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          <Pressable style={styles.grabberRow} onPress={() => router.back()} hitSlop={16}>
            <View style={[styles.grabber, { backgroundColor: t.textTertiary }]} />
          </Pressable>

          <View style={styles.artWrap}>
            <ArtTile seed={activeStation.code ?? activeStation.id} style={styles.art} radius={Radius.lg} />
          </View>

          <View style={styles.info}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.artist, { color: t.textSecondary }]} numberOfLines={1}>
              {artist}
            </Text>
            <View style={styles.liveRow}>
              <Text style={[styles.live, { color: t.live }]}>● LIVE</Text>
            </View>
          </View>

          {/* HRV inline card — shown when armed and BLE is active */}
          {isCapturing ? (
            <View style={[styles.hrvCard, { borderColor: 'rgba(94,234,212,0.4)' }]}>
              {liveReady ? (
                /* Live HRV — real R-R is flowing */
                <>
                  <View style={styles.hrvTopRow}>
                    <Text style={[styles.hrvLabel, { color: t.live }]}>
                      <Text style={[styles.liveDot, { color: t.live }]}>● </Text>
                      LIVE HRV · capturing
                    </Text>
                    <Text style={[styles.hrvTimer, { color: t.textTertiary }]}>
                      {fmtTimer(elapsedSecs)}
                    </Text>
                  </View>
                  <View style={styles.hrvMidRow}>
                    <View style={styles.hrvNumeralGroup}>
                      <Text
                        style={[
                          styles.hrvNumeral,
                          { color: stale ? t.textTertiary : t.text },
                        ]}>
                        {liveRmssd != null ? Math.round(liveRmssd) : '–'}
                      </Text>
                      <Text style={[styles.hrvUnit, { color: t.textSecondary }]}>ms RMSSD</Text>
                    </View>
                    <View style={styles.hrvStateGroup}>
                      <Text style={[styles.hrvCoherent, { color: t.live }]}>
                        {stale ? 'Hold still' : 'Coherent'}
                      </Text>
                      {bpm != null ? (
                        <Text style={[styles.hrvBpm, { color: t.textSecondary }]}>
                          {Math.round(bpm)} bpm
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.sparkWrap, { opacity: stale ? 0.4 : 1 }]}>
                    <Sparkline data={recent} color="#5eead4" />
                  </View>
                </>
              ) : (
                /* Stabilising — card shows immediately; R-R begins ~30s in. */
                <View style={styles.hrvConnecting}>
                  <Ionicons name="pulse-outline" size={22} color={t.live} />
                  <Text style={[styles.hrvConnectingText, { color: t.textSecondary }]}>
                    Stabilizing — keep still, HRV starts in ~30 seconds
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Inline error — non-blocking, dismissible by stopping via the pulse icon */}
          {hasError ? (
            <View style={[styles.hrvCard, { borderColor: 'rgba(94,234,212,0.2)' }]}>
              <Text style={[styles.inlineError, { color: t.textSecondary }]}>
                {inlineErrorText}
              </Text>
              <Pressable onPress={() => void reconnect()} style={styles.retryRow}>
                <Text style={[styles.retryText, { color: t.live }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Stop capture & save button — position:relative + zIndex to sit above aura */}
          {isCapturing ? (
            <View style={[styles.stopRow, { position: 'relative', zIndex: 1 }]}>
              <Pressable
                style={styles.stopBtn}
                onPress={() => void handleStopCapture()}
                disabled={saveHrvSession.isPending}>
                <Ionicons name="stop" size={16} color="#04201c" />
                <Text style={styles.stopBtnText}>Stop capture &amp; save</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Audio transport — position:relative + zIndex to sit above aura */}
          <View style={[styles.transport, { position: 'relative', zIndex: 1 }]}>
            {/* Pulse icon (left) — only when WHOOP is connected in Settings */}
            {connected ? (
              <Pressable
                style={styles.pulseBtn}
                onPress={handlePulsePress}
                hitSlop={8}>
                <Ionicons
                  name={armed ? 'pulse' : 'pulse-outline'}
                  size={28}
                  color={t.live}
                />
              </Pressable>
            ) : (
              <View style={styles.transportSpacer} />
            )}

            <Pressable
              style={[styles.playBtn, { backgroundColor: t.text }]}
              onPress={togglePlayPause}>
              <Ionicons
                name={status.playing ? 'pause' : buffering ? 'ellipsis-horizontal' : 'play'}
                size={36}
                color={t.background}
              />
            </Pressable>

            {/* Spacer on the right to keep play/pause centered */}
            <View style={styles.transportSpacer} />
          </View>

          {isCapturing ? (
            <Text style={[styles.stopHint, { color: t.textTertiary }]}>
              Stop capture saves your session and opens your results · audio keeps playing
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  grabberRow: { alignItems: 'center', paddingVertical: 12 },
  grabber: { width: 38, height: 5, borderRadius: 3, opacity: 0.6 },
  artWrap: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 12 },
  art: { width: '100%', aspectRatio: 1, maxWidth: 280 },
  info: { paddingHorizontal: 32, paddingTop: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  artist: { fontSize: 16 },
  liveRow: { marginTop: 8 },
  live: { fontSize: 13, fontWeight: '700' },

  // HRV inline card
  hrvCard: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.055)',
    padding: 15,
  },
  hrvConnecting: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  hrvConnectingText: { ...Type.body, flex: 1 },
  hrvTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveDot: { fontSize: 10 },
  hrvLabel: { ...Type.caption, fontSize: 12, letterSpacing: 0 },
  hrvTimer: { ...Type.subhead, fontVariant: ['tabular-nums'] },
  hrvMidRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  hrvNumeralGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  hrvNumeral: { ...Type.numeral, fontSize: 46 },
  hrvUnit: { ...Type.subhead },
  hrvStateGroup: { alignItems: 'flex-end' },
  hrvCoherent: { ...Type.bodyStrong, fontSize: 14 },
  hrvBpm: { ...Type.subhead, marginTop: 1 },
  sparkWrap: { marginTop: 8 },

  // Inline error
  inlineError: { ...Type.body, lineHeight: 20 },
  retryRow: { marginTop: 10 },
  retryText: { ...Type.bodyStrong, fontSize: 14 },

  // Stop button
  stopRow: { paddingHorizontal: 20, marginTop: 14 },
  stopBtn: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#5eead4',
  },
  stopBtnText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    fontWeight: '600',
    color: '#04201c',
  },

  // Audio transport
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingHorizontal: 40,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportSpacer: { width: 44, height: 44 },
  stopHint: {
    ...Type.footnote,
    textAlign: 'center',
    marginTop: 11,
    paddingHorizontal: 28,
  },
});
