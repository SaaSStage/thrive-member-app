import { useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGrantedContent, type ContentAsset } from '@/api/content';
import { ArtTile } from '@/components/ui/art-tile';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius } from '@/constants/theme';
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

  function open(asset: ContentAsset) {
    if (asset.asset_type === 'radio_station') {
      router.push(`/station/${asset.id}` as Href);
    }
    // playlist/frequency/on-demand detail pages: TODO (future slice).
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: t.text }]}>Home</Text>
            <ArtTile seed="me" style={styles.avatar} radius={18} />
          </View>

          {/* Vitality + Voice entry cards (wired to Score/Voice flows in a later slice). */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}>
            <View style={[styles.bigCard, { backgroundColor: t.vitality }]}>
              <Text style={[styles.cardKicker, { color: t.onVitality }]}>YOUR VITALITY SCORE</Text>
              <Text style={[styles.cardScore, { color: t.onVitality }]}>—</Text>
              <Text style={[styles.cardSub, { color: t.onVitality }]}>Take a voice check-in to see it</Text>
            </View>
            <View style={[styles.bigCard, { backgroundColor: '#bf5af2' }]}>
              <Text style={styles.cardKickerLight}>VOICE CHECK-IN</Text>
              <Text style={styles.cardTitleLight}>Record your weekly sample</Text>
              <Text style={styles.cardSubLight}>~2 min · 3 short recordings</Text>
            </View>
          </ScrollView>

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
              {data.map((asset) => (
                <Pressable key={asset.id} style={styles.tileCell} onPress={() => open(asset)}>
                  <ArtTile seed={asset.code} style={styles.tile} radius={Radius.lg} />
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
    paddingTop: 8,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  avatar: { width: 36, height: 36 },
  cardRow: { paddingHorizontal: 20, gap: 14, paddingTop: 14 },
  bigCard: { width: 230, height: 130, borderRadius: Radius.xl, padding: 14, justifyContent: 'flex-start' },
  cardKicker: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  cardScore: { fontSize: 40, fontWeight: '800', marginTop: 4 },
  cardSub: { fontSize: 12, fontWeight: '600', opacity: 0.9 },
  cardKickerLight: { fontSize: 12, fontWeight: '700', color: '#fff', opacity: 0.9 },
  cardTitleLight: { fontSize: 19, fontWeight: '700', color: '#fff', marginTop: 8, lineHeight: 23 },
  cardSubLight: { fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 8 },
  loading: { paddingVertical: 30, alignItems: 'center' },
  empty: { fontSize: 15, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 21 },
  tileRow: { paddingHorizontal: 20, gap: 14 },
  tileCell: { width: 300, gap: 8 },
  tile: { width: 300, height: 150 },
  tileName: { fontSize: 15, fontWeight: '600' },
  tileSub: { fontSize: 13 },
});
