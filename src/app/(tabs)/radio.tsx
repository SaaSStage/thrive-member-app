import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGrantedStations, type ContentAsset } from '@/api/content';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function Radio() {
  const t = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useGrantedStations();

  function onPlay(asset: ContentAsset) {
    if (!asset.stream_url) return;
    // TODO(playback): re-enable src/audio/player once the player library is
    // upgraded/replaced. RNTP 4.1.2 is incompatible with RN 0.85's New-Arch
    // TurboModule interop. The data path below (granted stations) is verified.
    Alert.alert(
      'Playback coming next',
      'Your sign-in and authorized station list work. Audio playback is being upgraded for React Native 0.85.',
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <Text style={[styles.title, { color: t.text }]}>Radio</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Live stations your provider authorized
        </Text>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.stateText, { color: t.textSecondary }]}>
              Couldn&apos;t load your stations.
            </Text>
            <Pressable onPress={() => refetch()} hitSlop={8}>
              <Text style={[styles.retry, { color: t.link }]}>Try again</Text>
            </Pressable>
          </View>
        ) : !data || data.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.stateText, { color: t.textSecondary }]}>
              No stations yet. Your provider hasn&apos;t authorized any live stations.
            </Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(a) => a.id}
            onRefresh={refetch}
            refreshing={isRefetching}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
            ItemSeparatorComponent={() => (
              <View style={[styles.sep, { backgroundColor: t.hairline }]} />
            )}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => onPlay(item)}>
                <View style={[styles.art, { backgroundColor: t.surfaceElevated }]}>
                  <Ionicons name="radio" size={26} color={t.textSecondary} />
                </View>
                <View style={styles.meta}>
                  <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.live, { color: t.live }]} numberOfLines={1}>
                    ● LIVE{item.description ? `  ·  ${item.description}` : ''}
                  </Text>
                </View>
                <Ionicons name="play-circle" size={34} color={t.primary} />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, paddingHorizontal: 20, paddingTop: 8 },
  subtitle: { fontSize: 14, paddingHorizontal: 20, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  stateText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  retry: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  art: { width: 54, height: 54, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  live: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 86 },
});
