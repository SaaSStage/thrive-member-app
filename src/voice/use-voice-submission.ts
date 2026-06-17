/**
 * Drives the upload step: takes the captured recordings from the voice store,
 * runs the uploader with the authed Supabase client, and writes progress / the
 * outcome back into the store. Kept as a hook because the uploader needs the
 * Clerk-bound Supabase client (useSupabase). Mirrors the Flutter cubit's submit().
 */
import { useCallback } from 'react';

import { useSupabase } from '@/api/supabase';
import { orderedRecordings, useVoiceStore } from '@/stores/voice-store';
import { submitRecordings, VoiceUploadError } from '@/voice/uploader';

export function useVoiceSubmission(): () => Promise<void> {
  const supabase = useSupabase();

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
    } catch (e) {
      useVoiceStore.getState().setUploadError(e instanceof VoiceUploadError ? e.message : String(e));
      useVoiceStore.getState().setStep('review');
    }
  }, [supabase]);
}
