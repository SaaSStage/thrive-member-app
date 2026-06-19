import { useVoiceStore } from '@/stores/voice-store';
import type { CapturedRecording } from '@/stores/voice-store';
import type { VoiceRecordingType } from '@/voice/recording-type';

/**
 * Minimal valid CapturedRecording. `validation.measuredFor` MUST be a function
 * (VoiceValidationResult shape) so captureRecording can run without throwing.
 */
function fakeRecording(type: VoiceRecordingType, passed = true): CapturedRecording {
  return {
    type,
    uri: `file:///${type}.wav`,
    durationMs: 30000,
    validation: {
      checks: [],
      passed,
      firstFailureMessage: passed ? undefined : 'x',
      measuredFor: () => 0,
    },
  };
}

describe('voice-store — failure counts', () => {
  // openFlow resets failureCounts + captured to {} for a clean slate per test.
  beforeEach(() => {
    useVoiceStore.getState().openFlow('en');
  });

  it('registerFailure increments that type and returns the new count', () => {
    const first = useVoiceStore.getState().registerFailure('sustained_vowel');
    expect(first).toBe(1);
    expect(useVoiceStore.getState().failureCounts.sustained_vowel).toBe(1);

    const second = useVoiceStore.getState().registerFailure('sustained_vowel');
    expect(second).toBe(2);
    expect(useVoiceStore.getState().failureCounts.sustained_vowel).toBe(2);
  });

  it('registerFailure on one type leaves other types untouched', () => {
    useVoiceStore.getState().registerFailure('sustained_vowel');
    useVoiceStore.getState().registerFailure('sustained_vowel');
    const counts = useVoiceStore.getState().failureCounts;
    expect(counts.sustained_vowel).toBe(2);
    expect(counts.reading_passage ?? 0).toBe(0);
    expect(counts.diadochokinetic ?? 0).toBe(0);
  });

  it('a successful captureRecording resets only that type counter, leaving others intact', () => {
    useVoiceStore.getState().registerFailure('sustained_vowel');
    useVoiceStore.getState().registerFailure('sustained_vowel');
    useVoiceStore.getState().registerFailure('reading_passage');

    useVoiceStore.getState().captureRecording(fakeRecording('sustained_vowel'));

    const counts = useVoiceStore.getState().failureCounts;
    expect(counts.sustained_vowel).toBe(0);
    expect(counts.reading_passage).toBe(1);
  });

  it('openFlow resets ALL failureCounts', () => {
    useVoiceStore.getState().registerFailure('sustained_vowel');
    useVoiceStore.getState().registerFailure('reading_passage');

    useVoiceStore.getState().openFlow('en');

    expect(useVoiceStore.getState().failureCounts).toEqual({});
  });
});
