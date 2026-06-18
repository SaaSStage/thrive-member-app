/**
 * Persistent mini-player shown above the tab bar whenever a station is active
 * (Apple Music pattern). Tap opens the full Now Playing modal; the play/pause
 * button toggles without leaving the current screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radioPlayer, togglePlayPause } from '@/audio/player';
import { ArtTile } from '@/components/ui/art-tile';
import { BottomTabInset, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayerStore } from '@/stores/player-store';

export function MiniPlayer() {
  const t = useTheme();
  const router = useRouter();
  const activeStation = usePlayerStore((s) => s.activeStation);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const status = useAudioPlayerStatus(radioPlayer);

  if (!activeStation) return null;

  const title = nowPlaying?.title ?? activeStation.name;
  const artist = nowPlaying?.artist ?? 'THRIVE Radio';

  return (
    <Pressable
      style={[styles.bar, { backgroundColor: t.surfaceElevated, bottom: BottomTabInset + 6 }]}
      onPress={() => router.push('/player' as Href)}>
      <ArtTile seed={activeStation.code ?? activeStation.id} style={styles.art} radius={Radius.sm} />
      <View style={styles.meta}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
          <Text style={{ color: t.live }}>● LIVE</Text>
          {`  ${artist}`}
        </Text>
      </View>
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
});
