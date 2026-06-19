# Spec: Harden the capture-time audio quality gate (voice flow)

- **Status:** draft
- **Date:** 2026-06-19
- **Related:** `docs/specs/voice-flow-rn-v1.md`; prior art `reference/flutter-v3/voice/services/voice_validator.dart`; LOE risk #6 (Samsung/Xiaomi audio HAL variance, called out in `validator.ts:11` and `recording-type.ts:34`). Candidate ADR proposed below (gating-vs-payload check separation).

## Problem / goal

The on-device quality gate already exists and works: `validateWav(ArrayBuffer, type)` runs in `recording-view.tsx` `onStop()` before upload and blocks upload on failure (`recording-view.tsx:101-110`). But its checks are the wrong proxies for "is this a usable recording." It gates on a flat silence ratio and an absolute noise-floor RMS rather than on level, true signal-to-noise, and actual detected speech; it silently downmixes stereo instead of treating a non-mono/wrong-rate header as the recorder regression it would be; and a failing take is destroyed (`recording-view.tsx:103-107`) with no escape hatch, so a user whose environment keeps tripping a threshold can get stuck and never submit.

This spec reworks **which metrics the validator computes and gates on**, and adds a **force-through path** after repeated failures. We are **not** changing the native recorder (`modules/voice-recorder` already emits 44.1 kHz / 16-bit / mono PCM WAV) or the gate-before-upload architecture.

**Critical distinction (must hold throughout):** this gate measures **recording quality** — level, clipping, background noise, and whether enough clear speech was captured. It is **not** a voice-health screen. It must **never** key on jitter, shimmer, hoarseness, or any pathology signal. A genuinely rough or disordered voice is a valid user we must serve; that analysis is the server's job (`analyze-voice`), not the gate's.

## The payload-compat invariant (HEADLINE — highest regression risk)

`uploader.ts` builds `capture_metadata` by reading measured values **by check id**:

```
overall_rms:    v.measuredFor('overall_rms')   // uploader.ts:198
noise_floor_rms:v.measuredFor('noise_floor')   // uploader.ts:199
silence_ratio:  v.measuredFor('max_silence')   // uploader.ts:200
clip_ratio:     v.measuredFor('clipping')      // uploader.ts:201
```

`measuredFor(id)` returns `checks.find(c => c.id === id)?.measured ?? 0` (`validator.ts:91`). Therefore the reworked validator **MUST keep computing and emitting `VoiceCheck` entries with these four ids** — `overall_rms`, `noise_floor`, `max_silence`, `clipping` — carrying their real measured numbers, **even where those checks no longer drive the pass/fail decision.** If any of these ids disappears from the `checks[]` array, `measuredFor` silently returns `0` and the upload payload regresses to garbage with no error.

The new metrics (peak dBFS, true SNR, voiced seconds) are **additional gating checks only**. They are **NOT** plumbed into the payload (see Out of scope: item 6). The payload object in `uploader.ts` stays byte-for-byte unchanged.

A regression test (below) **must** assert all four `measuredFor` values are non-zero on a normal take.

## Approach

The validator stays a **pure, synchronous** function over an `ArrayBuffer` (no IO, fully unit-testable) — its single most valuable property, since it lets us synthesize PCM fixtures in tests. We keep the existing single-pass loop for the cheap per-sample stats and add a second, bounded pass for framing/VAD on a decimated copy. The Flutter prior art (`voice_validator.dart`) is the source for tuned threshold *values* where they carry over; the new metrics are net-new.

The core structural change: split the result into **gating checks** (drive `passed`) and **payload-only checks** (computed, emitted for `measuredFor`, but excluded from `passed`). See Key design decisions for the recommended mechanism.

### Item 1 — Peak / level

Add peak-dBFS tracking to the existing per-sample loop (track `maxAmp = max(|sample|/32768)`). Add two gating checks in the linear amplitude domain the loop already uses:

- **too-quiet:** FAIL if `peak < 0.0316` (≈ -30 dBFS).
- **too-hot:** FAIL if `peak > 0.891` (≈ -1 dBFS).

**KEEP** the existing `overall_rms` check as a gating check: FAIL if `overallRms < 0.01` (≈ -40 dBFS) — `validator.ts:244-248`. (`overall_rms` is also a payload id, so it stays regardless.)

### Item 2 — True SNR (replaces absolute noise-floor gate)

Frame the signal into ~30 ms frames; compute per-frame RMS. `noise = mean(quietest 10% of frames)`, `speech = mean(loudest 10% of frames)`, `snr_db = 20*log10(speech / noise)` (guard `noise === 0`). New gating check: **FAIL if SNR < 18 dB.**

**KEEP** the old `noise_floor` value still **COMPUTED** (the quietest-500ms-window RMS, `validator.ts:181-215`) and emitted as the `noise_floor` check — but make it **payload-only** (it no longer gates). This preserves `measuredFor('noise_floor')`.

> Flag: 18 dB is **unvalidated on real hardware** — see Risks. Centralize it in `DEFAULT_THRESHOLDS`.

### Item 3 — Voiced VAD (largest / riskiest)

Add an energy+pitch VAD that measures **voiced seconds**:

- Decimate the 44.1 kHz samples to ~8 kHz using an **averaging low-pass** (box-average over each decimation block) to avoid aliasing — do not naively pick every Nth sample.
- Per frame, classify "voiced" by energy AND a pitch detector: **autocorrelation** on the decimated copy, pitch search range **70-400 Hz**. A frame is voiced if energy is above a floor and a clear periodic peak exists in that lag range.
- Compute both **longest contiguous voiced run** and **total voiced seconds**.

Per-task gates (add to `RECORDING_CONFIG` as `minVoicedMs` + `requiresContinuousVoiced`):

| Type | Gate |
|---|---|
| `sustained_vowel` | longest **continuous** voiced run >= 4 s (`requiresContinuousVoiced: true`) |
| `reading_passage` | **total** voiced >= 20 s |
| `diadochokinetic` | **total** voiced >= 6 s |

This VAD gate **replaces `min_duration` and `max_silence` as gates.** **KEEP** `max_silence` (the silence ratio, `validator.ts:212`) still **COMPUTED** and emitted as a payload-only check (preserves `measuredFor('max_silence')`). `min_duration` is no longer consumed by the payload (`uploader.ts` does not read it) and is only referenced by one existing test — keep a minimal duration sanity gate (near-free, catches truncated files before the costlier VAD runs).

> Flag: all three voiced-second floors are **unvalidated on hardware** and must be tuned on-device. Add a `// THRESHOLD: tune on-device (LOE risk #6)` comment.

### Item 4 — Format sanity

In `parsePcm16` / `validateWav`, **reject** rather than silently coerce (currently `validator.ts:154-161` downmixes stereo by taking the left channel):

- REJECT `sampleRate not in {44100, 48000}`.
- REJECT `numChannels !== 1` (no downmix).

Emit a distinct **`'format'`** check failure (new `VoiceCheckId`) and `console.warn` the offending header fields (rate, channels, bits) as a regression tripwire — our recorder always emits mono 44.1k, so this firing means the recorder changed. Keep `parsePcm16` a pure header/sample parser (still returns the parsed header even for stereo/48k) and apply the format gate in `validateWav` (so tests can assert on parsed headers and the gate stays in the gating pipeline).

### Item 5 — Retry counter + force-through (newly added)

Track a **per-recording-type failure counter** in `voice-store.ts`. Behavior in `recording-view.tsx` `onStop()`:

- On each fail: increment the type's counter, show `firstFailureMessage` + the existing **Stop/Start** + **Cancel** controls (today the only recovery is to press Start again — there is no dedicated "Re-record" button on this screen; the *review* screen has the re-record affordance). Keep current behavior **for counter < 3**: discard the failed file and surface the message via `fail()`.
- **After 3 failures for that type:** stop discarding. Instead, **capture** the recording **with its failing validation** (`validateWav` already returns the full result with `passed: false`), and present a force-through affordance — add a second footer button labeled **"Use this recording anyway"** that calls `captureRecording({ ..., validation })` and advances the flow. The destructive `new File(rec.uri).delete()` (`recording-view.tsx:103-107`) must be skipped on the forced path so the file survives to upload.
- The forced recording uploads via the **existing** `validation_status: 'failed'` field (`uploader.ts:194,202`). **DO NOT add a `gate_overridden` field** — `'failed'` already flags a low-confidence take, because failed takes were *previously never uploaded at all*, so `'failed'` in the DB unambiguously means "user forced a sub-threshold recording through."
- **Reset** the per-type counter on that type's success (a passing capture) and on flow reset (`openFlow`). Wire resets into `captureRecording` (success path) and `openFlow`.

Review screen impact: `review-view.tsx:29` gates "Submit all three" on `recordings.every(r => r.validation.passed)`. A forced-through recording has `validation.passed === false`, so **submit would stay disabled** — the force-through would be pointless. This must change: allow submit when all three slots are *captured* (regardless of `passed`). **This is a required, easily-missed coupling.** The row already renders a `!` indicator for failed takes (`review-view.tsx:70-71`), which doubles as the "forced" badge.

### Item 7 — Messages

Replace the `FAIL` map strings (`validator.ts:77-83`) with this exact copy, mapped to the gating checks:

- **too-loud / clipping** -> "Your audio was too loud and distorted — move back from the mic or speak a little softer, then try again." (used by both the `clipping` gate and the peak too-hot gate)
- **too-quiet** (peak too low) -> "We could barely hear you — move closer to the mic and record in a quieter spot." (also the natural message for `overall_rms` below floor)
- **noise / SNR** -> "Too much background noise — please record in a quiet room."
- **not-enough-speech** (voiced VAD) -> "We didn't detect enough clear speech — please complete the full task."

The `'readable'` and new `'format'` messages keep their own copy (a distinct quiet message for `format`, since it's a recorder regression, not user-actionable).

### Check ORDER (matters — UI shows the first failure)

`recording-view.tsx:108` and `validator.ts:90` show `firstFailureMessage` = the first non-passing check in array order. Order the **gating** checks so the most actionable, most fundamental message wins:

**format -> too-quiet (peak/level) -> too-hot/clipping -> SNR -> voiced.**

Payload-only checks (`noise_floor`, `max_silence`) must always carry `passed: true` so `find(c => !c.passed)` skips them entirely and they never become `firstFailureMessage`.

## Files affected

- `src/voice/validator.ts` — **most change.** New peak tracking; replace noise-floor gate with framed SNR; add decimated energy+pitch VAD; reject non-mono / non-{44100,48000}; new `'format'` + voiced gating check ids; new copy in `FAIL`; split gating vs payload-only checks; preserve the four payload check ids with real `measured` values. Extend `DEFAULT_THRESHOLDS` (peak min/max, SNR floor, frame ms, decimation target, pitch range).
- `src/voice/recording-type.ts` — add `minVoicedMs` and `requiresContinuousVoiced` to `RecordingTypeConfig` and to all three `RECORDING_CONFIG` entries.
- `src/components/voice/recording-view.tsx` — `onStop()`: on fail, increment the type's counter (via store); below 3, discard + `fail()` as today; at/after 3, **do not delete**, capture with failing validation, render a "Use this recording anyway" button. Read counter from store.
- `src/stores/voice-store.ts` — add `failureCounts: Partial<Record<VoiceRecordingType, number>>`, an action to increment, reset-on-success inside `captureRecording`, reset-all inside `openFlow`. `CapturedRecording` already carries `validation`, so no shape change there.
- `src/components/voice/review-view.tsx` — relax the submit-enabled logic so forced (`passed: false`) recordings can still be submitted once all three slots are captured.
- `src/voice/__tests__/validator.test.ts` — extend with new fixtures + the payload-compat non-zero assertion (see Test plan).
- `src/voice/uploader.ts` — **NO CODE CHANGE** (the payload is intentionally untouched). Listed only to assert the invariant: do not edit it.

## Reuse

- Existing single-pass per-sample loop in `validateWav` (`validator.ts:190-205`) — extend it for peak; don't add a separate pass for peak.
- `DEFAULT_THRESHOLDS` object (`validator.ts:44-57`) — add every new threshold here; centralization is an explicit design goal (`validator.ts:11-13`).
- `VoiceCheck` / `VoiceValidationResult` / `buildResult` / `measuredFor` (`validator.ts:25-93`) — extend, don't replace.
- `configFor` (`recording-type.ts:82`) — already the per-type config accessor; the VAD reads its new fields through it.
- `makeWav` / `tone` / `goodVoice` test helpers (`validator.test.ts:8-52`) — reuse and extend for new fixtures.
- The existing `'readable'`/`unreadableResult` failure pattern (`validator.ts:95-104`) — model the new `'format'` failure on it.
- The store's `openFlow` reset pattern (`voice-store.ts:78-87`) — hook counter reset there.

## Steps

1. **Threshold + config scaffolding.** Add new keys to `DEFAULT_THRESHOLDS` (peak min/max linear, SNR floor dB, frame ms, decimation target Hz, pitch min/max Hz). Add `minVoicedMs` + `requiresContinuousVoiced` to `RecordingTypeConfig` and all three configs. Pure data; type-checks only.
2. **Format sanity (item 4).** Add the `'format'` check id; reject non-mono and rate not in {44100,48000}; `console.warn` the header. Remove the silent downmix. Unit-test with 48k/stereo/wrong-rate fixtures.
3. **Peak + level (item 1).** Track peak in the existing loop; add too-quiet / too-hot gating checks; keep `overall_rms` gate. Unit-test too-quiet and too-hot fixtures.
4. **SNR (item 2).** Framed per-frame RMS, quietest/loudest-10% SNR, 18 dB gate. Convert `noise_floor` to payload-only (still computed, `passed: true`). Unit-test tone+noise low-SNR fixture; assert `measuredFor('noise_floor')` still real.
5. **Voiced VAD (item 3) — the risky one, do it isolated.** Averaging decimation -> autocorrelation pitch -> voiced frames -> longest-run + total. Per-type gate. Convert `max_silence` to payload-only. Unit-test voiced (periodic) vs unvoiced (noise) and insufficient-voiced fixtures.
6. **Messages + order (item 7).** New `FAIL` copy; finalize gating-check order (format -> level -> clipping -> SNR -> voiced); confirm payload-only checks can't surface as `firstFailureMessage`.
7. **Payload-compat regression test.** On a normal good take, assert `measuredFor('overall_rms'|'noise_floor'|'max_silence'|'clipping')` are all non-zero and the payload-shaping in `uploader.ts` is unchanged.
8. **Retry counter + store (item 5, part 1).** `failureCounts` in `voice-store.ts`, increment action, reset on success + `openFlow`. Unit-test the store reducer if feasible.
9. **Force-through UI (item 5, part 2).** `recording-view.tsx`: at >=3 fails, skip delete, capture with failing validation, render "Use this recording anyway." Relax `review-view.tsx` submit gating to accept forced takes.
10. **On-device Android verification + threshold tuning pass.** Required before "done" (see Acceptance + Risks).

## Acceptance criteria

- [ ] `validateWav` remains a pure sync function over `ArrayBuffer` with no IO.
- [ ] **Payload invariant:** on a normal good take, `measuredFor('overall_rms')`, `('noise_floor')`, `('max_silence')`, `('clipping')` are all non-zero, and `uploader.ts`'s `capture_metadata` is unchanged (no new keys). Asserted by test.
- [ ] Payload-only checks (`noise_floor`, `max_silence`) never cause `passed: false` and never surface as `firstFailureMessage`.
- [ ] Gating checks and their FAIL copy: too-quiet (peak < -30 dBFS), too-hot (peak > -1 dBFS / clipping), SNR < 18 dB, insufficient voiced per type — each fails the right fixture with the exact item-7 string.
- [ ] `overall_rms < -40 dBFS` still gates.
- [ ] Format: 48 kHz passes; stereo and rates not in {44100,48000} fail with `'format'` and a `console.warn`.
- [ ] Voiced VAD: passes a clean voiced tone of sufficient length; fails an equally-long unvoiced (noise) clip; `sustained_vowel` requires a 4 s **contiguous** run (a clip with 4 s of voiced split into 2 s + 2 s fails).
- [ ] First-failure order is format -> level -> clipping -> SNR -> voiced, verified against `recording-view.tsx`'s `firstFailureMessage` usage.
- [ ] After 3 fails for a type, the failed file is **not** deleted, a "Use this recording anyway" affordance appears, and using it captures the recording with `validation.passed === false` and advances the flow.
- [ ] A forced (`passed: false`) recording can be submitted from the review screen once all three are captured; it uploads with `validation_status: 'failed'`; no `gate_overridden` field is added anywhere.
- [ ] Counter resets per type on a passing capture and globally on `openFlow`.
- [ ] **On-device Android run** confirms a real "ahh", a real passage read, and a real pa-ta-ka all pass; thresholds tuned against captured `measured` values.

## Test plan

Extend `validator.test.ts` with synthesized PCM fixtures (reuse/extend `makeWav`, `tone`, `goodVoice`):

- **Voiced vs unvoiced (critical for a meaningful VAD test):** "voiced" = a **periodic** waveform with fundamental in 70-400 Hz (e.g. a 150 Hz sine, or a richer sum of harmonics of 150 Hz) — autocorrelation finds a clear peak. "Unvoiced" = white/pseudo-random **noise** at comparable energy — no periodic peak. The VAD must classify the first as voiced and the second as not, at matched RMS, or the test proves nothing.
- **Pass:** clean voiced tone of sufficient length per type (and the existing `goodVoice` onset-then-voice case).
- **Clipped / too-hot:** most samples at full scale -> clipping/too-hot gate.
- **Too-quiet:** voiced but `peak` below -30 dBFS (scale amplitude way down) -> too-quiet gate, and `overall_rms` floor.
- **Low-SNR:** voiced tone summed with strong broadband noise so framed SNR < 18 dB.
- **Insufficient voiced:** long enough in seconds but mostly noise/silence (total voiced under the per-type floor); plus the split-run case for `sustained_vowel` continuity.
- **Format:** 48 kHz header (passes format), wrong rate (e.g. 22050 -> fails), stereo `numChannels=2` (fails, no downmix). Extend `makeWav` to take channel count / rate.
- **Payload-compat:** good take -> all four `measuredFor` ids non-zero.
- **Store:** `failureCounts` increments, resets on success, resets on `openFlow` (if tested at store level).

Note on cost: the decimated VAD adds ~tens of ms — acceptable for a sync function on stop. If it stutters on slow devices, the fallback is to offload `validateWav` behind `InteractionManager.runAfterInteractions` / an async wrapper in `onStop` (the function itself stays sync/pure).

## Key design decisions

1. **Gating vs payload-only checks — how they coexist (candidate ADR).**
   - **Option A (recommended): a `gating: boolean` flag on `VoiceCheck`.** Payload-only checks (`noise_floor`, `max_silence`) are emitted with `gating: false` and forced `passed: true`. `buildResult` computes `passed = checks.every(c => !c.gating || c.passed)` and `firstFailureMessage` from gating fails only. One array, `measuredFor` keeps working unchanged, minimal churn. Downside: a slightly subtler `passed` rule.
   - **Option B:** compute payload metrics entirely separately and attach them via a side map, keeping `checks[]` purely gating. Cleaner conceptually but changes the `measuredFor` source and risks the invariant.
   - **Recommendation: Option A.** Smallest change to the proven `buildResult`/`measuredFor` machinery; the four payload ids stay literally present in `checks[]`. Worth an ADR because it's the structural choice the whole rework hangs on.

2. **Force-through signalling — reuse `validation_status: 'failed'` (recommended, per brief).** No `gate_overridden` field. `'failed'` is unambiguous because failed takes were never uploaded before. Confirmed against `uploader.ts:194,202`.

3. **Review-screen submit gating.** Recommended: enable submit when all three slots are *captured* (length === 3), since a slot only exists if it passed OR was forced. Simpler than tracking a separate "forced" flag.

4. **`parsePcm16` vs `validateWav` boundary for format.** Recommended: keep `parsePcm16` a pure header/sample parser (still returns parsed header even for stereo/48k) and apply the **format gate in `validateWav`**, so tests can assert on parsed headers and the gate stays in the gating pipeline.

## Risks (ranked)

1. **VAD correctness + tuning (highest).** Autocorrelation pitch detection + decimation is the most failure-prone new code, and the 4 s/20 s/6 s voiced floors plus the energy/pitch thresholds are all **unvalidated on real hardware.** A too-strict VAD rejects valid recordings (especially breathy or quiet sustained vowels); too-loose defeats the gate. The force-through path (item 5) is the safety valve, but tuning on Android is mandatory before ship. Existing comments already warn of Samsung/Xiaomi audio HAL variance (LOE risk #6).
2. **Payload regression (high).** Dropping or renaming any of the four payload check ids silently zeroes `capture_metadata` with no error. Mitigated by the headlined invariant + the non-zero regression test.
3. **18 dB SNR floor unvalidated (high).** A real quiet room with a quiet speaker can read below 18 dB; risks false rejections. Tune on-device; force-through mitigates.
4. **Review-submit coupling missed (medium).** If `review-view.tsx:29` isn't relaxed, force-through produces a recording the user still can't submit — silently defeating item 5.
5. **Sync cost on slow devices (low-medium).** Decimated VAD adds tens of ms; fallback is `InteractionManager` offload.
6. **iOS unverified (medium, environmental).** Only Android is a verified path here; iOS needs a Mac. The CoreAudio FLLR-chunk handling and 48 kHz acceptance are untested on device.

## Out of scope

- **Item 6 — payload expansion.** Do NOT add `channels`, `bit_depth`, `peak_dbfs`, `estimated_snr_db`, `voiced_seconds`, or `gate_overridden` to `capture_metadata`. The payload stays exactly as in `uploader.ts:196-210`.
- Any voice-health / pathology signal (jitter, shimmer, hoarseness) — never gate on these.
- Changes to the native recorder (`modules/voice-recorder`) or the gate-before-upload architecture.
- Marginal "yellow warning" handling (still v2, per the existing comment at `validator.ts:3`).
- iOS device verification (no Mac available).

## Open questions

1. **`'format'` message copy** — a distinct quiet message (recommended), or reuse the `'readable'` "couldn't read that recording" phrasing? Item 7 doesn't specify.
2. **Force-through on the *review* screen too?** Item 5 specifies the 3-fail counter on the recording screen. The counter persists per type, so a re-record that keeps failing still reaches the threshold — recommendation: capture screen only for v1.
3. **48 kHz acceptance vs the hardcoded `sample_rate_hz: 44100` in the payload** (`uploader.ts:191`). If a 48 kHz file is ever accepted, the payload would mislabel it as 44100. Today the recorder only emits 44.1k so this can't happen, but accepting 48k in the gate creates a latent mismatch. Out of scope to fix the payload here (item 6), but flagged.
