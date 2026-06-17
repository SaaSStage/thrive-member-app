import { useRouter, type Href } from 'expo-router';
import { useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { playStation, radioPlayer, stopPlayback } from '@/audio/player';
import { Button } from '@/components/ui/button';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// TEMP (__DEV__ only): the AUDIO-PLAYBACK.md Day-1 gate — confirm expo-audio
// plays the seeded HLS station before/without the full auth path. Remove once
// playback is verified and wired through the real Radio screen.
const HLS_TEST = {
  id: 'hls_test',
  code: 'hls_test',
  name: 'THRIVE Radio (HLS)',
  stream_url: 'https://azuracast-radio-u62352.vm.elestio.app/hls/hls_test/live.m3u8',
};

function DevAudioTest() {
  const t = useTheme();
  const status = useAudioPlayerStatus(radioPlayer);
  return (
    <View style={{ gap: 8, marginTop: 20 }}>
      <Button
        label={status.playing ? 'DEV: Stop' : 'DEV: Play hls_test'}
        variant="ghost"
        onPress={() => (status.playing ? stopPlayback() : playStation(HLS_TEST))}
      />
      <Text style={{ color: t.textTertiary, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
        {`playing=${status.playing}  buffering=${status.isBuffering}  live=${status.isLive}`}
        {`\noffsetFromLive=${status.currentOffsetFromLive ?? '—'}  t=${status.currentTime.toFixed(1)}s`}
        {`\nerror=${status.error ?? 'none'}`}
      </Text>
    </View>
  );
}

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: t.vitality }]} />
          <Text style={[styles.brand, { color: t.text }]}>Thrive</Text>
          <Text style={[styles.tagline, { color: t.textSecondary }]}>
            Your provider&apos;s stations, playlists, and voice wellness — in one place.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label="Sign in with email"
            onPress={() => router.push('/(auth)/sign-in' as Href)}
          />
          <Text style={[styles.fine, { color: t.textTertiary }]}>
            Access is provided by your care provider.
          </Text>
          {__DEV__ ? <DevAudioTest /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 32, justifyContent: 'space-between', paddingVertical: 56 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  logo: { width: 96, height: 96, borderRadius: Radius.xxl },
  brand: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 18 },
  tagline: { fontSize: 17, textAlign: 'center', maxWidth: 280, lineHeight: 23 },
  actions: { gap: 14 },
  fine: { fontSize: 13, textAlign: 'center' },
});
