/**
 * Vitality score breakdown ("My Vitality"). The composite score sits inside a
 * breathing gold mandala dial; the four sub-scores are glass cards each backed
 * by a slowly-rotating hued mandala. Plus trend, plain-language summary, and
 * recommended protocols.
 *
 * Handles every state from the backend pipeline: no submissions, processing
 * (stage-specific spinner), failed, the LOCKED "building your baseline" state
 * (no baseline yet → scores are null, never shown as a number), and ready.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useLatestScore,
  type ProcessingStage,
  type ProtocolRec,
  type ScoreResult,
  type Subscore,
  type Trend,
} from '@/api/score';
import { Aura } from '@/components/ui/aura';
import { Button } from '@/components/ui/button';
import { CardMandala, Mandala } from '@/components/ui/mandala';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SUB_HUES = [Gradients.teal, Gradients.violet, Gradients.score, Gradients.gold] as unknown as string[][];

/** Copy for each in-flight stage. `preparing`/`scoring` are fast; `extracting` is the long one. */
const STAGE_COPY: Record<ProcessingStage, { title: string; sub: string }> = {
  preparing: { title: 'Getting started', sub: 'Your recording is in line to be analyzed…' },
  extracting: { title: 'Analyzing your audio', sub: 'This is the longest step — hang tight.' },
  scoring: { title: 'Computing your results', sub: 'Almost there…' },
  narrating: { title: 'Writing your summary', sub: 'Putting your results into words…' },
};

/** Card microcopy for every locked dimension while the baseline is still building. */
const UNLOCK_HINT = 'Unlocks after 3 baseline sessions';

export default function ScoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useLatestScore();

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: t.text }]}>My Vitality</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.close, { color: t.link }]}>Done</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.muted, { color: t.textSecondary }]}>Couldn’t load your score.</Text>
            <Button label="Try again" variant="ghost" onPress={() => void refetch()} />
          </View>
        ) : data?.state === 'ready' ? (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* breathing mandala dial */}
            <View style={styles.dial}>
              <Mandala
                size={272}
                colors={Gradients.gold as unknown as string[]}
                motion="breathe"
                opacity={0.5}
                glow={0.8}
                breatheMs={5600}
                dynamicBlur
              />
              <View style={styles.dialCenter}>
                <Text style={[styles.score, { color: t.text }]}>{data.vitalityScore}</Text>
                <Text style={[styles.scoreOf, { color: t.textSecondary }]}>VITALITY</Text>
              </View>
            </View>
            {data.vitalityTrend ? (
              <View style={styles.trendRow}>
                <TrendBadge trend={data.vitalityTrend} />
                <Text style={[styles.trendText, { color: t.textSecondary }]}>since your last check-in</Text>
              </View>
            ) : null}

            {data.newerSampleProcessing ? <NewerSamplePill /> : null}

            <Text style={[styles.sectionTitle, { color: t.text }]}>What makes up your score</Text>
            <View style={styles.grid}>
              {data.subscores.map((s, i) => (
                <SubscoreCard key={s.key} subscore={s} colors={SUB_HUES[i % SUB_HUES.length]} />
              ))}
            </View>

            {data.narrative ? (
              <>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Your summary</Text>
                <View style={[styles.card, styles.glass]}>
                  <Markdownish text={data.narrative} />
                </View>
              </>
            ) : null}

            {data.protocols.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Recommended for you</Text>
                {data.protocols.map((p) => (
                  <ProtocolCard key={p.id} protocol={p} />
                ))}
              </>
            ) : null}

            {data.generatedAt ? (
              <Text style={[styles.muted, { color: t.textTertiary, marginTop: 12 }]}>
                Last updated {new Date(data.generatedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          // Every no-score case (none / baseline / processing / failed): the four
          // locked dimension cards, then a description of where the member is in
          // their voice submission. No numbers — null scores read as 0/100, both wrong.
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, { color: t.text, marginTop: 8 }]}>Baseline not established</Text>
            <View style={styles.grid}>
              {SUBSCORE_PLACEHOLDERS.map((s, i) => (
                <LockedSubscoreCard key={s.key} label={s.label} colors={SUB_HUES[i % SUB_HUES.length]} />
              ))}
            </View>

            <NotEstablishedDetail data={data} />

            {data?.state !== 'processing' ? (
              <Button
                label="Submit a voice sample"
                variant="primary"
                style={styles.cta}
                onPress={() => router.replace('/voice' as Href)}
              />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Aura>
  );
}

/** Labels for the locked subscore grid (no values exist before the baseline). */
const SUBSCORE_PLACEHOLDERS: { key: Subscore['key']; label: string }[] = [
  { key: 'emotional_wellness', label: 'Emotional Wellness' },
  { key: 'cognitive_clarity', label: 'Cognitive Clarity' },
  { key: 'physical_energy', label: 'Physical Energy' },
  { key: 'voice_power', label: 'Voice Power' },
];

/**
 * The description under the locked cards: where the member is in their voice
 * submission. Copy + busy state vary by pipeline state; the count chip shows only
 * if the backend has persisted distinctUsableDays.
 */
function NotEstablishedDetail({ data }: { data: ScoreResult | undefined }) {
  const t = useTheme();
  let body: string;
  let busy = false;
  let day: number | null = null;
  switch (data?.state) {
    case 'baseline':
      body =
        data.wellnessMessage ??
        'Your scores compare you to your own voice. Record on 3 separate days to establish your baseline — then your scores unlock.';
      day = data.distinctUsableDays;
      break;
    case 'processing':
      body = `${STAGE_COPY[data.stage].title} — ${STAGE_COPY[data.stage].sub}`;
      busy = true;
      break;
    case 'failed':
      body = 'We couldn’t process your last recording. Please submit another voice sample.';
      break;
    default: // none / undefined — no recordings yet
      body =
        'Submit a voice sample to begin. Your scores compare you to your own voice — record on 3 separate days to establish your baseline, then your scores unlock.';
  }
  return (
    <View style={[styles.card, styles.glass, { marginTop: 20 }]}>
      <View style={styles.detailHead}>
        {busy ? (
          <ActivityIndicator color={t.primary} size="small" />
        ) : (
          <Ionicons name="lock-closed" size={16} color={t.textSecondary} />
        )}
        <Text style={[styles.rowLabel, { color: t.text }]}>Where you are</Text>
      </View>
      <Text style={[styles.rowDesc, { color: t.textSecondary, marginTop: 8 }]}>{body}</Text>
      {day != null ? (
        <View style={[styles.dayPill, { borderColor: t.hairline, marginTop: 12 }]}>
          <Text style={[styles.dayPillText, { color: t.vitality }]}>Day {day} of 3</Text>
        </View>
      ) : null}
    </View>
  );
}

function NewerSamplePill() {
  const t = useTheme();
  return (
    <View style={[styles.analyzingPill, styles.glass]}>
      <ActivityIndicator color={t.primary} size="small" />
      <Text style={[styles.analyzingText, { color: t.textSecondary }]}>
        Your newest sample is still processing — showing your last result.
      </Text>
    </View>
  );
}

function trendColor(direction: Trend['direction'], t: ReturnType<typeof useTheme>): string {
  return direction === 'improving' ? t.success : direction === 'declining' ? t.warning : t.textTertiary;
}

function TrendBadge({ trend }: { trend: Trend }) {
  const t = useTheme();
  const arrow = trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
  const mag = Math.abs(trend.magnitude);
  const sign = trend.direction === 'improving' ? '+' : trend.direction === 'declining' ? '−' : '±';
  return (
    <Text style={[styles.trendBadge, { color: trendColor(trend.direction, t) }]}>
      {arrow} {sign}
      {mag}
    </Text>
  );
}

function SubscoreCard({ subscore, colors }: { subscore: Subscore; colors: string[] }) {
  const t = useTheme();
  return (
    <View style={[styles.subCard, styles.glass]}>
      <CardMandala colors={colors} size={190} opacity={0.42} glow={0.55} />
      <View style={styles.subHead}>
        <Text style={[styles.subLabel, { color: t.textSecondary }]} numberOfLines={1}>
          {subscore.label}
        </Text>
        <View style={[styles.infoBtn, { borderColor: t.hairline }]}>
          <Text style={[styles.infoI, { color: t.textTertiary }]}>i</Text>
        </View>
      </View>
      <Text style={[styles.subValue, { color: t.text }]}>{subscore.value}</Text>
    </View>
  );
}

function LockedSubscoreCard({ label, colors }: { label: string; colors: string[] }) {
  const t = useTheme();
  return (
    <View style={[styles.subCard, styles.glass]}>
      <CardMandala colors={colors} size={190} opacity={0.22} glow={0.3} />
      <View style={styles.subHead}>
        <Text style={[styles.lockedLabel, { color: t.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="lock-closed" size={15} color={t.textSecondary} />
      </View>
      <Text style={[styles.lockedHint, { color: t.textSecondary }]}>{UNLOCK_HINT}</Text>
    </View>
  );
}

function ProtocolCard({ protocol }: { protocol: ProtocolRec }) {
  const t = useTheme();
  const meta = [
    protocol.durationMinutes ? `${protocol.durationMinutes} min` : null,
    protocol.perWeek ? `${protocol.perWeek}×/week` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, styles.glass]}>
      <Text style={[styles.rowLabel, { color: t.text }]}>{protocol.name}</Text>
      {protocol.shortDescription ? (
        <Text style={[styles.rowDesc, { color: t.textSecondary, marginTop: 4 }]}>{protocol.shortDescription}</Text>
      ) : null}
      {meta ? <Text style={[styles.protoMeta, { color: t.textTertiary }]}>{meta}</Text> : null}
    </View>
  );
}

function Markdownish({ text }: { text: string }) {
  const t = useTheme();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const key = `l${i}`;
        const trimmed = line.trim();
        if (trimmed === '') return <View key={key} style={{ height: 8 }} />;
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
          return (
            <Text key={key} style={[styles.mdHeading, { color: t.text }]}>
              {renderInline(heading[2], t)}
            </Text>
          );
        }
        const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
        if (bullet) {
          return (
            <View key={key} style={styles.mdBulletRow}>
              <Text style={[styles.mdBulletDot, { color: t.textSecondary }]}>•</Text>
              <Text style={[styles.mdText, { color: t.textSecondary }]}>{renderInline(bullet[1], t)}</Text>
            </View>
          );
        }
        return (
          <Text key={key} style={[styles.mdText, { color: t.textSecondary }]}>
            {renderInline(trimmed, t)}
          </Text>
        );
      })}
    </View>
  );
}

function renderInline(line: string, t: ReturnType<typeof useTheme>) {
  const parts = line.split(/\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={{ color: t.text, fontFamily: Type.bodyStrong.fontFamily }}>
        {part}
      </Text>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: { ...Type.largeTitle, fontSize: 26 },
  close: { ...Type.bodyStrong },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  dial: { alignItems: 'center', justifyContent: 'center', height: 272, alignSelf: 'center' },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  score: { ...Type.numeral, fontSize: 80 },
  scoreOf: { ...Type.caption, marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  trendText: { ...Type.subhead },
  // locked "baseline not established" description block
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayPill: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  dayPillText: { ...Type.subhead, fontFamily: Type.bodyStrong.fontFamily },
  lockedHint: { ...Type.footnote, fontSize: 12.5, lineHeight: 16 },
  analyzingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  analyzingText: { ...Type.subhead, flex: 1 },
  sectionTitle: { ...Type.headline, marginBottom: 12, marginTop: 24 },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  subCard: {
    width: '48%',
    minHeight: 116,
    borderRadius: Radius.xxl,
    padding: 14,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subLabel: { ...Type.subhead, flex: 1 },
  lockedLabel: { ...Type.subhead, fontFamily: Type.bodyStrong.fontFamily, flex: 1 },
  subValue: { ...Type.numeral, fontSize: 34 },
  infoBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoI: { ...Type.caption, fontSize: 11, letterSpacing: 0 },
  card: { borderRadius: Radius.xxl, padding: 16, marginBottom: 12 },
  rowLabel: { ...Type.bodyStrong },
  trendBadge: { ...Type.subhead, fontFamily: Type.bodyStrong.fontFamily },
  rowDesc: { ...Type.subhead },
  protoMeta: { ...Type.footnote, marginTop: 8 },
  mdHeading: { ...Type.bodyStrong, marginTop: 8, marginBottom: 2 },
  mdText: { ...Type.body },
  mdBulletRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  mdBulletDot: { ...Type.body },
  muted: { ...Type.body, textAlign: 'center' },
  cta: { marginTop: 12, alignSelf: 'stretch' },
});
