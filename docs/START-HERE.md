# START HERE — THRIVE Member App (React Native / Expo)

> Read this first. It exists so a fresh session can be productive without re-discovering everything.
> Companion docs: [`specs/thrive-music-rn-app.md`](specs/thrive-music-rn-app.md) (the plan),
> [`PORTING.md`](PORTING.md) (Flutter→RN map), [`SCHEMA.md`](SCHEMA.md) (backend),
> **[`AUDIO-PLAYBACK.md`](AUDIO-PLAYBACK.md) — authoritative audio architecture; READ before any
> playback work. It SUPERSEDES every `react-native-track-player` mention in these docs.**

## What this is

The **member-facing mobile app** for THRIVE — an Apple Music-style rebuild, in **React Native + Expo
(TypeScript)**, of the existing Flutter app. Members sign in, see the stations/playlists their
provider authorized, listen, submit voice samples, and view their Vitality Score.

It ships as an **update to the existing store listings**, not a new app:
- Bundle id / applicationId: **`com.thriveradio.app`** (both platforms, already set in `app.json`).
- Android signing: existing upload keystore at `C:\Users\youon\thrive-radio-key.jks` (Play App
  Signing is ON — Google holds the unrecoverable key). Build with that keystore at release time.
- The current **production** Flutter app is a *different* codebase (branch `master` in the
  `ThriveRadio` repo) on a *different* Supabase project (`mxktlbhiknpdauzoitnm`). Don't touch it.

## Current repo state (done)

- Expo SDK 56, RN 0.85, Expo Router, TypeScript — scaffolded, branch `main`, pushed to
  `github.com/SaaSStage/thrive-member-app`.
- Deps installed: `@clerk/clerk-expo`, `@supabase/supabase-js`, `@tanstack/react-query`, `zustand`,
  `react-native-mmkv`, `expo-secure-store`.
  - **Audio: switch to `expo-audio`; remove `react-native-track-player`** (no stable RN 0.85 build —
    New-Arch TurboModule incompat). Full rationale + posture in `AUDIO-PLAYBACK.md`.
  - ⚠️ Native modules (mmkv + the audio engine) are **not** in Expo Go — you need a **dev build**
    (`npx expo prebuild` + EAS dev client).
- `reference/flutter-v3/` — the Flutter app's `voice/`, `score/`, `auth/` source to **port from**
  (read-only; it's Dart, not runnable here).
- `reference/supabase-migrations/` — the mobile_app_settings migration. Full schema lives in the
  **ThriveRadioPortal** repo `supabase/migrations/`.
- `.env.local` — cleaned to mobile-only public keys (see below).

## Environment

`.env.local` (gitignored) holds only **client-safe** values, `EXPO_PUBLIC_`-prefixed:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_AZURACAST_BASE_URL`

🚫 **Never** put server secrets in this app (service-role key, Clerk secret, Stripe secret). They'd be
bundled into the client binary. Those live only in the portal. See `.env.example` for the shape.

## Backend (consumed as-is)

- **Supabase v3:** `yotaqkgfpifomudtwgzr`. Schema in `SCHEMA.md`. RLS gates everything by Clerk JWT.
- **Auth:** `@clerk/clerk-expo` (email-code sign-in + device trust). Pass the Clerk JWT to Supabase
  via the `accessToken` option on the supabase-js client → RLS resolves `current_user_id()`.
  (The Flutter app hand-rolled a Clerk HTTP client because Flutter has no SDK; **don't port that** —
  use the Expo SDK.)
- **Onboarding is invite-only** (provider invites → Clerk signup → membership). No self-register UI.
- **Streaming:** AzuraCast `https://azuracast-radio-u62352.vm.elestio.app`. The seeded dev station is
  the **non-public** `hls_test` (HLS via Liquidsoap); the public `thrive_radio` relay has no HLS.
  Non-public = hidden from the current app's `/api/stations`, played by direct URL from the DB.

## ⚠️ The blocker you'll hit first: no content data

`content_assets` and `member_content_grants` are **empty**. The radio/library/home screens have
nothing to render until they're seeded. Run [`dev-seed.sql`](dev-seed.sql) against the v3 project
(Supabase SQL editor) to insert one playable station + grant it to an active member. Real content
seeding is a **portal** responsibility long-term.

## Build order (de-risk first — from the spec)

1. **Validate HLS in iPhone Safari** (zero builds): open
   `https://azuracast-radio-u62352.vm.elestio.app/hls/hls_test/live.m3u8`. If it plays continuously,
   the iOS cold-start stutter fix is confirmed before any player code. (If silent, the station is
   "Offline" — get it broadcasting first.)
2. **Auth** — Clerk sign-in → Supabase session via JWT. Get a member logged in.
3. **Content + playback** — list `content_assets` filtered by the member's grants → play the HLS
   `stream_url` with **`expo-audio`**. ⚠️ FIRST clear the `AUDIO-PLAYBACK.md` Day-1 gate (confirm
   expo-audio actually plays the m3u8 past 3 min + backgrounded on iOS AND Android). Don't tune
   buffers — the engines self-manage HLS.
4. **Voice** — capture (WAV 44.1k/16/mono) → validate (port `voice_validator.dart`, RIFF parsing) →
   upload via the `voice-upload-urls` edge function (signed URLs; not direct Storage).
5. **Score** — read `analysis_results`, present Vitality + 4 sub-scores.

Screen-by-screen Flutter references and RN target paths are in `PORTING.md`; wireframes in
`docs/wireframes/`.

## Immediate next steps

- [ ] Seed content (`dev-seed.sql`) so screens render.
- [ ] `npx expo prebuild` + set up an EAS dev client (mmkv + audio engine need native code).
- [ ] Build the Clerk provider + supabase-js client with the `accessToken` (Clerk JWT) wiring.
- [ ] Do the iPhone-Safari HLS check before writing the player.

## House rules

- Don't put secrets in the app; don't point at prod `mxkt`; don't self-register users.
- `analysis_results` rows are huge — select specific columns, never `*`.
- This branch/repo never merges into the Flutter `ThriveRadio` repo — it's the successor product.
