/**
 * Screen E — review the three captured recordings before submitting. Each row:
 * label, duration, pass indicator, play/stop preview (expo-audio), re-record.
 * "Submit All Three" is enabled once all three pass. Re-implemented from the v3
 * Flutter `voice_review_view.dart`.
 */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { orderedRecordings, useVoiceStore, type CapturedRecording } from '@/stores/voice-store';
import { useVoiceSubmission } from '@/voice/use-voice-submission';
import { configFor, RECORDING_ORDER } from '@/voice/recording-type';

export function VoiceReviewView() {
  const t = useTheme();
  const router = useRouter();
  const captured = useVoiceStore((s) => s.captured);
  const uploadError = useVoiceStore((s) => s.uploadError);
  const reRecord = useVoiceStore((s) => s.reRecord);
  const submit = useVoiceSubmission();

  const recordings = orderedRecordings(captured);
  // Submit once all three slots are captured. A slot exists only if it passed OR
  // was forced through after repeated failures, so length === 3 is sufficient; a
  // forced (validation.passed === false) take still keeps its '!' badge below.
  const allCaptured = recordings.length === RECORDING_ORDER.length;

  // One transient preview player; we swap its source per row.
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const playing = status.playing && playingUri !== null;

  function togglePlay(rec: CapturedRecording) {
    if (playingUri === rec.uri && status.playing) {
      player.pause();
      setPlayingUri(null);
      return;
    }
    player.replace({ uri: rec.uri });
    player.seekTo(0);
    player.play();
    setPlayingUri(rec.uri);
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: t.text }]}>Review your submission</Text>
          <Text style={[styles.sub, { color: t.textSecondary }]}>
            Tap to preview each recording. Re-record any that don’t sound right.
          </Text>

          {uploadError ? (
            <View style={[styles.error, { backgroundColor: t.primarySoft }]}>
              <Text style={[styles.errorText, { color: t.primary }]}>Upload failed: {uploadError}</Text>
            </View>
          ) : null}

          {recordings.map((rec) => {
            const cfg = configFor(rec.type);
            const isPlaying = playing && playingUri === rec.uri;
            const seconds = (rec.durationMs / 1000).toFixed(1);
            return (
              <View key={rec.type} style={[styles.row, { backgroundColor: t.surface }]}>
                <Text style={[styles.check, { color: rec.validation.passed ? t.success : t.danger }]}>
                  {rec.validation.passed ? '✓' : '!'}
                </Text>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: t.text }]}>{cfg.shortLabel}</Text>
                  <Text style={[styles.rowMeta, { color: t.textTertiary }]}>
                    {seconds}s{rec.passageCode ? ` · ${rec.passageCode}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => togglePlay(rec)} hitSlop={10} style={styles.iconBtn}>
                  <Text style={[styles.icon, { color: t.text }]}>{isPlaying ? '■' : '▶'}</Text>
                </Pressable>
                <Pressable onPress={() => reRecord(rec.type)} hitSlop={10} style={styles.iconBtn}>
                  <Text style={[styles.icon, { color: t.textSecondary }]}>↺</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Submit all three" variant="primary" disabled={!allCaptured} onPress={() => void submit()} />
          <Button label="Cancel and start over" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  title: { ...Type.sectionTitle },
  sub: { ...Type.subhead, marginTop: 4, marginBottom: 16 },
  error: { borderRadius: Radius.lg, padding: 12, marginBottom: 16 },
  errorText: { ...Type.callout },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  check: { fontSize: 18, fontWeight: '800', width: 18, textAlign: 'center' },
  rowText: { flex: 1 },
  rowLabel: { ...Type.headline },
  rowMeta: { ...Type.subhead, marginTop: 2 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  icon: { fontSize: 20 },
  footer: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
});
