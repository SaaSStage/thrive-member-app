# Session handoff — Voice analysis v1 (full feature) built on `feat/voice-flow`

**Date:** 2026-06-17
**Branch:** `feat/voice-flow` (4 commits ahead of `main`, NOT pushed, NOT merged)

## TL;DR
Built the **entire voice-analysis v1 feature** in the RN/Expo app, spec-first, on a
feature branch. The make-or-break risk — recording spec-compliant WAV on this
RN 0.85 / New Arch / Windows stack — is **solved and verified on the Android
emulator**. All code is `tsc` + lint clean (one pre-existing unrelated error) and
unit-tested (8/8). The authenticated screens (voice flow + profile) **could not be
exercised without a login**, so those are yours to test on a real device.

## The recorder decision (this is the important one)
Both third-party WAV recorders **failed to build** on this stack — a real result,
not a guess:
- `@siteed/audio-studio` — Android Kotlin doesn't compile against SDK 56's Expo
  Modules API (`'reject' overrides nothing`).
- `react-native-audio-api` (Software Mansion) — its Android CMake step downloads
  iOS `.xcframework`s and the **symlinks fail to unzip on Windows**, breaking codegen.

So per [docs/AUDIO-PLAYBACK.md](../AUDIO-PLAYBACK.md)'s "thin native module"
contingency, we ship an **owned Expo module**: [modules/voice-recorder/](../../modules/voice-recorder/)
— pure Kotlin `AudioRecord` → streamed 44.1 kHz/16-bit/mono PCM WAV (no
C++/CMake/codegen/downloads, so none of the above failure modes). **VERIFIED**: it
recorded a real WAV on the emulator (`RIFF/PCM/44100/16/mono`, header parsed OK).
iOS Swift (`AVAudioRecorder` LinearPCM) is written but **not device-tested** (needs the Mac).

## What's built (all committed on the branch)
- **Spec:** [docs/specs/voice-flow-rn-v1.md](../specs/voice-flow-rn-v1.md)
- **Recorder:** `modules/voice-recorder/` (native) + `src/audio/recorder.ts` (service; pauses live radio for the session).
- **Pure logic** (unit-tested, 8/8): `src/voice/recording-type.ts`, `passages.ts`, `validator.ts` (ported from v3 Flutter — per-type silence thresholds, quietest-window noise floor).
- **Upload:** `src/voice/uploader.ts` + `use-voice-submission.ts` — signed-URL upload + `voice_submissions`/`voice_recordings` inserts + `analyze-voice` trigger, matching the SHARED v3 backend (project `yotaqkgfpifomudtwgzr`; functions/tables/RLS already deployed — **no backend work needed**).
- **Flow UI (Screens A–G):** `src/app/voice.tsx` (modal host) + `src/components/voice/recording-view.tsx` + `review-view.tsx`.
- **Profile (spec §2/§2.3/§8):** `src/api/profile.ts`, `src/app/profile-setup.tsx` (3-step wizard), `src/app/profile.tsx` (edit), `src/app/account.tsx`, `src/components/voice/profile-banner.tsx`.
- **Wiring:** Home cards both launch the flow (gated — incomplete profile runs setup first), avatar → Account; modal routes registered in `_layout.tsx`.
- **Test runner:** jest-expo added (`npm test`).

## Verified ✅
- Custom recorder builds on RN 0.85/New Arch and records a spec-compliant WAV (emulator).
- Validator unit tests 8/8 pass.
- `tsc` clean; `expo lint` clean except one **pre-existing** error in `src/hooks/use-color-scheme.web.ts` (untouched — not from this work).
- Full JS bundle loads on the emulator with no errors after every change.
- Code-review pass done; its 1 critical (auto-stop timer no-op) + 4 convention findings fixed.

## YOU need to test (couldn't be done autonomously)
1. **Log in** (test member myowja@gmail.com) — the auth guard redirects all
   unauthenticated navigation to welcome, so voice/profile screens are unreachable
   without a session. This gates everything below.
2. **Full record→upload on a real device.** The emulator mic records silence, which
   the validator (correctly) rejects — so a passing recording + the live upload path
   (signed URLs → DB rows → analyze-voice) needs a real device with real audio.
3. **Auto-stop path specifically.** The countdown auto-stop was the critical bug the
   review caught; it's fixed via refs, but confirm a recording that runs to its full
   target duration (e.g. the 30s vowel) saves and advances — not just the manual Stop.
4. The test member's profile is already filled, so the **setup wizard** won't trigger
   from the banner; reach it via **Account → Health profile** (edit), which uses the
   same controls.

## Next steps
1. Device-test the above; fix anything that surfaces.
2. iOS: build + verify the Swift recorder (needs the Mac).
3. Optional polish noted by review (not bugs): consolidate `recording-type.minValidMs`
   with the validator's `minValidSeconds` (duplicated but in agreement); consider
   `expo-crypto` `randomUUID()` over the `Math.random` UUID in the uploader.
4. When happy: push `feat/voice-flow` and open a PR (or merge to main).

## Environment notes (don't re-chase)
- Android builds need `ANDROID_HOME` set + `android/local.properties` (`sdk.dir=...`);
  `android/` is gitignored (CNG — regenerated from app.json + the module via prebuild).
- Adding/changing native code needs a rebuild (`npx expo run:android`); JS changes hot-reload.
- See memory `metro-emulator-dev-server-recovery` for dev-server/emulator gotchas.
