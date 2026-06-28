import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGrantedContent } from '@/api/content';
import { playStation, radioPlayer } from '@/audio/player';
import { ArtTile } from '@/components/ui/art-tile';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayerStore } from '@/stores/player-store';

export default function StationDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useGrantedContent();
  const status = useAudioPlayerStatus(radioPlayer);
  const activeStation = usePlayerStore((s) => s.activeStation);

  const asset = data?.find((a) => a.id === id);
  const isThis = activeStation?.id === id;
  const playing = isThis && status.playing;
  const buffering = isThis && status.isBuffering && !status.playing;

  // Play Live always opens Now Playing (starting the stream if it isn't already
  // this station). Pause/resume lives on the player + mini-player, not here —
  // so the station button has exactly one job.
  function openNowPlaying() {
    if (!asset?.stream_url) return;
    if (!isThis) {
      void playStation({
        id: asset.id,
        code: asset.code,
        name: asset.name,
        stream_url: asset.stream_url,
        description: asset.description,
      });
    }
    router.push('/player');
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={t.text} />
      </Pressable>

      {isLoading && !asset ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : !asset ? (
        <SafeAreaView style={styles.center}>
          <Text style={[styles.missing, { color: t.textSecondary }]}>
            This station isn&apos;t available.
          </Text>
        </SafeAreaView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <ArtTile seed={asset.code} style={styles.hero} radius={0}>
            <View style={styles.heroOverlay}>
              <View style={[styles.badge, { backgroundColor: t.live }]}>
                <Text style={styles.badgeText}>● LIVE</Text>
              </View>
              <Text style={styles.heroTitle}>{asset.name}</Text>
              <Text style={styles.heroSub}>Provider station</Text>
            </View>
          </ArtTile>

          <View style={styles.actions}>
            {/* Play Live — always opens Now Playing (starts the stream if needed). */}
            <Pressable
              style={[styles.playBtn, { backgroundColor: t.vitality }]}
              onPress={openNowPlaying}>
              {buffering ? (
                <ActivityIndicator color={t.onVitality} />
              ) : (
                <View style={styles.playLeft}>
                  <Ionicons name={playing ? 'radio' : 'play'} size={20} color={t.onVitality} />
                  <Text style={[styles.playText, { color: t.onVitality }]}>
                    {playing ? 'Now Playing' : 'Play Live'}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {asset.description ? (
            <Text style={[styles.desc, { color: t.textSecondary }]}>{asset.description}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: {
    position: 'absolute',
    top: 48,
    left: 14,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  missing: { fontSize: 15 },
  hero: { width: '100%', height: 330, justifyContent: 'flex-end' },
  heroOverlay: { padding: 20, gap: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  heroSub: { color: '#fff', fontSize: 14, opacity: 0.92 },
  actions: { paddingHorizontal: 20, paddingTop: 16 },
  playBtn: {
    height: 60,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  playLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  playText: { fontSize: 17, fontWeight: '700' },
  desc: { fontSize: 14, paddingHorizontal: 20, marginTop: 16, lineHeight: 21 },
});
