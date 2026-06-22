/**
 * Drives the upload step: takes the captured recordings from the voice store,
 * runs the uploader with the authed Supabase client, and writes progress / the
 * outcome back into the store. Kept as a hook because the uploader needs the
 * Clerk-bound Supabase client (useSupabase). Mirrors the Flutter cubit's submit().
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useSupabase } from '@/api/supabase';
import { orderedRecordings, useVoiceStore } from '@/stores/voice-store';
import { submitRecordings, VoiceUploadError } from '@/voice/uploader';

export function useVoiceSubmission(): () => Promise<void> {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const store = useVoiceStore.getState();
    store.setStep('uploading');
    store.setUploadedCount(0);
    store.setUploadError(null);
    try {
      const id = await submitRecordings(
        supabase,
        orderedRecordings(useVoiceStore.getState().captured),
        (uploaded) => useVoiceStore.getState().setUploadedCount(uploaded),
      );
      useVoiceStore.getState().setSubmissionId(id);
      useVoiceStore.getState().setStep('success');
      // A new submission exists → refetch status now so the screen picks up the
      // 'processing' state and the gated polling starts (it stops once terminal).
      void queryClient.invalidateQueries({ queryKey: ['submission-status'] });
    } catch (e) {
      useVoiceStore.getState().setUploadError(e instanceof VoiceUploadError ? e.message : String(e));
      useVoiceStore.getState().setStep('review');
    }
  }, [supabase, queryClient]);
}
