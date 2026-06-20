/**
 * Voice-submission modal host (Screens A–G). Renders the right screen for the
 * store's current step — mirrors the Flutter `VoiceSubmissionFlow` host. Opened
 * as a modal from the Home entry cards; presentation registered in _layout.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VoiceRecordingView } from '@/components/voice/recording-view';
import { VoiceReviewView } from '@/components/voice/review-view';
import { Aura } from '@/components/ui/aura';
import { Button } from '@/components/ui/button';
import { MicGlyph } from '@/components/ui/mic-glyph';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVoiceStore } from '@/stores/voice-store';

export default function VoiceModal() {
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const step = useVoiceStore((s) => s.step);
  const currentIndex = useVoiceStore((s) => s.currentIndex);
  const openFlow = useVoiceStore((s) => s.openFlow);

  // Fresh session each time the modal opens (resets captured + picks a passage).
  useEffect(() => {
    openFlow(lang ?? 'en');
  }, [lang, openFlow]);

  switch (step) {
    case 'recording':
      // Keyed by index so it fully resets between the three recordings.
      return <VoiceRecordingView key={currentIndex} />;
    case 'review':
      return <VoiceReviewView />;
    case 'uploading':
      return <UploadingView />;
    case 'success':
      return <SuccessView />;
    case 'intro':
    default:
      return <IntroView />;
  }
}

function IntroView() {
  const t = useTheme();
  const router = useRouter();
  const begin = useVoiceStore((s) => s.begin);
  return (
    <Aura>
      <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
        <View style={styles.heroContent}>
          <View style={styles.micWrap}>
            <MicGlyph size={84} />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Record three short samples</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            We’ll record three short audio samples. Total time is about 90 seconds. Find a quiet space
            and have a glass of water nearby.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Continue" variant="primary" onPress={() => begin()} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </Aura>
  );
}

function UploadingView() {
  const t = useTheme();
  const uploaded = useVoiceStore((s) => s.uploadedCount);
  const total = useVoiceStore((s) => Object.keys(s.captured).length);
  const stillUploading = uploaded < total;
  return (
    <Aura>
      <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
        <View style={styles.heroContent}>
          <ActivityIndicator color={t.primary} size="large" />
          <Text style={[styles.title, { color: t.text, marginTop: 24 }]}>
            {stillUploading ? `Uploading ${uploaded + 1} of ${total}…` : 'Finishing up…'}
          </Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>Please keep the app open.</Text>
        </View>
      </SafeAreaView>
    </Aura>
  );
}

function SuccessView() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Aura>
      <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
        <View style={styles.heroContent}>
          <Text style={[styles.icon, { color: t.success }]}>✓</Text>
          <Text style={[styles.title, { color: t.text }]}>Sample submitted</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            Your provider will review it shortly.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Done" variant="primary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </Aura>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 32 },
  heroContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  micWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  center: { alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 64 },
  title: { ...Type.sectionTitle, textAlign: 'center' },
  body: { ...Type.body, textAlign: 'center', maxWidth: 300 },
  actions: { gap: 10 },
});
