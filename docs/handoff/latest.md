# Session handoff — Voice analysis v1 + score breakdown, on `feat/voice-flow`

**Date:** 2026-06-18
**Branch:** `feat/voice-flow` (ahead of `main`; see `git log main..HEAD`). Pushed + PR opened (see PR link in the session / `gh pr view`).

## TL;DR
Built the **entire voice-analysis v1 feature** plus the **vitality score breakdown**
in the RN/Expo app, spec-first. The make-or-break risk — recording spec-compliant
WAV on this RN 0.85 / New Arch / Windows stack — is **solved and verified on the
Android emulator**. The emulator turned out to have a **persisted login**, so the
authenticated screens were render-verified too. All code is `tsc` + lint clean (one
pre-existing unrelated error) and unit-tested (8/8). What still needs a real device:
the full record→upload with real audio, the new password login, and iOS.

## The recorder decision (the important one)
Both third-party WAV recorders **failed to build** on this stack:
- `@siteed/audio-studio` — Android Kotlin doesn't compile against SDK 56's Expo Modules API.
- `react-native-audio-api` (Software Mansion) — Android CMake downloads iOS `.xcframework`s whose **symlinks fail to unzip on Windows**, breaking codegen.

So per [docs/AUDIO-PLAYBACK.md](../AUDIO-PLAYBACK.md)'s "thin native module"
contingency, we ship an **owned Expo module** [modules/voice-recorder/](../../modules/voice-recorder/)
— pure Kotlin `AudioRecord` → streamed 44.1 kHz/16-bit/mono PCM WAV (no C++/CMake/
downloads). **VERIFIED** recording a real spec WAV on the emulator. iOS Swift
(`AVAudioRecorder` LinearPCM) is written but **not device-tested** (needs the Mac).

## What's built (all committed)
- **Spec:** [docs/specs/voice-flow-rn-v1.md](../specs/voice-flow-rn-v1.md)
- **Recorder:** `modules/voice-recorder/` + `src/audio/recorder.ts` (pauses live radio for the session).
- **Pure logic** (unit-tested): `src/voice/recording-type.ts`, `passages.ts`, `validator.ts` (ported from v3 Flutter; validator now derives min-duration from the shared recording-type config — no duplication).
- **Upload:** `src/voice/uploader.ts` + `use-voice-submission.ts` — signed-URL upload + `voice_submissions`/`voice_recordings` inserts + `analyze-voice` trigger, matching the SHARED v3 backend (project `yotaqkgfpifomudtwgzr` — functions/tables/RLS already deployed, **no backend work**). Uses `expo-crypto` `randomUUID()`.
- **Voice flow (Screens A–G):** `src/app/voice.tsx` host + `recording-view.tsx` + `review-view.tsx`, with **Cancel/abort** on the recording + review screens and a safety-net unmount that stops the native recorder by any exit path.
- **Profile (spec §2/§2.3/§8):** `src/api/profile.ts`, `profile-setup.tsx` wizard, `profile.tsx` edit, `account.tsx`, `profile-banner.tsx`.
- **Vitality score:** `src/api/score.ts` (`useLatestScore`) + `src/app/score.tsx` breakdown screen (composite score + the 4 subscores with bars; none/analyzing/ready states).
- **Login:** `src/app/(auth)/sign-in.tsx` now **email-or-username + password** (Clerk), with email-code kept only as a 2FA fallback. (Was email-code OTP.)
- **Wiring:** Home vitality card → score breakdown (shows the real number); voice card → check-in flow (gated on a complete profile); avatar → Account. Routes registered in `_layout.tsx`. jest-expo test runner (`npm test`).

## Verified ✅ (on the Android emulator, live signed-in session)
- Custom recorder builds (New Arch) and records a spec-compliant WAV.
- Home renders the real **Vitality Score = 92**; tapping it opens the **breakdown**
  (Emotional Wellness 100 / Cognitive Clarity 100 / Physical Energy 100 / Voice
  Power 67 — and 92 ≈ their equal-weighted average, so it's reading real data).
- Voice flow **intro** renders; profile gating routes correctly.
- Validator unit tests 8/8; `tsc` clean; `expo lint` clean except one **pre-existing**
  error in `src/hooks/use-color-scheme.web.ts` (untouched).
- Code-review pass done; 1 critical (auto-stop no-op) + 4 convention findings fixed.

## YOU need to test on a real device (couldn't be done on the emulator)
1. **Full record → upload with real audio.** The emulator mic is silent, so validation
   (correctly) rejects clips — a passing recording + the live upload (signed URLs →
   DB rows → analyze-voice) needs a real phone.
2. **Auto-stop save.** Let a recording run to its full target (e.g. the 30s vowel) and
   confirm it saves + advances (this was the critical review bug; fixed via refs).
3. **Password login.** Sign out (Account → Sign out) and sign back in with
   email/username + password.

## Next steps
1. Device-test 1–3 above; fix anything that surfaces.
2. iOS: build + verify the Swift recorder (needs the Mac).
3. (Optional) Score screen could also surface the backend's narrative, trend vs.
   prior submissions, and recommended protocols — net-new scope.

## Environment notes (don't re-chase)
- Android builds need `ANDROID_HOME` + `android/local.properties` (`sdk.dir=...`);
  `android/` is gitignored (CNG — regenerated from app.json + the module via prebuild).
- Native code changes need a rebuild (`npx expo run:android`); JS hot-reloads.
- Dev client hangs on a black screen = wedged Metro workers → kill all node, start one
  fresh Metro (`npx expo start --dev-client`). See memory `metro-emulator-dev-server-recovery`.
