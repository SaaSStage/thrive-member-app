import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGrantedContent, type ContentAsset } from '@/api/content';
import { isProfileComplete, useVoiceProfile } from '@/api/profile';
import { useLatestScore } from '@/api/score';
import { ArtTile } from '@/components/ui/art-tile';
import { Aura } from '@/components/ui/aura';
import { CardMandala, Mandala } from '@/components/ui/mandala';
import { SectionHeader } from '@/components/ui/section-header';
import { ProfileBanner } from '@/components/voice/profile-banner';
import { ContentHues, Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function typeLabel(a: ContentAsset): string {
  switch (a.asset_type) {
    case 'radio_station':
      return 'Live now';
    case 'playlist':
      return 'Playlist';
    case 'frequency':
      return 'Frequency';
    default:
      return 'On-demand';
  }
}

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { data, isLoading } = useGrantedContent();
  const { data: profile } = useVoiceProfile();
  const { data: score } = useLatestScore();
  const ready = score?.state === 'ready';
  const vitalityValue = ready ? String(score.vitalityScore) : '—';
  const trend = ready ? score.vitalityTrend : null;
  const trendLabel = trend
    ? `${trend.direction === 'improving' ? '▲' : trend.direction === 'declining' ? '▼' : '▶'} ${Math.abs(
        trend.magnitude,
      )} this week`
    : 'Tap to see your breakdown';

  function open(asset: ContentAsset) {
    if (asset.asset_type === 'radio_station') router.push(`/station/${asset.id}` as Href);
  }

  function openVoice() {
    if (isProfileComplete(profile)) {
      router.push({ pathname: '/voice', params: { lang: profile?.preferred_language ?? 'en' } } as Href);
    } else {
      router.push({ pathname: '/profile-setup', params: { then: 'voice' } } as Href);
    }
  }

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={[styles.greet, { color: t.text }]}>Good evening</Text>
            <Pressable onPress={() => router.push('/account' as Href)} hitSlop={10}>
              <ArtTile seed="me" style={styles.avatar} radius={18} fill />
            </Pressable>
          </View>

          <ProfileBanner />

          <View style={styles.cardRow}>
            {/* Vitality dial → score breakdown */}
            <Pressable style={[styles.card, styles.glass]} onPress={() => router.push('/score' as Href)}>
              <View style={styles.dialWrap}>
                <Mandala
                  size={92}
                  colors={Gradients.gold as unknown as string[]}
                  motion="breathe"
                  opacity={0.5}
                  glow={0.8}
                  breatheRange={0.17}
                  breatheMs={5600}
                  dynamicBlur
                />
                <Text style={[styles.dialNum, { color: t.text }]}>{vitalityValue}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.kicker, { color: t.textSecondary }]}>VITALITY</Text>
                <Text style={[styles.cardTitle, { color: t.text }]}>
                  {ready ? 'Flourishing' : 'No score yet'}
                </Text>
                <Text style={[styles.cardHint, { color: t.vitality }]}>
                  {ready ? trendLabel : 'Take a voice check-in'}
                </Text>
              </View>
            </Pressable>

            {/* Voice check-in */}
            <Pressable style={[styles.voiceCard, styles.glass]} onPress={openVoice}>
              <CardMandala colors={Gradients.teal as unknown as string[]} size={195} opacity={0.42} glow={0.55} />
              <Text style={[styles.kicker, { color: t.textSecondary }]}>VOICE CHECK-IN</Text>
              <Text style={[styles.voiceTitle, { color: t.text }]}>Tune your weekly sample</Text>
              <Text style={[styles.cardHint, { color: t.textSecondary }]}>~2 min · 3 recordings</Text>
            </Pressable>
          </View>

          <SectionHeader title="From Your Provider" />

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={t.primary} />
            </View>
          ) : !data || data.length === 0 ? (
            <Text style={[styles.empty, { color: t.textSecondary }]}>
              Your provider hasn&apos;t added content yet.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tileRow}>
              {data.map((asset, i) => (
                <Pressable key={asset.id} style={styles.tileCell} onPress={() => open(asset)}>
                  <ArtTile
                    seed={asset.code}
                    colors={ContentHues[i % ContentHues.length]}
                    style={styles.tile}
                    radius={Radius.lg}
                  />
                  <Text style={[styles.tileName, { color: t.text }]} numberOfLines={1}>
                    {asset.name}
                  </Text>
                  <Text style={[styles.tileSub, { color: t.textSecondary }]} numberOfLines={1}>
                    {typeLabel(asset)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </ScrollView>
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
  },
  greet: { ...Type.screenTitle, fontSize: 30 },
  avatar: { width: 38, height: 38 },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  cardRow: { paddingHorizontal: 20, gap: 14, paddingTop: 16 },
  card: {
    borderRadius: Radius.xxl,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dialWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  dialNum: { position: 'absolute', ...Type.numeral, fontSize: 30 },
  cardText: { flex: 1 },
  kicker: { ...Type.caption },
  cardTitle: { ...Type.sectionTitle, fontSize: 21, marginTop: 2 },
  cardHint: { ...Type.subhead, fontWeight: '600', marginTop: 4 },
  voiceCard: { borderRadius: Radius.xxl, padding: 16, height: 104, justifyContent: 'center', overflow: 'hidden' },
  voiceTitle: { ...Type.headline, marginTop: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 30, alignItems: 'center' },
  empty: { ...Type.body, paddingHorizontal: 20, paddingVertical: 16 },
  tileRow: { paddingHorizontal: 20, gap: 14 },
  tileCell: { width: 300, gap: 8 },
  tile: { width: 300, height: 150 },
  tileName: { ...Type.bodyStrong },
  tileSub: { ...Type.subhead },
});
