import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGrantedContent } from '@/api/content';
import { playStation, radioPlayer, togglePlayPause } from '@/audio/player';
import { ArtTile } from '@/components/ui/art-tile';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayerStore } from '@/stores/player-store';
import { useHrvStore } from '@/stores/hrv-store';

export default function StationDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useGrantedContent();
  const status = useAudioPlayerStatus(radioPlayer);
  const activeStation = usePlayerStore((s) => s.activeStation);

  const armed = useHrvStore((s) => s.armed);
  const hrvStatus = useHrvStore((s) => s.status);
  const hrvError = useHrvStore((s) => s.error);
  const arm = useHrvStore((s) => s.arm);
  const disarm = useHrvStore((s) => s.disarm);

  // Live connection feedback shown under the toggle while armed.
  const armedMessage =
    hrvStatus === 'scanning' || hrvStatus === 'connecting'
      ? 'Connecting to your WHOOP…'
      : hrvStatus === 'tracking'
        ? 'WHOOP connected — HRV is tracking. Tap Play Live to listen along.'
        : hrvStatus === 'no-rr'
          ? 'Connected — turn on Broadcast Heart Rate in your WHOOP app.'
          : hrvStatus === 'error' && hrvError === 'permission-denied'
            ? 'Allow Bluetooth access for THRIVE in Settings, then try again.'
            : hrvStatus === 'error' && hrvError === 'bluetooth-off'
            ? 'Turn on Bluetooth to reach your WHOOP.'
            : hrvStatus === 'error' && hrvError === 'not-found'
              ? 'No WHOOP found nearby — make sure it’s on and broadcasting.'
              : hrvStatus === 'error'
                ? 'Couldn’t reach your WHOOP — check it’s on and broadcasting.'
                : 'Connecting to your WHOOP…';

  const asset = data?.find((a) => a.id === id);
  const isThis = activeStation?.id === id;
  const playing = isThis && status.playing;
  const buffering = isThis && status.isBuffering && !status.playing;

  function togglePlay() {
    if (!asset?.stream_url) return;
    if (isThis) {
      togglePlayPause();
    } else {
      void playStation({
        id: asset.id,
        code: asset.code,
        name: asset.name,
        stream_url: asset.stream_url,
        description: asset.description,
      });
      router.push('/player');
    }
  }

  function toggleHrv() {
    if (!asset) return;
    if (armed) {
      disarm();
    } else {
      arm({ id: asset.id, code: asset.code ?? null, name: asset.name });
    }
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
            {/* Play Live button with embedded HRV toggle */}
            <Pressable
              style={[styles.playBtn, { backgroundColor: t.vitality }]}
              onPress={togglePlay}>
              {buffering ? (
                <ActivityIndicator color={t.onVitality} style={{ flex: 1 }} />
              ) : (
                <>
                  {/* Left side: play icon + label */}
                  <View style={styles.playLeft}>
                    <Ionicons
                      name={playing ? 'pause' : 'play'}
                      size={20}
                      color={t.onVitality}
                    />
                    <Text style={[styles.playText, { color: t.onVitality }]}>
                      {playing ? 'Pause' : 'Play Live'}
                    </Text>
                  </View>

                  {/* Right side: HRV toggle pill — stops event propagation */}
                  <Pressable
                    style={[styles.hrvPill, armed && { backgroundColor: 'rgba(94,234,212,0.18)' }]}
                    onPress={(e) => { e.stopPropagation(); toggleHrv(); }}
                    hitSlop={6}>
                    {/* ECG / heartbeat glyph — teal, matching the description icon */}
                    <Ionicons name="pulse-outline" size={17} color={t.live} />
                    <Switch
                      value={armed}
                      onValueChange={toggleHrv}
                      trackColor={{ false: 'rgba(10,8,20,0.30)', true: t.live }}
                      thumbColor="#ffffff"
                      style={styles.switch}
                    />
                  </Pressable>
                </>
              )}
            </Pressable>

            {/* one-line explanation beneath — confirms state when armed */}
            <View style={styles.hrvHint}>
              <Ionicons name="pulse-outline" size={13} color={t.live} />
              {armed ? (
                <Text style={[styles.hrvHintText, { color: t.textSecondary }]}>
                  <Text style={{ color: t.live, fontWeight: '700' }}>Live HRV on. </Text>
                  {armedMessage}
                </Text>
              ) : (
                <Text style={[styles.hrvHintText, { color: t.textSecondary }]}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Track Live HRV.</Text>
                  {' Switch this on to watch how your body responds to this frequency in real time, measured by your WHOOP.'}
                </Text>
              )}
            </View>
          </View>

          {asset.description ? (
            <Text style={[styles.desc, { color: t.textSecondary }]}>{asset.description}</Text>
          ) : null}

          <SectionHeader title="On-Demand Episodes" />
          <Text style={[styles.empty, { color: t.textTertiary }]}>
            No on-demand episodes yet.
          </Text>
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
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 8,
  },
  playLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  playText: { fontSize: 17, fontWeight: '700' },
  hrvPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(10,8,20,0.20)',
    borderRadius: 13,
    height: 46,
    paddingHorizontal: 12,
  },
  switch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  hrvHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 11,
    paddingHorizontal: 2,
  },
  hrvHintText: { fontSize: 13, lineHeight: 19, flex: 1 },
  desc: { fontSize: 14, paddingHorizontal: 20, marginTop: 16, lineHeight: 21 },
  empty: { fontSize: 14, paddingHorizontal: 20, paddingBottom: 8 },
});
