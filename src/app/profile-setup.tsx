/**
 * Profile Setup wizard (spec §2.2) — collects the voice-analysis clinical fields
 * one time, in 3 steps. Triggered from the Home banner or before a first voice
 * submission (gating). On finish it persists and returns; if opened with
 * `?then=voice`, it continues straight into the voice flow.
 */
/* eslint-disable react-hooks/set-state-in-effect -- intentional: prefill local
   form state once from the loaded server profile so existing values are editable. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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

export default function ProfileSetup() {
  const t = useTheme();
  const router = useRouter();
  const { then: thenParam } = useLocalSearchParams<{ then?: string }>();
  const { data: profile } = useVoiceProfile();
  const update = useUpdateVoiceProfile();

  const [step, setStep] = useState(0);
  const [yob, setYob] = useState<number | null>(null);
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [smoking, setSmoking] = useState<SmokingStatus | null>(null);
  const [respiratory, setRespiratory] = useState<RespiratoryCondition[]>([]);
  const [vocal, setVocal] = useState<VocalCondition[]>([]);
  const [language, setLanguage] = useState<PreferredLanguage>('en');

  // Prefill from any existing values (so this also works as a re-run / edit).
  useEffect(() => {
    if (!profile) return;
    setYob(profile.year_of_birth);
    setSex(profile.biological_sex);
    setSmoking(profile.smoking_status);
    setRespiratory(profile.respiratory_conditions);
    setVocal(profile.vocal_conditions);
    setLanguage(profile.preferred_language);
  }, [profile]);

  const canNext =
    (step === 0 && yob != null && sex != null) ||
    (step === 1 && smoking != null && respiratory.length > 0 && vocal.length > 0) ||
    step === 2;

  async function finish() {
    await update.mutateAsync({
      year_of_birth: yob,
      biological_sex: sex,
      smoking_status: smoking,
      respiratory_conditions: respiratory,
      vocal_conditions: vocal,
      preferred_language: language,
    });
    if (thenParam === 'voice') {
      router.replace({ pathname: '/voice', params: { lang: language } });
    } else {
      router.back();
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.kicker, { color: t.textTertiary }]}>STEP {step + 1} OF 3</Text>
          {step === 0 ? (
            <>
              <Text style={[styles.title, { color: t.text }]}>About you</Text>
              <Text style={[styles.intro, { color: t.textSecondary }]}>
                This helps your provider interpret your voice analysis accurately. You only enter it once.
              </Text>
              <YearField value={yob} onChange={setYob} />
              <SingleSelect label="Biological sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />
            </>
          ) : step === 1 ? (
            <>
              <Text style={[styles.title, { color: t.text }]}>Health context</Text>
              <SingleSelect label="Smoking status" options={SMOKING_OPTIONS} value={smoking} onChange={setSmoking} />
              <MultiSelect
                label="Respiratory conditions"
                options={RESPIRATORY_OPTIONS}
                value={respiratory}
                onChange={setRespiratory}
              />
              <MultiSelect label="Vocal conditions" options={VOCAL_OPTIONS} value={vocal} onChange={setVocal} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: t.text }]}>Reading language</Text>
              <Text style={[styles.intro, { color: t.textSecondary }]}>
                Which language should we use for the reading passage?
              </Text>
              <SingleSelect
                label="Preferred language"
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={setLanguage}
              />
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {step < 2 ? (
            <Button label="Continue" variant="primary" disabled={!canNext} onPress={() => setStep((s) => s + 1)} />
          ) : (
            <Button label="Save" variant="primary" loading={update.isPending} onPress={() => void finish()} />
          )}
          <Button
            label={step === 0 ? 'Cancel' : 'Back'}
            variant="ghost"
            onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  kicker: { ...Type.caption, marginBottom: 8 },
  title: { ...Type.screenTitle, marginBottom: 8 },
  intro: { ...Type.body, marginBottom: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
});
