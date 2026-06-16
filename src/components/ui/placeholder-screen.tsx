import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

/** Temporary tab screen until Home/Library/Search are built out. */
export function PlaceholderScreen({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <View style={styles.center}>
          <Text style={[styles.note, { color: t.textTertiary }]}>Coming soon</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, paddingHorizontal: 20, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 15 },
});
