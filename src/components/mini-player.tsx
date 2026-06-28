/**
 * Persistent mini-player shown above the tab bar whenever a station is active
 * (Apple Music pattern). Tap opens the full Now Playing modal; the play/pause
 * button toggles without leaving the current screen.
 *
 * The pulse-wave icon mirrors Now Playing: teal when the WHOOP is connected,
 * red while actively tracking (with a tiny sparkline + "{rmssd} ms · tracking").
 */
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radioPlayer, togglePlayPause } from '@/audio/player';
import { Sparkline } from '@/components/hrv/sparkline';
import { ArtTile } from '@/components/ui/art-tile';
import { BottomTabInset, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHrvStore } from '@/stores/hrv-store';
import { usePlayerStore } from '@/stores/player-store';
import { useWearableStore } from '@/stores/wearable-store';

export function MiniPlayer() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeStation = usePlayerStore((s) => s.activeStation);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const status = useAudioPlayerStatus(radioPlayer);

  const hrvStatus = useHrvStore((s) => s.status);
  const liveRmssd = useHrvStore((s) => s.liveRmssd);
  const recent = useHrvStore((s) => s.recent);
  const connected = useWearableStore((s) => s.connected);

  if (!activeStation) return null;

  const title = nowPlaying?.title ?? activeStation.name;
  const artist = nowPlaying?.artist ?? 'THRIVE Radio';
  const isTracking = hrvStatus === 'tracking';

  return (
    <Pressable
      style={[styles.bar, { backgroundColor: t.surfaceElevated, bottom: BottomTabInset + insets.bottom + 6 }]}
      onPress={() => router.push('/player' as Href)}>
      <ArtTile seed={activeStation.code ?? activeStation.id} style={styles.art} radius={Radius.sm} />
      <View style={styles.meta}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        {isTracking ? (
          <View style={styles.hrvRow}>
            <Ionicons name="pulse" size={13} color="#ef4444" />
            <Text style={[styles.hrvText, { color: '#ef4444' }]} numberOfLines={1}>
              {liveRmssd != null ? `${Math.round(liveRmssd)} ms` : '– ms'} · tracking
            </Text>
          </View>
        ) : connected ? (
          <View style={styles.hrvRow}>
            <Ionicons name="pulse" size={13} color={t.live} />
            <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
              <Text style={{ color: t.live }}>● LIVE</Text>
              {`  ${artist}`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
            <Text style={{ color: t.live }}>● LIVE</Text>
            {`  ${artist}`}
          </Text>
        )}
      </View>
      {isTracking && recent.length >= 2 ? (
        <View style={styles.sparkWrap}>
          <Sparkline data={recent} width={54} height={22} color="#5eead4" />
        </View>
      ) : null}
      <Pressable hitSlop={12} onPress={togglePlayPause}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={26} color={t.text} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 60,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingLeft: 8,
    paddingRight: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  art: { width: 44, height: 44 },
  meta: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  hrvRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  hrvText: { ...Type.subhead },
  sparkWrap: { width: 54, height: 22, flexShrink: 0, opacity: 0.92 },
});
