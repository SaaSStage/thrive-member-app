/**
 * Settings → Profile (spec §2.3) — view/edit all voice-analysis profile fields
 * on one screen. Same controls as the setup wizard. Reachable from the Account
 * screen regardless of completion state.
 */
/* eslint-disable react-hooks/set-state-in-effect -- intentional: prefill local
   form state once from the loaded server profile so existing values are editable. */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  LANGUAGE_OPTIONS,
  RESPIRATORY_OPTIONS,
  SEX_OPTIONS,
  SMOKING_OPTIONS,
  VOCAL_OPTIONS,
  useUpdateVoiceProfile,
  useVoiceProfile,
  type BiologicalSex,
  type PreferredLanguage,
  type RespiratoryCondition,
  type SmokingStatus,
  type VocalCondition,
} from '@/api/profile';
import { Button } from '@/components/ui/button';
import { MultiSelect, SingleSelect, YearField } from '@/components/voice/profile-fields';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileEdit() {
  const t = useTheme();
  const router = useRouter();
  const { data: profile, isLoading } = useVoiceProfile();
  const update = useUpdateVoiceProfile();

  const [yob, setYob] = useState<number | null>(null);
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [smoking, setSmoking] = useState<SmokingStatus | null>(null);
  const [respiratory, setRespiratory] = useState<RespiratoryCondition[]>([]);
  const [vocal, setVocal] = useState<VocalCondition[]>([]);
  const [language, setLanguage] = useState<PreferredLanguage>('en');

  useEffect(() => {
    if (!profile) return;
    setYob(profile.year_of_birth);
    setSex(profile.biological_sex);
    setSmoking(profile.smoking_status);
    setRespiratory(profile.respiratory_conditions);
    setVocal(profile.vocal_conditions);
    setLanguage(profile.preferred_language);
  }, [profile]);

  async function save() {
    await update.mutateAsync({
      year_of_birth: yob,
      biological_sex: sex,
      smoking_status: smoking,
      respiratory_conditions: respiratory,
      vocal_conditions: vocal,
      preferred_language: language,
    });
    router.back();
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <Text style={[styles.title, { color: t.text }]}>Health profile</Text>
              <Text style={[styles.note, { color: t.textSecondary }]}>
                Changes to these fields may recompute your voice baseline.
              </Text>
              <YearField value={yob} onChange={setYob} />
              <SingleSelect label="Biological sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />
              <SingleSelect label="Smoking status" options={SMOKING_OPTIONS} value={smoking} onChange={setSmoking} />
              <MultiSelect
                label="Respiratory conditions"
                options={RESPIRATORY_OPTIONS}
                value={respiratory}
                onChange={setRespiratory}
              />
              <MultiSelect label="Vocal conditions" options={VOCAL_OPTIONS} value={vocal} onChange={setVocal} />
              <SingleSelect
                label="Reading language"
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={setLanguage}
              />
            </ScrollView>
            <View style={styles.footer}>
              <Button label="Save" variant="primary" loading={update.isPending} onPress={() => void save()} />
              <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  title: { ...Type.screenTitle, marginBottom: 8 },
  note: { ...Type.subhead, marginBottom: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
});
