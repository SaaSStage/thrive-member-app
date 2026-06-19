/**
 * Screens B / C / D — the per-recording capture UI, parameterized by the current
 * recording type. Owns local capture state (start/stop, countdown), runs
 * on-device validation on stop, and reports the finished recording to the voice
 * store (which advances the flow). Re-implemented from the v3 Flutter
 * `voice_recording_view.dart`.
 */
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelRecording, ensureRecordingPermission, startRecording, stopRecording } from '@/audio/recorder';
import { Aura } from '@/components/ui/aura';
import { Button } from '@/components/ui/button';
import { Mandala } from '@/components/ui/mandala';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVoiceStore } from '@/stores/voice-store';
import { configFor, RECORDING_ORDER } from '@/voice/recording-type';
import { validateWav, type VoiceValidationResult } from '@/voice/validator';

const TICK_MS = 100;
/** After this many failed takes for a type, offer a force-through escape hatch. */
const FORCE_THROUGH_AFTER = 3;

/** A failed take held so the user can force it through instead of re-recording. */
type ForcedTake = { uri: string; durationMs: number; validation: VoiceValidationResult };

export function VoiceRecordingView() {
  const t = useTheme();
  const router = useRouter();
  const currentIndex = useVoiceStore((s) => s.currentIndex);
  const passage = useVoiceStore((s) => s.passage);
  const captureRecording = useVoiceStore((s) => s.captureRecording);
  const registerFailure = useVoiceStore((s) => s.registerFailure);

  const recordingType = RECORDING_ORDER[currentIndex];
  const cfg = configFor(recordingType);
  const isReading = recordingType === 'reading_passage';

  // This view is keyed by currentIndex in the host, so it remounts fresh for
  // each recording (B→C→D / re-record) — no manual reset needed.
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // After 3 fails for this type we keep the failing file + validation so the user
  // can force it through instead of being stuck re-recording forever.
  const [forcedTake, setForcedTake] = useState<ForcedTake | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs decouple the interval from the render that created it: the timer must
  // see the *current* recording state + the latest onStop (not a stale closure),
  // otherwise auto-stop at target duration silently no-ops.
  const isRecordingRef = useRef(false);
  const elapsedRef = useRef(0);
  const onStopRef = useRef<() => void>(() => {});

  // Safety net: if the view leaves mid-recording by ANY path (Cancel, hardware
  // back, swipe-to-dismiss), stop the native recorder and discard the partial
  // file — otherwise the mic keeps running. (On normal advance, onStop already
  // cleared isRecordingRef, so this won't cancel a completed recording.)
  useEffect(() => () => {
    if (ticker.current) clearInterval(ticker.current);
    if (isRecordingRef.current) void cancelRecording();
  }, []);

  function stopTicker() {
    if (ticker.current) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  }

  async function onStart() {
    setBusy(true);
    setError(null);
    setForcedTake(null); // re-recording supersedes any held failing take
    try {
      const granted = await ensureRecordingPermission();
      if (!granted) {
        fail('Microphone permission is required to record.');
        return;
      }
      await startRecording(recordingType);
      isRecordingRef.current = true;
      elapsedRef.current = 0;
      setIsRecording(true);
      setBusy(false);
      setElapsedMs(0);
      ticker.current = setInterval(() => {
        elapsedRef.current += TICK_MS;
        setElapsedMs(elapsedRef.current);
        if (elapsedRef.current >= cfg.targetMs) onStopRef.current(); // auto-stop
      }, TICK_MS);
    } catch (e) {
      fail(`Could not start recording: ${String(e)}`);
    }
  }

  async function onStop() {
    stopTicker();
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setBusy(true);
    try {
      const rec = await stopRecording();
      const bytes = await new File(rec.uri).arrayBuffer();
      const validation = validateWav(bytes, recordingType);
      if (!validation.passed) {
        const failCount = registerFailure(recordingType);
        const message =
          validation.firstFailureMessage ??
          'That recording didn’t pass our quality check. Please try again.';
        if (failCount >= FORCE_THROUGH_AFTER) {
          // Stop discarding: keep the file so the user can force it through.
          setForcedTake({ uri: rec.uri, durationMs: rec.durationMs, validation });
          fail(message);
          return;
        }
        try {
          new File(rec.uri).delete();
        } catch {
          /* best-effort */
        }
        fail(message);
        return;
      }
      captureRecording({
        type: recordingType,
        uri: rec.uri,
        durationMs: rec.durationMs,
        validation,
        passageCode: isReading ? passage.code : undefined,
        languageUsed: isReading ? passage.language : undefined,
      });
      // The store advances the flow; this view re-renders for the next type.
    } catch (e) {
      fail(`Could not finish recording: ${String(e)}`);
    }
  }

  // Force-through: submit the held failing take (validation.passed === false) and
  // advance the flow. The file is NOT deleted, so it survives to upload.
  function forceThrough() {
    if (!forcedTake) return;
    captureRecording({
      type: recordingType,
      uri: forcedTake.uri,
      durationMs: forcedTake.durationMs,
      validation: forcedTake.validation,
      passageCode: isReading ? passage.code : undefined,
      languageUsed: isReading ? passage.language : undefined,
    });
  }

  function fail(message: string) {
    stopTicker();
    isRecordingRef.current = false;
    setIsRecording(false);
    setBusy(false);
    setError(message);
  }

  // Abort the whole submission: stop + discard any in-progress recording and
  // close the modal. (Captured clips from earlier steps are dropped; the flow
  // resets the next time it's opened.)
  async function onCancel() {
    stopTicker();
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      try {
        await cancelRecording();
      } catch {
        /* best-effort */
      }
    }
    // A held forced take has already stopped recording, so the branch above won't
    // reach it — delete its file here so abandoning doesn't leak the WAV. (On the
    // "Use this recording anyway" path the file is kept and uploaded, not here.)
    if (forcedTake) {
      try {
        new File(forcedTake.uri).delete();
      } catch {
        /* best-effort */
      }
    }
    router.back();
  }

  // Keep the interval's stop callback pointed at the current closure (updating a
  // ref must happen in an effect, not during render).
  useEffect(() => {
    onStopRef.current = onStop;
  });

  const remainingMs = Math.max(0, cfg.targetMs - elapsedMs);
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: t.textSecondary }]}>
            Recording {cfg.stepNumber} of 3
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: t.text }]}>{cfg.title}</Text>
          <Text style={[styles.instruction, { color: t.textSecondary }]}>{cfg.instruction}</Text>

          {isReading ? (
            <View style={[styles.passage, { backgroundColor: t.surface }]}>
              <Text style={[styles.passageTitle, { color: t.primary }]}>{passage.title}</Text>
              <Text style={[styles.passageBody, { color: t.text }]}>{passage.body}</Text>
            </View>
          ) : null}

          <View style={styles.dial}>
            <Mandala
              size={236}
              colors={Gradients.teal as unknown as string[]}
              motion="breathe"
              opacity={0.5}
              glow={0.78}
              breatheMs={5600}
              dynamicBlur
            />
            <View style={styles.dialCenter}>
              <Text
                style={[styles.count, { color: t.text }]}
                accessibilityLabel={`${secondsLeft} seconds`}>
                {secondsLeft}
              </Text>
              <Text style={[styles.countLabel, { color: t.textTertiary }]}>
                {isRecording ? 'seconds left' : 'seconds'}
              </Text>
            </View>
          </View>

          {error ? (
            <View style={[styles.error, { backgroundColor: t.primarySoft }]}>
              <Text style={[styles.errorText, { color: t.primary }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={isRecording ? 'Stop' : 'Start recording'}
            variant={isRecording ? 'primary' : 'green'}
            loading={busy}
            onPress={isRecording ? onStop : onStart}
          />
          {forcedTake && !isRecording ? (
            <Button label="Use this recording anyway" variant="ghost" onPress={forceThrough} />
          ) : null}
          {cfg.hasAudioExample && !isRecording ? (
            <Button label="Hear example (coming soon)" variant="ghost" onPress={() => {}} disabled />
          ) : null}
          <Button label={isRecording ? 'Cancel recording' : 'Cancel'} variant="ghost" onPress={() => void onCancel()} />
        </View>
      </SafeAreaView>
    </Aura>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4, alignItems: 'center' },
  headerText: { ...Type.bodyStrong },
  body: { paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center' },
  title: { ...Type.sectionTitle, textAlign: 'center', marginTop: 8 },
  instruction: { ...Type.body, textAlign: 'center', marginTop: 12 },
  passage: { borderRadius: Radius.xl, padding: 20, marginTop: 20, alignSelf: 'stretch' },
  passageTitle: { ...Type.bodyStrong, marginBottom: 10 },
  passageBody: { fontSize: 18, lineHeight: 27 },
  dial: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  count: { ...Type.numeral, fontSize: 64, fontVariant: ['tabular-nums'] },
  countLabel: { ...Type.subhead, marginTop: 2 },
  error: { borderRadius: Radius.lg, padding: 12, marginTop: 20, alignSelf: 'stretch' },
  errorText: { ...Type.callout, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
});
