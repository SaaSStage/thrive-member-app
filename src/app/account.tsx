/**
 * Account screen — opened from the Home avatar. Minimal: shows the member and
 * links to the voice-analysis health profile (Settings → Profile). Home for
 * account actions; this app had no settings surface before.
 */
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVoiceProfile, isProfileComplete } from '@/api/profile';
import { Button } from '@/components/ui/button';
import { ArtTile } from '@/components/ui/art-tile';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function Account() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { data: profile } = useVoiceProfile();
  const complete = isProfileComplete(profile);

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const name = user?.fullName ?? email;

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: t.text }]}>Account</Text>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={[styles.close, { color: t.textSecondary }]}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.identity}>
            <ArtTile seed={email || 'me'} style={styles.avatar} radius={28} />
            <View style={styles.idText}>
              {name ? <Text style={[styles.name, { color: t.text }]}>{name}</Text> : null}
              <Text style={[styles.email, { color: t.textSecondary }]}>{email}</Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push('/profile')}
            style={[styles.rowCard, { backgroundColor: t.surface }]}>
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowTitle, { color: t.text }]}>Health profile</Text>
              <Text style={[styles.rowSub, { color: t.textTertiary }]}>
                {complete ? 'Used to interpret your voice analysis' : 'Incomplete — tap to finish'}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: complete ? t.textTertiary : t.primary }]}>›</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.largeTitle },
  close: { ...Type.bodyStrong },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 24, marginBottom: 28 },
  avatar: { width: 56, height: 56 },
  idText: { flex: 1 },
  name: { ...Type.headline },
  email: { ...Type.subhead, marginTop: 2 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: 16,
  },
  rowTextWrap: { flex: 1 },
  rowTitle: { ...Type.bodyStrong },
  rowSub: { ...Type.subhead, marginTop: 2 },
  chevron: { fontSize: 24, fontWeight: '300' },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
});
