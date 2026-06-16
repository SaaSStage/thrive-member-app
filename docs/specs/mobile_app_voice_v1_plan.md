# THRIVE RADIO MOBILE APP — V1 VOICE ANALYSIS EXPANSION PLAN

This document covers all changes required to the Thrive Radio Flutter mobile app to support the expanded voice analysis system. Everything outside the mobile app (database, edge functions, Modal, rules engine, web portal) is covered in the companion document.

---

## 1. SCOPE SUMMARY

The mobile app gains three major capabilities:
1. Collect demographic and health context on user profile (one-time setup)
2. Capture a three-recording voice sample in a single guided session
3. Validate recording quality on-device before submission

User experience goal: feel like one simple submission, even though three files are captured and validated under the hood.

---

## 2. PROFILE SETUP ADDITIONS

The user's profile needs additional fields, collected **one time only**. After the user provides them the first time, they persist indefinitely and are never asked again unless the user explicitly edits them via Settings. The voice submission flow checks the database silently before recording; if the data is already there, the user goes straight to recording without seeing any profile screens.

### 2.1 Required new profile fields

| Field | Type | UI control | Required |
|-------|------|------------|----------|
| `year_of_birth` | integer | year picker (4-digit) | Yes |
| `biological_sex` | enum: `male`, `female`, `prefer_not_to_say` | single-select | Yes |
| `smoking_status` | enum: `never`, `former`, `current` | single-select | Yes |
| `respiratory_conditions` | array of enum: `none`, `asthma`, `copd`, `chronic_bronchitis`, `sleep_apnea`, `other` | multi-select | Yes (none is valid) |
| `vocal_conditions` | array of enum: `none`, `vocal_fold_disorder`, `chronic_laryngitis`, `voice_overuse_injury`, `other` | multi-select | Yes (none is valid) |
| `preferred_language` | enum: `en`, `es` (v1) | single-select | Yes |

### 2.2 New screen: Profile Setup (first-time only)

This screen flow is triggered **only** when the user attempts to submit their first voice sample and the profile is missing one or more required fields. If the profile is already complete, this flow is bypassed entirely and the user goes straight to recording.

Shows a friendly intro explaining why this information improves their analysis accuracy, then collects fields in 2-3 steps:

- **Step 1: Basics** — Year of birth and biological sex
- **Step 2: Health context** — smoking status, respiratory conditions, vocal conditions
- **Step 3: Language preference** — English or Español for reading materials

User can edit these later in Settings → Profile. Changes to year of birth, sex, smoking status, or conditions invalidate the existing baseline and trigger baseline recomputation (handled backend-side; UI just notifies).

### 2.3 New screen: Settings → Profile

Lets users view and edit all of the above fields. Same controls as Setup.

---

## 3. VOICE SAMPLE SUBMISSION FLOW REDESIGN

The "Submit Voice Sample" menu item now triggers a three-step recording flow instead of a single recording. Total user time is approximately 90-120 seconds including transitions.

### 3.1 Pre-flight checks

Before the user can start, the app verifies:
- Profile is complete (required fields above all populated)
- Microphone permission granted
- Sufficient device storage for three audio files
- Network connectivity (for upload)

If any check fails, show a clear message and don't start the flow.

### 3.2 The guided three-recording flow

**Screen A: Introduction**
- Title: "Voice Sample Submission"
- Body: "We'll record three short audio samples. Total time is about 90 seconds. Find a quiet space and have a glass of water nearby."
- "Continue" button (primary)
- "Cancel" link (secondary)

**Screen B: Recording 1 of 3 — Sustained "ah"**
- Header: "Recording 1 of 3"
- Title: "Say 'ah' for 30 seconds"
- Subtext: "Take a comfortable breath, then sustain the sound naturally. It's OK to pause and breathe if needed."
- Audio example button: "Hear example" plays bundled 2-second WAV
- Visual recording indicator (pulsing dot or waveform)
- 30-second countdown timer
- "Start Recording" button → during recording becomes "Stop"
- Auto-advance to Screen C on completion or stop
- Recording quality validation runs immediately on stop (see Section 4)

**Screen C: Recording 2 of 3 — Reading passage**
- Header: "Recording 2 of 3"
- Title: "Read the passage below at a natural pace"
- The passage is displayed in large readable text (minimum 20pt, high contrast). Language matches the user's `preferred_language`:
  - English speakers see one of the validated English passages (see Section 5)
  - Spanish speakers see one of the validated Spanish passages
- Subtext: "Read at your natural conversational pace. Don't rush."
- 35-second countdown (passage takes about 25-30 seconds to read, gives buffer)
- "Start Recording" button → "Stop"
- Auto-advance to Screen D on completion or stop
- Recording quality validation runs immediately on stop

**Screen D: Recording 3 of 3 — Diadochokinetic task**
- Header: "Recording 3 of 3"
- Title: "Say 'pa-ta-ka' as fast as you can for 10 seconds"
- Subtext: "Repeat the syllables 'pa-ta-ka, pa-ta-ka' as quickly and clearly as you can."
- Audio example button: "Hear example" plays bundled example
- 10-second countdown
- "Start Recording" button → "Stop"
- Recording quality validation runs immediately on stop
- Advance to Screen E

**Screen E: Review**
- Title: "Review Your Submission"
- Three rows, one per recording. Each row shows:
  - Recording label ("Sustained 'ah'", "Reading passage", "pa-ta-ka")
  - Duration
  - Quality status (green check if good, yellow warning if marginal)
  - Play button to preview
  - "Re-record this one" button
- Primary action: "Submit All Three"
- Secondary action: "Cancel and start over"

**Screen F: Uploading**
- Progress indicator showing percentage complete across all three files
- Text: "Uploading 1 of 3...", "Uploading 2 of 3...", "Uploading 3 of 3..."
- Disable cancel during upload

**Screen G: Success**
- Checkmark icon
- "Sample submitted. Your provider will review it shortly."
- "Done" button closes the flow

### 3.3 Re-record handling

From Screen E, if the user taps "Re-record this one" on any row:
- App returns to the appropriate recording screen (B, C, or D)
- Previous recording for that step is discarded
- Other completed recordings are preserved
- User completes that recording and is returned to Screen E

---

## 4. RECORDING QUALITY VALIDATION (ON-DEVICE)

Each recording is validated immediately after capture, before allowing the user to advance. If validation fails, show a clear error and prompt for re-record without leaving the screen.

### 4.1 Validation checks

For each recording:

| Check | Threshold | Failure Message |
|-------|-----------|-----------------|
| Minimum duration | At least 80% of target duration | "Recording too short. Please try again." |
| Maximum silence | No more than 30% silence below threshold | "We didn't pick up enough sound. Please try again." |
| Clipping detection | < 1% of samples at peak amplitude | "Recording was too loud. Move further from the mic and try again." |
| Background noise level | First 0.5s noise floor below threshold | "Background noise is too high. Try a quieter space." |
| Overall RMS energy | Above minimum | "Microphone didn't pick up your voice clearly. Try again." |

Implementation note: these are simple checks computable in Dart on the raw audio buffer. No external library required beyond the audio recording library you already use.

### 4.2 Validation pass with caveats

If a recording passes minimum thresholds but is marginal (e.g., higher than ideal background noise), allow submission but mark with a yellow warning indicator on Screen E. The submission still goes through, but the quality flag is included in the metadata so the provider knows.

---

## 5. READING PASSAGES (BUNDLED WITH APP)

The reading passages are bundled in the app as static assets, not fetched at runtime. This ensures they always work even offline. The passages are also stored server-side in the `reading_passages` table (covered in backend doc) so we can track which passage version was used for each recording.

### 5.1 English passages

For v1, bundle these two phonetically balanced passages and randomly select one per recording session (so the user doesn't memorize a single passage over time, which would change reading delivery):

**Passage EN-01: "Rainbow Passage" excerpt** (validated standard, 30 seconds at natural pace)
```
When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon. There is, according to legend, a boiling pot of gold at one end.
```

**Passage EN-02: "Grandfather Passage" excerpt** (validated standard, 30 seconds at natural pace)
```
You wished to know all about my grandfather. Well, he is nearly ninety-three years old, yet he still thinks as swiftly as ever. He dresses himself in an old black frock coat, usually several buttons missing. A long beard clings to his chin, giving those who observe him a pronounced feeling of the utmost respect.
```

### 5.2 Spanish passages

For v1, bundle these two phonetically balanced Spanish passages:

**Passage ES-01: "El Abuelo" (Spanish Grandfather equivalent)** (30 seconds at natural pace)
```
Quisieras saber todo acerca de mi abuelo. Pues, tiene casi noventa y tres años y, aún así, piensa con la misma rapidez de siempre. Se viste con un viejo abrigo negro, generalmente al que le faltan varios botones. Una larga barba cuelga de su mentón, dando a quienes le observan un profundo sentimiento del más alto respeto.
```

**Passage ES-02: "El Arcoíris" (Spanish Rainbow equivalent)** (30 seconds at natural pace)
```
Cuando la luz del sol incide sobre las gotas de lluvia en el aire, estas actúan como un prisma y forman un arcoíris. El arcoíris es una división de la luz blanca en muchos hermosos colores. Estos toman la forma de un largo arco redondo, con su trayectoria alta sobre nosotros, y sus dos extremos aparentemente más allá del horizonte.
```

The app embeds each passage with a passage ID (e.g., `EN-01`) that gets sent up to the backend with the submission so the analysis knows exactly which text was read.

---

## 6. AUDIO CAPTURE TECHNICAL SPECS

All three recordings use the same capture settings:
- Sample rate: 44.1 kHz
- Bit depth: 16-bit PCM
- Channels: mono
- Container: WAV
- No normalization, compression, or filtering at capture time

### 6.1 File naming convention

Each recording is uploaded to Supabase Storage with a deterministic path:
```
voice-samples/{client_user_id}/{submission_uuid}/{recording_type}.wav
```

Where `recording_type` is one of: `sustained_vowel`, `reading_passage`, `diadochokinetic`.

This grouping makes it easy to navigate three recordings that belong to one submission session.

### 6.2 Upload sequencing

Upload all three files in parallel after Submit. If any one upload fails, show retry option for that specific file without re-uploading the others.

After all three files succeed, the app calls the database to:
1. Insert the parent `voice_submissions` row
2. Insert three child `voice_recordings` rows pointing at each file

Then show success.

---

## 7. CAPTURED METADATA PER RECORDING

In addition to the audio file, the mobile app captures and uploads the following metadata for each recording. This is stored in `voice_recordings.capture_metadata` as JSONB:

```json
{
  "recording_started_at": "2026-05-14T22:35:17.071Z",
  "recording_duration_seconds": 30.2,
  "background_noise_db_estimate": -52,
  "rms_peak": 0.42,
  "clipping_sample_count": 0,
  "validation_status": "passed",
  "validation_warnings": [],
  "passage_id": "EN-01",
  "language_used": "en",
  "device_model": "iPhone 14 Pro",
  "os_version": "iOS 18.5",
  "app_version": "2.3.1",
  "mic_source": "built_in"
}
```

Some fields apply only to the reading passage recording (passage_id, language_used). Others apply to all three.

---

## 8. PROFILE PRE-CHECK ON LAUNCH

When the user opens the app, the app checks whether their profile has the required voice analysis fields populated. If not, a banner appears at the top of the main screen:

> "Complete your profile to unlock voice analysis. (Tap to set up)"

Tapping the banner takes them through the Profile Setup flow (Section 2.2). This is not a hard block on using other parts of the app, only on submitting voice samples.

---

## 9. WHAT'S OUT OF SCOPE FOR THIS DOCUMENT

The following are covered in the companion backend document:
- Database schema for `voice_submissions`, `voice_recordings`, `voice_baselines`, `reading_passages`, profile field additions
- Storage bucket configuration and policies
- Modal function changes to handle three recording types
- Edge function changes (analyze-voice handles three recordings, generate-report uses correct features per recording type)
- Rules engine updates (rules tagged by recording_type and language)
- Expanded rule library (sustained vowel + reading passage + diadochokinetic rules)
- Baseline computation logic
- Provider web portal updates

---

## 10. IMPLEMENTATION CHECKLIST

For Claude Code or a Flutter developer to execute against:

- [ ] Add new profile fields to the Flutter user model
- [ ] Build Profile Setup flow (Section 2.2)
- [ ] Build Settings → Profile screen (Section 2.3)
- [ ] Build voice submission flow (Section 3): Screens A through G
- [ ] Bundle audio example files for "ah" and "pa-ta-ka"
- [ ] Bundle four reading passages (EN-01, EN-02, ES-01, ES-02) as app assets
- [ ] Implement recording quality validation (Section 4)
- [ ] Implement parallel upload sequencing (Section 6.2)
- [ ] Capture and upload per-recording metadata (Section 7)
- [ ] Add profile completion banner to main app (Section 8)
- [ ] Test on iOS and Android with various device microphones
- [ ] Test in Spanish locale to verify passage rendering and UI labels
- [ ] Test offline behavior (record without network, upload when reconnected)
- [ ] Add re-record-per-step capability (Section 3.3)
