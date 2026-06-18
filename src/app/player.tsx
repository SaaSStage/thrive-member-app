/**
 * Full-screen Now Playing (presented as a modal). Live radio: large artwork,
 * title/artist from the AzuraCast now-playing poll, LIVE indicator, play/pause.
 * No scrubber/seek — it's a live stream.
 */
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radioPlayer, togglePlayPause } from '@/audio/player';
import { ArtTile } from '@/components/ui/art-tile';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayerStore } from '@/stores/player-store';

export default function NowPlaying() {
  const t = useTheme();
  const router = useRouter();
  const activeStation = usePlayerStore((s) => s.activeStation);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const status = useAudioPlayerStatus(radioPlayer);

  // Nothing playing (e.g., stopped while open) — dismiss.
  useEffect(() => {
    if (!activeStation) router.back();
  }, [activeStation, router]);

  if (!activeStation) return <View style={{ flex: 1, backgroundColor: t.background }} />;

  const title = nowPlaying?.title ?? activeStation.name;
  const artist = nowPlaying?.artist ?? 'THRIVE Radio';
  const buffering = status.isBuffering && !status.playing;

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill}>
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

        <View style={styles.transport}>
          <Pressable
            style={[styles.playBtn, { backgroundColor: t.text }]}
            onPress={togglePlayPause}>
            <Ionicons
              name={status.playing ? 'pause' : buffering ? 'ellipsis-horizontal' : 'play'}
              size={36}
              color={t.background}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grabberRow: { alignItems: 'center', paddingVertical: 12 },
  grabber: { width: 38, height: 5, borderRadius: 3, opacity: 0.6 },
  artWrap: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 24 },
  art: { width: '100%', aspectRatio: 1, maxWidth: 360 },
  info: { paddingHorizontal: 32, paddingTop: 34, gap: 4 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  artist: { fontSize: 18 },
  liveRow: { marginTop: 10 },
  live: { fontSize: 13, fontWeight: '700' },
  transport: { alignItems: 'center', paddingTop: 40 },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
