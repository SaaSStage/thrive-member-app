/**
 * Flow-level state for the guided voice-submission session (Screens A–G).
 * Zustand, mirroring player-store's pattern. The recording screen captures a
 * file + validation and reports it via `captureRecording`, which advances the
 * flow; upload orchestration lives in `useVoiceSubmission` (it needs the authed
 * Supabase client), and writes progress back through these setters.
 *
 * Re-implemented from the v3 Flutter `VoiceSubmissionCubit`.
 */
import { create } from 'zustand';

import { randomPassageForLanguage, type ReadingPassage } from '@/voice/passages';
import { RECORDING_ORDER, type VoiceRecordingType } from '@/voice/recording-type';
import type { VoiceValidationResult } from '@/voice/validator';

export type VoiceFlowStep = 'intro' | 'recording' | 'review' | 'uploading' | 'success';

export type CapturedRecording = {
  type: VoiceRecordingType;
  uri: string;
  durationMs: number;
  validation: VoiceValidationResult;
  /** Only set for the reading passage. */
  passageCode?: string;
  languageUsed?: string;
};

type VoiceState = {
  step: VoiceFlowStep;
  currentIndex: number;
  captured: Partial<Record<VoiceRecordingType, CapturedRecording>>;
  passage: ReadingPassage;
  uploadedCount: number;
  uploadError: string | null;
  submissionId: string | null;

  /** Reset to intro with a fresh randomized passage for the language. */
  openFlow: (preferredLanguage: string) => void;
  /** Intro → first recording. */
  begin: () => void;
  /** Store a finished recording; advance to the next or to review. */
  captureRecording: (rec: CapturedRecording) => void;
  /** Re-record a specific type from the review screen. */
  reRecord: (type: VoiceRecordingType) => void;
  setStep: (step: VoiceFlowStep) => void;
  setUploadedCount: (n: number) => void;
  setUploadError: (msg: string | null) => void;
  setSubmissionId: (id: string | null) => void;
};

function currentType(index: number): VoiceRecordingType {
  return RECORDING_ORDER[index];
}

/** Next index (from `from`) whose type isn't captured; wraps; null if all done. */
function nextUncapturedIndex(
  captured: Partial<Record<VoiceRecordingType, CapturedRecording>>,
  from: number,
): number | null {
  for (let i = from; i < RECORDING_ORDER.length; i++) {
    if (!captured[RECORDING_ORDER[i]]) return i;
  }
  for (let i = 0; i < RECORDING_ORDER.length; i++) {
    if (!captured[RECORDING_ORDER[i]]) return i;
  }
  return null;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  step: 'intro',
  currentIndex: 0,
  captured: {},
  passage: randomPassageForLanguage('en'),
  uploadedCount: 0,
  uploadError: null,
  submissionId: null,

  openFlow: (preferredLanguage) =>
    set({
      step: 'intro',
      currentIndex: 0,
      captured: {},
      passage: randomPassageForLanguage(preferredLanguage),
      uploadedCount: 0,
      uploadError: null,
      submissionId: null,
    }),

  begin: () => set({ step: 'recording', currentIndex: 0 }),

  captureRecording: (rec) => {
    const captured = { ...get().captured, [rec.type]: rec };
    const next = nextUncapturedIndex(captured, get().currentIndex);
    if (next === null) {
      set({ captured, step: 'review' });
    } else {
      set({ captured, step: 'recording', currentIndex: next });
    }
  },

  reRecord: (type) => set({ step: 'recording', currentIndex: RECORDING_ORDER.indexOf(type) }),

  setStep: (step) => set({ step }),
  setUploadedCount: (uploadedCount) => set({ uploadedCount }),
  setUploadError: (uploadError) => set({ uploadError }),
  setSubmissionId: (submissionId) => set({ submissionId }),
}));

/** Selector: the recording type currently being captured. */
export function useCurrentRecordingType(): VoiceRecordingType {
  return useVoiceStore((s) => currentType(s.currentIndex));
}

/** Captured recordings in capture order (for the review screen). */
export function orderedRecordings(
  captured: Partial<Record<VoiceRecordingType, CapturedRecording>>,
): CapturedRecording[] {
  return RECORDING_ORDER.map((t) => captured[t]).filter((r): r is CapturedRecording => !!r);
}
