/**
 * Vitality score breakdown ("My Score"). Shows the composite Vitality Score and
 * the four subscores that make it up. Opened from the Home vitality card. Handles
 * three states: no submissions yet, latest sample still analyzing, score ready.
 */
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLatestScore, type Subscore } from '@/api/score';
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
            </View>

            <Text style={[styles.sectionTitle, { color: t.text }]}>What makes up your score</Text>
            {data.subscores.map((s) => (
              <SubscoreRow key={s.key} subscore={s} />
            ))}

            {data.generatedAt ? (
              <Text style={[styles.muted, { color: t.textTertiary, marginTop: 8 }]}>
                Last updated {new Date(data.generatedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          // 'none' or 'analyzing'
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

function SubscoreRow({ subscore }: { subscore: Subscore }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, subscore.value));
  return (
    <View style={[styles.row, { backgroundColor: t.surface }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowLabel, { color: t.text }]}>{subscore.label}</Text>
        <Text style={[styles.rowValue, { color: t.vitality }]}>{subscore.value}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.surfaceElevated }]}>
        <View style={[styles.fillBar, { width: `${pct}%`, backgroundColor: t.vitality }]} />
      </View>
      <Text style={[styles.rowDesc, { color: t.textTertiary }]}>{subscore.description}</Text>
    </View>
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
  sectionTitle: { ...Type.headline, marginBottom: 12 },
  row: { borderRadius: Radius.lg, padding: 16, marginBottom: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...Type.bodyStrong },
  rowValue: { fontSize: 20, fontWeight: '800' },
  track: { height: 8, borderRadius: Radius.pill, marginTop: 10, overflow: 'hidden' },
  fillBar: { height: 8, borderRadius: Radius.pill },
  rowDesc: { ...Type.subhead, marginTop: 8 },
  emoji: { fontSize: 56 },
  emptyTitle: { ...Type.sectionTitle, textAlign: 'center' },
  muted: { ...Type.body, textAlign: 'center' },
  cta: { marginTop: 12, alignSelf: 'stretch' },
});
