/**
 * HRV session summary modal — opened after "Stop capture & save" saves the
 * session and routes here with the saved row id. Matches wireframe ④:
 * breathing teal mandala dial showing avg RMSSD, low/avg/peak glass cards,
 * duration, station name, a takeaway line, and Done to dismiss.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHrvSessions } from '@/api/hrv';
import { Aura } from '@/components/ui/aura';
import { CardMandala, Mandala } from '@/components/ui/mandala';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Format duration in seconds as "X min" or "X min Y sec". */
function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

/** Simple takeaway copy based on average RMSSD. */
function takeawayFor(avg: number | null): string {
  if (avg == null) return 'Session saved to your vitality history.';
  if (avg >= 70)
    return 'Strong HRV — your nervous system responded well to this frequency. Saved to your vitality history.';
  if (avg >= 50)
    return 'Your HRV trended upward through this session — a sign of rising rest-and-restore (parasympathetic) activity. Saved to your vitality history.';
  return 'Your HRV was recorded for this session. Over time you\'ll see how different frequencies affect your body. Saved to your vitality history.';
}

export default function HrvSummaryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: sessions, isLoading } = useHrvSessions();

  const session = sessions?.find((s) => s.id === id);

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.headerTitle, { color: t.text }]}>Session complete</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.done, { color: t.vitality }]}>Done</Text>
          </Pressable>
        </View>

        {isLoading && !session ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : !session ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle-outline" size={64} color={t.live} />
            <Text style={[styles.savedText, { color: t.textSecondary }]}>
              Session saved to your vitality history.
            </Text>
            <Pressable onPress={() => router.back()} style={styles.doneBtn}>
              <Text style={[styles.doneBtnText, { color: t.text }]}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Breathing teal mandala dial with avg RMSSD */}
            <View style={styles.dial}>
              <Mandala
                size={246}
                colors={Gradients.teal as unknown as string[]}
                motion="breathe"
                opacity={0.6}
                glow={0.78}
                breatheMs={5600}
              />
              <View style={styles.dialCenter}>
                <Text style={[styles.avgNumeral, { color: t.text }]}>
                  {session.avg_rmssd != null ? Math.round(session.avg_rmssd) : '–'}
                </Text>
                <Text style={[styles.avgLabel, { color: t.textSecondary }]}>AVG MS · RMSSD</Text>
              </View>
            </View>

            {/* Station name */}
            {session.station_code ? (
              <Text style={[styles.stationName, { color: t.textSecondary }]}>
                {session.station_code}
              </Text>
            ) : null}

            {/* Low / Avg / Peak glass cards */}
            <View style={styles.statRow}>
              {([
                { label: 'Low', value: session.min_rmssd, grad: Gradients.violet },
                { label: 'Average', value: session.avg_rmssd, grad: Gradients.teal },
                { label: 'Peak', value: session.max_rmssd, grad: ['#ffd9a0', '#ff9f5a'] },
              ] as const).map(({ label, value, grad }) => (
                <View
                  key={label}
                  style={[styles.statCard, styles.glass, { overflow: 'hidden' }]}>
                  <CardMandala
                    colors={grad as unknown as string[]}
                    size={90}
                    opacity={0.42}
                    glow={0.55}
                  />
                  <Text style={[styles.statLabel, { color: t.textSecondary }]}>{label}</Text>
                  <Text style={[styles.statValue, { color: t.text }]}>
                    {value != null ? Math.round(value) : '–'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Duration + sample count row */}
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: t.textSecondary }]}>Duration</Text>
              <Text style={[styles.metaValue, { color: t.text }]}>
                {fmtDuration(session.duration_seconds)}
                {session.sample_count > 0 ? ` · ${session.sample_count} beats` : ''}
              </Text>
            </View>

            {/* Takeaway card */}
            <View style={[styles.takeawayCard, styles.glass]}>
              <Text style={[styles.takeawayText, { color: t.textSecondary }]}>
                {takeawayFor(session.avg_rmssd)}
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Aura>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerSpacer: { width: 40 },
  headerTitle: { fontFamily: 'Sora_500Medium', fontSize: 16, fontWeight: '500' },
  done: { fontFamily: 'Sora_600SemiBold', fontSize: 15, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  savedText: { ...Type.body, textAlign: 'center' },
  doneBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24 },
  doneBtnText: { ...Type.bodyStrong },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, alignItems: 'center' },
  dial: {
    width: 246,
    height: 246,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  avgNumeral: { ...Type.numeral, fontSize: 70 },
  avgLabel: { ...Type.caption, fontSize: 10, marginTop: 2 },
  stationName: { ...Type.bodyStrong, marginTop: 4 },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  statCard: {
    flex: 1,
    height: 104,
    borderRadius: Radius.xl,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { ...Type.subhead, fontSize: 12, position: 'relative' },
  statValue: { ...Type.numeral, fontSize: 30, marginTop: 6, position: 'relative' },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 20,
  },
  metaLabel: { ...Type.subhead },
  metaValue: { fontFamily: 'Sora_600SemiBold', fontSize: 14 },
  takeawayCard: {
    borderRadius: Radius.xl,
    padding: 16,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  takeawayText: { ...Type.callout, lineHeight: 22 },
});
