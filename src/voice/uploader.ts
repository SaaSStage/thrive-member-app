/**
 * Uploads a completed voice submission. Closes the loop:
 *   3 WAVs → Supabase Storage (signed URLs) → voice_submissions +
 *   voice_recordings rows → analyze-voice edge function.
 *
 * Matches the shared v3 backend contract exactly (ThriveRadioPortal/supabase):
 * - `voice-upload-urls` edge fn issues SERVICE-ROLE signed upload URLs. This is
 *   required under Clerk: Storage writes the JWT `sub` into a uuid `owner_id`
 *   column, and Clerk's sub is text ("user_..."), so a direct client upload
 *   fails. The signed-URL flow creates the object in a service context.
 * - DB row inserts DO work directly under RLS (client_id = current_user_id()).
 *
 * Re-implemented from the v3 Flutter `VoiceUploaderService`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';

import type { CapturedRecording } from '@/stores/voice-store';
import { RECORDING_CONFIG, RECORDING_ORDER, type VoiceRecordingType } from '@/voice/recording-type';

const BUCKET = 'voice-samples';
const MAX_ATTEMPTS = 3;

export class VoiceUploadError extends Error {}

type SignedTarget = { path: string; token: string };

export type SubmitProgress = (uploaded: number, total: number) => void;

/** Submit the captured recordings. Returns the new submission id on success. */
export async function submitRecordings(
  supabase: SupabaseClient,
  recordings: CapturedRecording[],
  onProgress?: SubmitProgress,
): Promise<string> {
  if (recordings.length !== RECORDING_ORDER.length) {
    throw new VoiceUploadError(`Expected ${RECORDING_ORDER.length} recordings, got ${recordings.length}.`);
  }

  const clientId = await resolveClientId(supabase);
  const practiceId = await resolvePracticeId(supabase);
  const submissionId = Crypto.randomUUID();

  // 1. Service-role signed upload URLs (sidesteps the Clerk owner_id problem).
  const signed = await fetchSignedUploadUrls(
    supabase,
    submissionId,
    recordings.map((r) => r.type),
  );

  // 2. Upload all three in parallel (each with its own retry).
  let uploaded = 0;
  const total = recordings.length;
  const uploadedFiles = await Promise.all(
    recordings.map(async (rec) => {
      const target = signed[rec.type];
      if (!target) throw new VoiceUploadError(`No signed URL for ${rec.type}.`);
      const file = await uploadWithRetry(supabase, rec, target);
      uploaded += 1;
      onProgress?.(uploaded, total);
      return file;
    }),
  );

  // 3. Parent submission row.
  await insertSubmission(supabase, submissionId, clientId, practiceId);
  // 4. Three child recording rows.
  await insertRecordings(supabase, submissionId, uploadedFiles);
  // 5. Trigger analysis (non-fatal — rows are persisted; the score screen polls).
  await triggerAnalyzeVoice(supabase, submissionId);
  // 6. Best-effort cleanup of local WAVs.
  for (const rec of recordings) {
    try {
      new File(rec.uri).delete();
    } catch {
      /* non-fatal */
    }
  }
  return submissionId;
}

// ---- steps -----------------------------------------------------------------

async function resolveClientId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('current_user_id');
  if (error || !data) throw new VoiceUploadError('Not signed in.');
  return data as string;
}

/**
 * The member's active practice membership (denormalized onto the submission;
 * voice_submissions.practice_id is NOT NULL). The one-active-practice constraint
 * makes "first active" unambiguous for members.
 */
async function resolvePracticeId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('practice_memberships')
    .select('practice_id')
    .eq('status', 'active')
    .limit(1);
  if (error) throw new VoiceUploadError(`Could not resolve practice: ${error.message}`);
  const practiceId = data?.[0]?.practice_id as string | undefined;
  if (!practiceId) {
    throw new VoiceUploadError('No active practice membership found for this account.');
  }
  return practiceId;
}

async function fetchSignedUploadUrls(
  supabase: SupabaseClient,
  submissionId: string,
  types: VoiceRecordingType[],
): Promise<Partial<Record<VoiceRecordingType, SignedTarget>>> {
  const { data, error } = await supabase.functions.invoke('voice-upload-urls', {
    body: { submission_id: submissionId, recording_types: types },
  });
  if (error) throw new VoiceUploadError(`Could not prepare upload: ${error.message}`);
  const uploads = (data?.uploads ?? []) as {
    recording_type: VoiceRecordingType;
    path: string;
    token: string;
  }[];
  const byType: Partial<Record<VoiceRecordingType, SignedTarget>> = {};
  for (const u of uploads) byType[u.recording_type] = { path: u.path, token: u.token };
  return byType;
}

type UploadedFile = { recording: CapturedRecording; storagePath: string; sizeBytes: number };

async function uploadWithRetry(
  supabase: SupabaseClient,
  recording: CapturedRecording,
  target: SignedTarget,
): Promise<UploadedFile> {
  const bytes = await new File(recording.uri).arrayBuffer();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(target.path, target.token, bytes, { contentType: 'audio/wav' });
    if (!error) {
      return { recording, storagePath: target.path, sizeBytes: bytes.byteLength };
    }
    lastError = error;
    if (attempt < MAX_ATTEMPTS) await delay(400 * attempt);
  }
  throw new VoiceUploadError(
    `Could not upload ${recording.type} after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}

async function insertSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  clientId: string,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase.from('voice_submissions').insert({
    id: submissionId,
    client_id: clientId,
    practice_id: practiceId,
    provider_id: null,
    status: 'pending',
    recording_count: RECORDING_ORDER.length,
    submitted_at: new Date().toISOString(),
  });
  if (error) throw new VoiceUploadError(`Could not create submission: ${error.message}`);
}

async function insertRecordings(
  supabase: SupabaseClient,
  submissionId: string,
  files: UploadedFile[],
): Promise<void> {
  const appVersion = Device.osBuildId ?? 'unknown';
  const deviceLabel = `${Device.manufacturer ?? ''} ${Device.modelName ?? 'unknown'} (${Device.osName} ${Device.osVersion})`.trim();
  const rows = files.map((f) => {
    const rec = f.recording;
    const v = rec.validation;
    const durationSeconds = rec.durationMs / 1000;
    return {
      submission_id: submissionId,
      recording_type: rec.type,
      recording_order: RECORDING_CONFIG[rec.type].stepNumber,
      file_path: f.storagePath,
      file_size_bytes: f.sizeBytes,
      duration_seconds: durationSeconds,
      mime_type: 'audio/wav',
      sample_rate_hz: 44100,
      passage_id: rec.passageCode ?? null,
      language_used: rec.languageUsed ?? null,
      validation_status: v.passed ? 'passed' : 'failed',
      validation_warnings: [] as string[],
      capture_metadata: {
        recording_duration_seconds: durationSeconds,
        overall_rms: v.measuredFor('overall_rms'),
        noise_floor_rms: v.measuredFor('noise_floor'),
        silence_ratio: v.measuredFor('max_silence'),
        clip_ratio: v.measuredFor('clipping'),
        validation_status: v.passed ? 'passed' : 'failed',
        validation_warnings: [] as string[],
        ...(rec.passageCode ? { passage_id: rec.passageCode } : {}),
        ...(rec.languageUsed ? { language_used: rec.languageUsed } : {}),
        app_version: appVersion,
        device_model: deviceLabel,
        os_version: `${Device.osName} ${Device.osVersion}`,
        mic_source: 'built_in',
      },
    };
  });
  const { error } = await supabase.from('voice_recordings').insert(rows);
  if (error) throw new VoiceUploadError(`Could not save recordings: ${error.message}`);
}

async function triggerAnalyzeVoice(supabase: SupabaseClient, submissionId: string): Promise<void> {
  try {
    await supabase.functions.invoke('analyze-voice', { body: { submission_id: submissionId } });
  } catch {
    // Non-fatal: rows are persisted; analysis can be retried server-side.
  }
}

// ---- helpers ---------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
