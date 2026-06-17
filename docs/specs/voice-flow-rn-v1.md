# Voice Analysis v1 — React Native / Expo implementation spec

**Status:** proposed (pre-implementation)
**Date:** 2026-06-17
**Owner:** member app (Expo SDK 56, RN 0.85, New Architecture)
**Source spec (framework-agnostic requirements):** [mobile_app_voice_v1_plan.md](mobile_app_voice_v1_plan.md)
**Reference implementation (Flutter, read-only, port for behavior not code):**
`C:\GitHub\ThriveRadio-v3\Radio-App\Radio-App-2.2.2\lib\voice\`

---

## 1. Goal & scope

Build the **full** voice-analysis v1 feature in the new RN app, faithful to
`mobile_app_voice_v1_plan.md` — including the parts the Flutter app never built.
Match this app's architecture, stack, workflow, and Apple-Music-like UI. Use the
Flutter code as a behavioral reference (validation math, upload sequencing,
thresholds) — re-implement in idiomatic TS/RN, do not transliterate Dart.

**In scope (everything in the source spec):**
1. Profile setup wizard — one-time clinical/demographic fields (§2.1–2.2)
2. Settings → Profile edit screen (§2.3)
3. Profile-completion banner / gating (§8)
4. Guided three-recording flow, Screens A–G (§3)
5. On-device WAV quality validation, 5 checks, strict pass/fail (§4)
6. Bundled reading passages EN-01/02, ES-01/02 + random select (§5)
7. WAV capture 44.1 kHz / 16-bit / mono (§6) + parallel upload + DB inserts +
   capture metadata + analyze-voice trigger (§6–7)
8. Re-record per step (§3.3)

**Explicitly out of scope (matches Flutter "v2" deferrals, unless asked):**
- Bundled "Hear example" audio clips (button shows a graceful placeholder).
- §4.2 marginal "yellow warning" pass-with-caveats path — v1 is strict pass/fail.
- Offline record-then-upload-later queue (spec §10 test item) — v1 requires
  connectivity at submit; flagged as a follow-up.
- Viewing scores in-app ("My Score") — the success screen says a provider will
  review; score rendering is a separate feature.

---

## 2. Backend — already deployed, do NOT rebuild

The RN app targets the **same Supabase project as Flutter v3**
(`yotaqkgfpifomudtwgzr`, confirmed) and authenticates with **Clerk** (the
`accessToken` callback in `src/api/supabase.tsx`). Every backend dependency the
Flutter app used already exists and is shared:

- Edge fn `voice-upload-urls` — `ThriveRadioPortal/supabase/functions/voice-upload-urls/index.ts`
- Edge fn `analyze-voice` — `ThriveRadioPortal/supabase/functions/analyze-voice/index.ts`
- Tables `voice_submissions`, `voice_recordings`, `reading_passages`, and the
  clinical profile columns on `public.users` (migration `0007_thrive_radio_portal.sql`)
- Storage bucket `voice-samples` (private) + RLS keyed on `current_user_id()`

**Client must match these contracts exactly:**

`voice-upload-urls` — POST, Clerk JWT:
```jsonc
// request
{ "submission_id": "<uuid>", "recording_types": ["sustained_vowel","reading_passage","diadochokinetic"] }
// response
{ "uploads": [ { "recording_type": "sustained_vowel", "path": "<uid>/<sub>/sustained_vowel.wav", "token": "...", "signed_url": "..." } ] }
```

`analyze-voice` — POST, Clerk JWT: `{ "submission_id": "<uuid>" }` (non-fatal if it errors; rows are persisted).

`voice_submissions` insert: `id, client_id (= current_user_id), practice_id, provider_id(null), status:'pending', recording_count:3, submitted_at`.

`voice_recordings` insert (×3): `submission_id, recording_type, recording_order(1..3), file_path, file_size_bytes, duration_seconds, mime_type:'audio/wav', sample_rate_hz:44100, passage_id, language_used, validation_status, validation_warnings, capture_metadata(jsonb)`.

**Storage upload MUST use the signed-URL flow** (`uploadToSignedUrl(path, token, blob)`),
not a direct client upload — Clerk's `sub` is text and breaks Storage's uuid
`owner_id`. DB row inserts, however, work directly under RLS (`client_id =
current_user_id()`).

`users` clinical columns + allowed values (CHECK-constrained server-side — the
client must send only these):
- `year_of_birth` int (1900..current)
- `biological_sex` ∈ `male|female|prefer_not_to_say`
- `smoking_status` ∈ `never|former|current`
- `respiratory_conditions` text[] ⊆ `none|asthma|copd|chronic_bronchitis|sleep_apnea|other`
- `vocal_conditions` text[] ⊆ `none|vocal_fold_disorder|chronic_laryngitis|voice_overuse_injury|other`
- `preferred_language` ∈ `en|es` (default `en`)

---

## 3. The one hard technical decision — WAV capture

**Constraint (interrogated, not assumed):** `expo-audio` records **Linear PCM/WAV
on iOS** but on **Android only offers AAC/AMR encoders (mpeg4/3gp/webm/aac_adts)** —
there is **no PCM/WAV on Android**. The analyze-voice/Modal pipeline *and* the
on-device validator both require **16-bit PCM WAV at 44.1 kHz mono**. So the engine
the app already uses (`src/audio/player.ts`, expo-audio) cannot satisfy Android.

**Precedent (interrogated):** the existing Flutter app (`ThriveRadio-v3`) does not
hand-roll native recording — it uses the maintained third-party plugin
**`record ^6.1.1`** (`RecordConfig(encoder: wav, sampleRate: 44100, numChannels: 1)`)
and `just_audio` for review playback. So a third-party recorder is the established,
accepted pattern.

**Governing principle (interrogated):** [AUDIO-PLAYBACK.md §1](../AUDIO-PLAYBACK.md)
prefers first-party / New-Arch-native modules and is wary of third-party *native*
modules — that wariness is **why RNTP was dropped** (it doesn't compile on RN 0.85 /
New Arch). Crucially, that is a *stack* hazard (TurboModule interop), not a ban: in
Flutter the analogous plugin was fine because Flutter has no New-Arch hazard. So the
caution resolves to **"prove it builds on this stack,"** not "forbid third-party."

**Decision: a third-party RN recorder, GATED BY A BUILD SPIKE; custom Expo native
module only as the fallback.** Concretely:
1. **Spike `@siteed/audio-studio`** first — purpose-built, outputs a `.wav` directly
   (least glue), config-plugin (we already prebuild). API: `useAudioRecorder()` →
   `startRecording({ sampleRate: 44100, channels: 1, encoding: 'pcm_16bit' })` →
   `stopRecording() → { fileUri }`. Risk: New-Arch/SDK56 support is *undocumented*,
   so the spike (§6 phase 0) is the gate: install → prebuild → record on the Android
   emulator → confirm a parseable 44.1k/16/mono PCM WAV.
2. **Fallback if it won't build on New Arch:** `react-native-audio-api` (Software
   Mansion — same vendor as `react-native-reanimated`, which this app already
   requires *under New Arch*, so it is build-proven on this stack). It yields raw
   PCM `Float32` buffers; we convert to 16-bit PCM and write the 44-byte WAV header
   ourselves (trivial, fully owned).
3. **Last resort:** a thin custom Expo native module (Android `AudioRecord`→PCM→WAV;
   iOS `AVAudioRecorder` LinearPCM) — matches AUDIO-PLAYBACK.md contingency #2.

The validator and uploader are written against a **plain WAV file URI**, so the
recorder is swappable behind one `src/audio/recorder.ts` — the choice among the
three does not change any other file. Keep `expo-audio` for review-screen *playback*.

**Audio-session coordination (must-have, was missing):** recording and the live
radio share one audio session. `player.ts` configures playback posture
(`interruptionMode: 'doNotMix'`). Before recording, `recorder.ts` must **stop the
live player** (`stopPlayback()`) and switch the session to allow input (iOS:
`setAudioModeAsync({ allowsRecording: true })` or the recorder lib's own session
handling); on teardown it must **restore playback posture** so live radio works
again. The Flutter notes flag the same ("callers must pause the live player before
recording"). The recorder module owns this so screens don't.

---

## 4. UX & entry points (Apple-Music-like, already scaffolded)

The Home screen (`src/app/(tabs)/index.tsx`) **already has the entry cards**, with
a comment "wired to Score/Voice flows in a later slice":
- **"VOICE CHECK-IN" card** → primary entry; tapping launches the flow.
- **"YOUR VITALITY SCORE" card** (`—`, "Take a voice check-in to see it") → also
  launches the flow when no score yet.
- **Top-right avatar** (`ArtTile seed="me"`) → opens an **Account** screen (new),
  home of Settings → Profile.

Wiring plan:
- **Flow as a modal route** mirroring the existing player modal
  (`<Stack.Screen name="voice" options={{ presentation: 'modal' }}/>`). A single
  host screen renders the current step from the store (like the Flutter cubit's
  host widget) — intro → recording×3 → review → uploading → success.
- **Profile gating (§3.1 pre-flight + §8):** on tapping a voice entry, if the
  profile is incomplete, route into the **Profile Setup** modal first; on
  completion, continue into the flow. A **dismissible banner** on Home ("Complete
  your profile to unlock voice analysis") appears when incomplete — not a hard
  block on the rest of the app.
- **Account screen** (new, opened from the avatar): shows name/email and a
  "Health profile" section → Profile edit (§2.3). Minimal; this app has no
  settings surface yet.

---

## 5. File plan (new unless noted)

**Pure logic (no RN deps — unit-testable):**
- `src/voice/recording-type.ts` — the 3 types, db values, labels, titles,
  instructions, target/min durations, step order. (port of `voice_recording_type.dart`)
- `src/voice/passages.ts` — EN/ES passages + `randomPassageForLanguage()`.
- `src/voice/validator.ts` — parse PCM16 WAV (RIFF chunk walk, iOS FLLR-safe) +
  5 checks with per-type silence thresholds + quietest-window noise floor.
  (port of `voice_validator.dart`; the tuned thresholds are the valuable part)

**Services:**
- `src/voice/recorder.ts` — thin wrapper over the chosen recorder: `start(prefix)`,
  `stop()→uri`, `cancel()`, permission, amplitude (optional). Encapsulates the
  44.1k/16/mono config so callers/validator/uploader stay recorder-agnostic.
- `src/voice/uploader.ts` — `submit(recordings, onProgress)`: fetch signed URLs →
  parallel upload-with-retry to signed URLs → insert submission → insert 3
  recordings (+capture_metadata) → trigger analyze-voice (non-fatal) → cleanup.
  Uses `useSupabase` client + a fetch to the edge fns with the Clerk JWT.

**Profile data layer:**
- `src/api/profile.ts` — `useVoiceProfile()` (react-query; reads the clinical
  columns off `users`), `useUpdateVoiceProfile()` mutation, and an
  `isProfileComplete()` helper. Mirrors `src/api/content.ts` patterns.

**State:**
- `src/stores/voice-store.ts` — Zustand (mirrors `player-store.ts`): step,
  currentIndex, captured map, selected passage, uploadedCount, uploadError,
  submissionId; actions begin/capture/reRecord/submit/reset.

**Screens / UI (expo-router):**
- `src/app/voice.tsx` — modal host; switches on `step`.
- `src/components/voice/intro-view.tsx` (A)
- `src/components/voice/recording-view.tsx` (B/C/D — keyed by index to reset)
- `src/components/voice/review-view.tsx` (E — playback via expo-audio + re-record)
- `src/components/voice/uploading-view.tsx` (F) and `success-view.tsx` (G)
- `src/app/profile-setup.tsx` — modal wizard (3 steps: basics, health, language)
- `src/app/account.tsx` + `src/app/profile.tsx` — account screen + profile edit (§2.3)
- `src/components/voice/profile-banner.tsx` — Home §8 banner

**Wiring (edit existing):**
- `src/app/_layout.tsx` — register `voice`, `profile-setup`, `account`, `profile`
  modal routes.
- `src/app/(tabs)/index.tsx` — wire the two cards + avatar; mount the banner.
- `assets/` — bundle passages (in code) ; example-audio assets deferred.

**Deps to add:** `@siteed/audio-studio` (recorder), `expo-file-system` (read bytes
for validation/upload, cleanup). `expo-device` already present (capture metadata).
Tests: the repo's test runner (TBD at phase 2) for the validator.

---

## 6. Build sequence (each phase ends at a verifiable point)

- **Phase 0 — Spike (de-risk):** add recorder dep, prebuild, record on Android
  emulator, dump WAV header. GO/NO-GO on `@siteed/audio-studio`. *Verify: a real
  44.1k/16/mono PCM WAV file on disk.*
- **Phase 1 — Pure logic:** recording-type, passages, validator (+ a couple of
  unit checks against captured WAVs). *Verify: validator passes a good clip,
  fails a silent/too-short clip.*
- **Phase 2 — Recorder + capture UI:** recorder.ts + recording-view + store +
  modal host (intro→record×3→review placeholder). *Verify on emulator: record 3,
  each validates, advances.*
- **Phase 3 — Review + upload:** review-view (playback, re-record) + uploader +
  uploading/success. *Verify on emulator: full submit → rows in
  voice_submissions/voice_recordings, files in voice-samples, analyze-voice fires.*
- **Phase 4 — Profile + gating:** profile.ts, profile-setup wizard, account +
  profile edit, Home banner, pre-flight gating. *Verify: incomplete profile is
  prompted then proceeds; edit persists.*
- **Phase 5 — Wire entry points + end-to-end pass** on the Android emulator with
  the test member (`myowja@gmail.com`).

Each phase: implement → review (fresh-context) → verify on emulator before moving on.

---

## 7. Open decisions / assumptions

1. **Recorder library** — RESOLVED (see §3): spike `@siteed/audio-studio`; if it
   won't build on RN 0.85 / New Arch, fall back to `react-native-audio-api` (SWM,
   build-proven here via Reanimated) + own WAV encoder; custom Expo module last.
2. **Account screen** — adding a minimal one (none exists) as the home for
   Settings→Profile, reached from the Home avatar. Alternative: a Settings tab.
3. **practice_id resolution** — port Flutter's "first active membership" via
   `practice_memberships` (confirm the table/column names exist for this app's
   member; the Flutter query used `practice_memberships.practice_id` where
   `status='active'`).
4. **Localization** — passages + `preferred_language` support en/es now; full UI
   string localization (Spanish labels) tracked but minimal in v1.
