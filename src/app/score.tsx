/**
 * Vitality score breakdown ("My Score"). Shows the composite Vitality Score, the
 * four subscores that make it up, the trend vs. prior check-ins, a plain-language
 * summary (wellness narrative), and recommended protocols. Opened from the Home
 * vitality card. Handles: no submissions, latest sample analyzing, score ready.
 */
import { useRouter, type Href } from 'expo-router';
import { Fragment } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLatestScore, type ProtocolRec, type Subscore, type Trend } from '@/api/score';
import { Button } from '@/components/ui/button';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ScoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useLatestScore();

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: t.text }]}>Vitality</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.close, { color: t.textSecondary }]}>Done</Text>
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
            <View style={[styles.scoreHero, { backgroundColor: t.vitality }]}>
              <Text style={[styles.heroKicker, { color: t.onVitality }]}>YOUR VITALITY SCORE</Text>
              <Text style={[styles.heroScore, { color: t.onVitality }]}>{data.vitalityScore}</Text>
              <Text style={[styles.heroOutOf, { color: t.onVitality }]}>out of 100</Text>
              {data.vitalityTrend ? (
                <View style={styles.heroTrend}>
                  <TrendBadge trend={data.vitalityTrend} on={t.onVitality} />
                  <Text style={[styles.heroTrendText, { color: t.onVitality }]}>vs. your recent check-ins</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: t.text }]}>What makes up your score</Text>
            {data.subscores.map((s) => (
              <SubscoreRow key={s.key} subscore={s} />
            ))}

            {data.narrative ? (
              <>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Your summary</Text>
                <View style={[styles.card, { backgroundColor: t.surface }]}>
                  <Markdownish text={data.narrative} />
                </View>
              </>
            ) : data.narrativeStatus === 'pending' ? (
              <Text style={[styles.muted, { color: t.textTertiary, marginTop: 8 }]}>
                Your personalized summary is being prepared…
              </Text>
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
          <View style={styles.center}>
            <Text style={styles.emoji}>{data?.state === 'analyzing' ? '⏳' : '🎙️'}</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>
              {data?.state === 'analyzing' ? 'Analyzing your latest sample' : 'No score yet'}
            </Text>
            <Text style={[styles.muted, { color: t.textSecondary }]}>
              {data?.state === 'analyzing'
                ? 'Your score will appear here once your provider’s analysis finishes.'
                : 'Take a voice check-in and your Vitality Score will appear here.'}
            </Text>
            {data?.state === 'none' ? (
              <Button
                label="Start a voice check-in"
                variant="primary"
                style={styles.cta}
                onPress={() => router.replace('/voice' as Href)}
              />
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function trendColor(direction: Trend['direction'], t: ReturnType<typeof useTheme>): string {
  return direction === 'improving' ? t.success : direction === 'declining' ? t.warning : t.textTertiary;
}

/** Compact ↑/↓/→ + signed magnitude badge. `on` overrides color (e.g. on the hero). */
function TrendBadge({ trend, on }: { trend: Trend; on?: string }) {
  const t = useTheme();
  const arrow = trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
  const mag = Math.abs(trend.magnitude);
  const sign = trend.direction === 'improving' ? '+' : trend.direction === 'declining' ? '−' : '±';
  const color = on ?? trendColor(trend.direction, t);
  return (
    <Text style={[styles.trendBadge, { color }]}>
      {arrow} {sign}
      {mag}
    </Text>
  );
}

function SubscoreRow({ subscore }: { subscore: Subscore }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, subscore.value));
  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowLabel, { color: t.text }]}>{subscore.label}</Text>
        <View style={styles.rowRight}>
          {subscore.trend ? <TrendBadge trend={subscore.trend} /> : null}
          <Text style={[styles.rowValue, { color: t.vitality }]}>{subscore.value}</Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: t.surfaceElevated }]}>
        <View style={[styles.fillBar, { width: `${pct}%`, backgroundColor: t.vitality }]} />
      </View>
      <Text style={[styles.rowDesc, { color: t.textTertiary }]}>{subscore.description}</Text>
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
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <Text style={[styles.rowLabel, { color: t.text }]}>{protocol.name}</Text>
      {protocol.shortDescription ? (
        <Text style={[styles.rowDesc, { color: t.textSecondary, marginTop: 4 }]}>{protocol.shortDescription}</Text>
      ) : null}
      {meta ? <Text style={[styles.protoMeta, { color: t.textTertiary }]}>{meta}</Text> : null}
    </View>
  );
}

/** Minimal markdown renderer for the wellness narrative: ###/## headings, "- "
 * bullets, **bold** inline, and paragraphs. Avoids a markdown dependency. */
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

/** Split a line on **bold** and return Text spans. */
function renderInline(line: string, t: ReturnType<typeof useTheme>) {
  const parts = line.split(/\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={{ fontWeight: '700', color: t.text }}>
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
  title: { ...Type.largeTitle },
  close: { ...Type.bodyStrong },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  scoreHero: { borderRadius: Radius.xl, padding: 24, alignItems: 'center', marginBottom: 24 },
  heroKicker: { ...Type.caption, opacity: 0.85 },
  heroScore: { fontSize: 72, fontWeight: '800', marginTop: 4 },
  heroOutOf: { ...Type.subhead, opacity: 0.9 },
  heroTrend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  heroTrendText: { ...Type.subhead, opacity: 0.9 },
  sectionTitle: { ...Type.headline, marginBottom: 12, marginTop: 8 },
  card: { borderRadius: Radius.lg, padding: 16, marginBottom: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { ...Type.bodyStrong },
  rowValue: { fontSize: 20, fontWeight: '800' },
  trendBadge: { ...Type.subhead, fontWeight: '700' },
  track: { height: 8, borderRadius: Radius.pill, marginTop: 10, overflow: 'hidden' },
  fillBar: { height: 8, borderRadius: Radius.pill },
  rowDesc: { ...Type.subhead, marginTop: 8 },
  protoMeta: { ...Type.footnote, marginTop: 8 },
  mdHeading: { ...Type.bodyStrong, marginTop: 8, marginBottom: 2 },
  mdText: { ...Type.body },
  mdBulletRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  mdBulletDot: { ...Type.body },
  emoji: { fontSize: 56 },
  emptyTitle: { ...Type.sectionTitle, textAlign: 'center' },
  muted: { ...Type.body, textAlign: 'center' },
  cta: { marginTop: 12, alignSelf: 'stretch' },
});
