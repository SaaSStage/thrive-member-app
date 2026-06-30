/**
 * HRV session results — opened after you stop a live capture.
 *
 * Fresh session (no `id` param): renders INSTANTLY from the in-memory summary
 * (`hrv-store.lastSummary`) as the **Session Response** card — the acute insight
 * of how the frequency moved the member's nervous system (ΔHRV vs. settled
 * baseline, HR settle, time-to-calm, the RMSSD curve). See
 * docs/specs/session-response-insight.md §4. Saves to the DB in the background
 * (best-effort), so results never wait on — or fail with — the network.
 *
 * History (`id` param, e.g. from a future history list): reads the saved DB row,
 * which has no series/baseline, so it falls back to the simple avg/low/peak readout.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHrvSessions, useSaveHrvSession, type HrvSession } from '@/api/hrv';
import { Sparkline } from '@/components/hrv/sparkline';
import { Aura } from '@/components/ui/aura';
import { CardMandala, Mandala } from '@/components/ui/mandala';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatSignedPct,
  hrDelta,
  isReadable,
  responseCopy,
  timeToCalmSec,
  type ResponseTrend,
} from '@/hrv/session-response';
import { useHrvStore, type HrvSessionSummary } from '@/stores/hrv-store';

const AMBER = '#ff9f5a';

/** The display fields the history (DB-row) fallback needs. */
type SummaryView = {
  avg: number | null;
  min: number | null;
  max: number | null;
  durationSeconds: number;
  sampleCount: number;
  stationLabel: string | null;
  pctFromBaseline: number | null;
};

/** Format duration in seconds as "X min" or "X min Y sec". */
function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

const TREND_ICON: Record<ResponseTrend, keyof typeof Ionicons.glyphMap> = {
  calmer: 'trending-up',
  activated: 'trending-down',
  steady: 'remove',
};

/** Takeaway copy for the history fallback (no baseline → avg-RMSSD heuristic). */
function historyTakeaway(avg: number | null): string {
  if (avg == null) return 'Session recorded to your vitality history.';
  if (avg >= 70) return 'Strong HRV — your nervous system responded well to this frequency.';
  if (avg >= 50)
    return 'Your HRV trended upward through this session — a sign of rising rest-and-restore (parasympathetic) activity.';
  return 'Your HRV was recorded for this session. Over time you\'ll see how different frequencies affect your body.';
}

export default function HrvSummaryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isHistory = id != null && id !== '';

  // Fresh session: render from memory; history: read the saved DB row.
  const lastSummary = useHrvStore((s) => s.lastSummary);
  const { data: sessions, isLoading } = useHrvSessions();
  const saveHrv = useSaveHrvSession();

  // Best-effort background save of a fresh session, exactly once. The screen
  // never waits on it; a quiet line appears only if it fails.
  const [saveFailed, setSaveFailed] = useState(false);
  const savedRef = useRef(false);
  useEffect(() => {
    if (isHistory || !lastSummary || savedRef.current) return;
    savedRef.current = true;
    saveHrv
      .mutateAsync(lastSummary)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  }, [isHistory, lastSummary, saveHrv]);

  const historyRow = isHistory ? sessions?.find((s) => s.id === id) : undefined;
  const loading = isHistory && isLoading && !historyRow;

  // ---- Fresh session → Session Response card -------------------------------
  const fresh = !isHistory ? lastSummary : null;

  function renderDone(label = 'Done') {
    return (
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={[styles.done, { color: t.vitality }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.headerTitle, { color: t.text }]}>Session complete</Text>
          {renderDone()}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : fresh ? (
          isReadable(fresh) ? (
            <ResponseCard summary={fresh} t={t} saveFailed={saveFailed} />
          ) : (
            // Validity gate — too little signal to read a response. (Still saved.)
            <View style={styles.center}>
              <Ionicons name="pulse-outline" size={56} color={t.textTertiary} />
              <Text style={[styles.savedText, { color: t.textSecondary }]}>
                Capture was too short to read a clear response.
              </Text>
              <Text style={[styles.gateHint, { color: t.textTertiary }]}>
                Hold still with your band on for at least 3 minutes next time.
              </Text>
              <Pressable onPress={() => router.back()} style={styles.doneBtn}>
                <Text style={[styles.doneBtnText, { color: t.text }]}>Done</Text>
              </Pressable>
            </View>
          )
        ) : (
          <HistoryFallback row={historyRow} t={t} router={router} />
        )}
      </SafeAreaView>
    </Aura>
  );
}

// ---- Session Response card (fresh session) ---------------------------------

function ResponseCard({
  summary,
  t,
  saveFailed,
}: {
  summary: HrvSessionSummary;
  t: ReturnType<typeof useTheme>;
  saveFailed: boolean;
}) {
  const { trend, sentence } = responseCopy(summary.pctFromBaseline, summary.durationSeconds);
  const trendColor = trend === 'calmer' ? t.vitality : trend === 'activated' ? AMBER : t.textSecondary;
  const hr = hrDelta(summary.bpmSeries);
  const ttc = timeToCalmSec(summary.rmssdSeries, summary.baselineRmssd);
  const stationLabel = summary.station.name ?? summary.station.code;

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {stationLabel ? (
        <Text style={[styles.stationName, { color: t.textSecondary }]}>{stationLabel}</Text>
      ) : null}

      {/* Hero: ΔHRV vs. settled baseline */}
      <View style={styles.hero}>
        <Ionicons name={TREND_ICON[trend]} size={26} color={trendColor} />
        <Text style={[styles.heroNumeral, { color: trendColor }]}>
          {formatSignedPct(summary.pctFromBaseline)}
        </Text>
        <Text style={[styles.heroCaption, { color: t.textSecondary }]}>
          HRV vs. your settled baseline
        </Text>
      </View>

      {/* RMSSD curve with baseline reference line */}
      <View style={[styles.curveCard, styles.glass]}>
        <Text style={[styles.curveLabel, { color: t.textSecondary }]}>RMSSD · this session</Text>
        <Sparkline
          data={summary.rmssdSeries}
          width={320}
          height={84}
          color={Gradients.teal[1] as string}
          strokeWidth={2.4}
          baseline={summary.baselineRmssd ?? undefined}
        />
        <Text style={[styles.curveFootnote, { color: t.textTertiary }]}>
          Dashed line = your settling baseline (first minute)
        </Text>
      </View>

      {/* HR settle */}
      {hr ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: t.textSecondary }]}>Heart rate</Text>
          <Text style={[styles.metaValue, { color: t.text }]}>
            {hr.baselineHr} → {hr.endHr} bpm
            {hr.delta < 0 ? '  ↓ settled' : ''}
          </Text>
        </View>
      ) : null}

      {/* Time to calm */}
      {ttc != null ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: t.textSecondary }]}>Settled</Text>
          <Text style={[styles.metaValue, { color: t.text }]}>by {fmtDuration(ttc)}</Text>
        </View>
      ) : null}

      {/* Duration + beats + avg */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: t.textSecondary }]}>Duration</Text>
        <Text style={[styles.metaValue, { color: t.text }]}>
          {fmtDuration(summary.durationSeconds)}
          {summary.sampleCount > 0 ? ` · ${summary.sampleCount} beats` : ''}
          {summary.avgRmssd != null ? ` · avg ${Math.round(summary.avgRmssd)} ms` : ''}
        </Text>
      </View>

      {/* Takeaway */}
      <View style={[styles.takeawayCard, styles.glass]}>
        <Text style={[styles.takeawayText, { color: t.textSecondary }]}>{sentence}</Text>
      </View>

      {saveFailed ? (
        <Text style={[styles.notSaved, { color: t.textTertiary }]}>Not saved to your history.</Text>
      ) : null}
    </ScrollView>
  );
}

// ---- History fallback (DB row — no series/baseline) ------------------------

function HistoryFallback({
  row,
  t,
  router,
}: {
  row: HrvSession | undefined;
  t: ReturnType<typeof useTheme>;
  router: ReturnType<typeof useRouter>;
}) {
  if (!row) {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle-outline" size={64} color={t.live} />
        <Text style={[styles.savedText, { color: t.textSecondary }]}>Session complete.</Text>
        <Pressable onPress={() => router.back()} style={styles.doneBtn}>
          <Text style={[styles.doneBtnText, { color: t.text }]}>Done</Text>
        </Pressable>
      </View>
    );
  }

  const view: SummaryView = {
    avg: row.avg_rmssd,
    min: row.min_rmssd,
    max: row.max_rmssd,
    durationSeconds: row.duration_seconds,
    sampleCount: row.sample_count,
    stationLabel: row.station_code,
    pctFromBaseline: null,
  };

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
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
            {view.avg != null ? Math.round(view.avg) : '–'}
          </Text>
          <Text style={[styles.avgLabel, { color: t.textSecondary }]}>AVG MS · RMSSD</Text>
        </View>
      </View>

      {view.stationLabel ? (
        <Text style={[styles.stationName, { color: t.textSecondary }]}>{view.stationLabel}</Text>
      ) : null}

      <View style={styles.statRow}>
        {([
          { label: 'Low', value: view.min, grad: Gradients.violet },
          { label: 'Average', value: view.avg, grad: Gradients.teal },
          { label: 'Peak', value: view.max, grad: ['#ffd9a0', '#ff9f5a'] },
        ] as const).map(({ label, value, grad }) => (
          <View key={label} style={[styles.statCard, styles.glass, { overflow: 'hidden' }]}>
            <CardMandala colors={grad as unknown as string[]} size={90} opacity={0.42} glow={0.55} />
            <Text style={[styles.statLabel, { color: t.textSecondary }]}>{label}</Text>
            <Text style={[styles.statValue, { color: t.text }]}>
              {value != null ? Math.round(value) : '–'}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaLabel, { color: t.textSecondary }]}>Duration</Text>
        <Text style={[styles.metaValue, { color: t.text }]}>
          {fmtDuration(view.durationSeconds)}
          {view.sampleCount > 0 ? ` · ${view.sampleCount} beats` : ''}
        </Text>
      </View>

      <View style={[styles.takeawayCard, styles.glass]}>
        <Text style={[styles.takeawayText, { color: t.textSecondary }]}>
          {historyTakeaway(view.avg)}
        </Text>
      </View>
    </ScrollView>
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
  gateHint: { ...Type.footnote, textAlign: 'center', marginTop: -6 },
  doneBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24 },
  doneBtnText: { ...Type.bodyStrong },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, alignItems: 'center' },

  // Hero (response)
  hero: { alignItems: 'center', marginTop: 14, marginBottom: 6 },
  heroNumeral: { ...Type.numeral, fontSize: 64, marginTop: 2 },
  heroCaption: { ...Type.caption, fontSize: 11, marginTop: 2 },

  // Curve
  curveCard: { borderRadius: Radius.xl, padding: 16, marginTop: 18, alignSelf: 'stretch' },
  curveLabel: { ...Type.subhead, fontSize: 12, marginBottom: 10 },
  curveFootnote: { ...Type.footnote, marginTop: 8 },

  // History dial
  dial: { width: 246, height: 246, alignItems: 'center', justifyContent: 'center' },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  avgNumeral: { ...Type.numeral, fontSize: 70 },
  avgLabel: { ...Type.caption, fontSize: 10, marginTop: 2 },

  stationName: { ...Type.bodyStrong, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 22, alignSelf: 'stretch' },
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
    marginTop: 16,
  },
  metaLabel: { ...Type.subhead },
  metaValue: { fontFamily: 'Sora_600SemiBold', fontSize: 14 },
  takeawayCard: { borderRadius: Radius.xl, padding: 16, marginTop: 16, alignSelf: 'stretch' },
  takeawayText: { ...Type.callout, lineHeight: 22 },
  notSaved: { ...Type.footnote, textAlign: 'center', marginTop: 18 },
});
