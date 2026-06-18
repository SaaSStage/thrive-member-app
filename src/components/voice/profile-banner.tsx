/**
 * Home profile-completion banner (spec §8). Appears only when the voice-analysis
 * profile is incomplete; tapping starts the Profile Setup wizard. Not a hard
 * block on the rest of the app — just the prompt to unlock voice analysis.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isProfileComplete, useVoiceProfile } from '@/api/profile';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ProfileBanner() {
  const t = useTheme();
  const router = useRouter();
  const { data: profile, isLoading } = useVoiceProfile();

  if (isLoading || isProfileComplete(profile)) return null;

  return (
    <Pressable
      onPress={() => router.push('/profile-setup')}
      style={[styles.banner, { backgroundColor: t.linkSoft }]}>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: t.text }]}>Complete your profile to unlock voice analysis</Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>Tap to set up — takes about a minute.</Text>
      </View>
      <Text style={[styles.chevron, { color: t.link }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 14,
    padding: 14,
    borderRadius: Radius.lg,
  },
  textWrap: { flex: 1 },
  title: { ...Type.bodyStrong },
  sub: { ...Type.subhead, marginTop: 2 },
  chevron: { fontSize: 24, fontWeight: '300' },
});
