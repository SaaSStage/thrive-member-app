# Porting Guide — Flutter v3 → React Native (Expo)

This repo is the **React Native (Expo) rebuild** of the THRIVE member app. Feature behavior is
ported from the **v3 Flutter app**, preserved read-only in [`../reference/flutter-v3/`](../reference/flutter-v3).
Plan of record: [`specs/thrive-music-rn-app.md`](specs/thrive-music-rn-app.md).

**Backend is consumed as-is** — v3 Supabase (`yotaqkgfpifomudtwgzr`), Clerk, AzuraCast. Nothing
backend is rebuilt. v3 migrations kept for reference in
[`../reference/supabase-migrations/`](../reference/supabase-migrations).

**Store identity:** ships as an update to the existing listing — bundle id `com.thriveradio.app`,
signed with the existing upload keystore (`C:\Users\youon\thrive-radio-key.jks`). No new app.

---

## Stack (from the spec)

| Concern | Choice |
|---|---|
| UI / nav | React Native + Expo Router (typed routes) |
| Auth | `@clerk/clerk-expo` (replaces the hand-rolled Flutter Clerk client) |
| Playback | `react-native-track-player` (iOS AVPlayer / Android Media3) over **HLS** |
| Voice capture | WAV 44.1 kHz / 16-bit / mono + on-device validation |
| Server state | TanStack Query over `@supabase/supabase-js` + AzuraCast REST |
| Client state | Zustand |
| Local store | `react-native-mmkv` + `expo-secure-store` (Clerk session) |
| Builds | EAS Build (cloud iOS from Windows) + EAS Update |

> Native modules (track-player, mmkv) are **not** in Expo Go — use a dev build (`expo prebuild` /
> EAS dev client).

---

## Screen map (wireframe → Flutter reference → RN target)

| Wireframe (`docs/wireframes/png/`) | Flutter reference (`reference/flutter-v3/`) | RN target (`src/app/`) |
|---|---|---|
| 01_welcome | `auth/screens/welcome_screen.dart` | `(auth)/welcome.tsx` |
| 02_signin | `auth/screens/login_screen.dart`, `auth/screens/email_code_screen.dart` | `(auth)/sign-in.tsx` |
| 03_profile-setup | `auth/screens/register_screen.dart` | `(auth)/profile-setup.tsx` |
| 04_home | `score/screens/*`, content widgets | `(tabs)/index.tsx` |
| 05_radio | content list (entitlement-filtered) | `(tabs)/radio.tsx` |
| 06_library | content list | `(tabs)/library.tsx` |
| 07_search | — | `(tabs)/search.tsx` |
| 08_station | content detail | `station/[id].tsx` |
| 09_playlist | content detail | `playlist/[id].tsx` |
| 10_now-playing | player UI (RNTP state) | `player.tsx` |
| 11_voice-intro | `voice/screens/*` | `voice/index.tsx` |
| 12_mic-test | `voice/services/recorder_service.dart` | `voice/mic-test.tsx` |
| 13_voice-record | `voice/screens/*`, `recorder_service.dart` | `voice/record.tsx` |
| 14_voice-review | `voice/screens/*`, `voice/services/voice_validator.dart` | `voice/review.tsx` |
| 15_voice-upload | `voice/services/voice_uploader_service.dart` | `voice/upload.tsx` |
| 16_my-score | `score/services/score_repository.dart`, `score/score_descriptions.dart` | `(tabs)/score.tsx` |
| 17_settings | `auth/services/auth_service.dart` (sign-out) | `settings.tsx` |

(The `png-frequency/` set is the alternate "frequency" visual direction — same screens.)

---

## Non-UI ports (the logic worth keeping)

- **Auth — do NOT port the HTTP client.** `auth/services/clerk_client.dart` is a ~300-line hand-rolled
  Clerk Frontend-API client that exists only because Flutter has no Clerk SDK. Replace it wholesale
  with `@clerk/clerk-expo`. Use `clerk_session.dart` / `auth_service.dart` only as a **behavior**
  reference (email-code sign-in, device trust, session restore, Clerk JWT → Supabase `accessToken`).
- **Voice validator** — `voice/services/voice_validator.dart` parses WAV via RIFF chunks (does **not**
  assume a 44-byte header). Port that algorithm to TS faithfully; it gates uploads.
- **Recorder** — `recorder_service.dart` → RN WAV recorder at 44.1 kHz / 16-bit / mono.
- **Upload** — `voice_uploader_service.dart` → uploads MUST go through the `voice-upload-urls` edge
  function (service-role signed URLs). Direct Storage upload fails (Clerk sub is text, owner_id is uuid).
- **Score** — `score_repository.dart` reads `analysis_results` (Vitality + 4 sub-scores);
  `score_descriptions.dart` holds the domain copy. Port the data shape + copy.

---

## Build order (de-risk first)

1. **Validate HLS in iPhone Safari** — open `https://<azuracast>/hls/<station>/live.m3u8`. No build.
   Confirms the cold-start stutter fix before any player code (see spec §"iOS cold-start stutter").
2. **Auth** — `@clerk/clerk-expo` sign-in → Supabase session via Clerk JWT.
3. **Content + playback** — entitlement-filtered list → RNTP over HLS.
4. **Voice** — capture → validate → upload via edge function.
5. **Score** — read + present.
