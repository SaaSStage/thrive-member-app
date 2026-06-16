# Spec: Thrive Member App — Apple Music-style rebuild (React Native, one codebase)

- **Status:** draft
- **Date:** 2026-06-12
- **Related:**
  - **Reference implementation to port: the v3 Flutter app** — branch `voice-capture-v1`, worktree `C:\GitHub\ThriveRadio-v3\Radio-App\Radio-App-2.2.2` (Clerk auth, voice capture, score preview, v3 config — all implemented and working)
  - Voice flow design doc: `mobile_app_voice_v1_plan.md` (repo root)
  - Backend: ThriveRadioPortal repo — v3 Supabase project `yotaqkgfpifomudtwgzr` (`supabase/migrations/`, voice pipeline docs in `docs/`)

## Problem / goal

The Thrive mobile app is the **member-facing companion to the Thrive provider platform** (ThriveRadioPortal): members sign in, see the radio stations, playlists, and on-demand content **their provider has authorized them for**, listen, **submit voice samples** for analysis, and view their **Vitality Score**. Today it's Flutter (v3 on `voice-capture-v1`). The rebuild delivers the same product with an **Apple Music-grade experience** on **iOS and Android from a single codebase**, using **real native UI components**.

A secondary but real goal: reduce the iOS build/test pain. The current Flutter flow requires the Mac for every iOS build and has cost week-long debug cycles. Expo EAS cloud builds let iOS binaries be produced from the Windows machine, with the Mac needed only for occasional native debugging.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Framework | **React Native + Expo (TypeScript)** | Renders actual native iOS/Android views from one codebase. EAS cloud builds reduce Mac dependency. Bonus: Clerk ships an official Expo SDK (`@clerk/clerk-expo`) — the Flutter app had to hand-roll a ~300-line Clerk client because no Flutter SDK exists. |
| Source of truth to port | **The v3 Flutter app (`voice-capture-v1` branch)** | Voice capture, score preview, Clerk auth, and v3 config are implemented and debugged there — port that behavior, not the older `master` app. |
| Content scope | **Authorized content, Apple Music UX** | Live stations + playlists + on-demand, filtered per member by provider grants; Apple Music-style presentation. |
| Backend | **v3 Supabase (`yotaqkgfpifomudtwgzr`, portal schema) + Clerk + AzuraCast** | Consumed as-is: `users`/`practice_memberships`, `content_assets`/`member_content_grants`, entitlements, voice pipeline, `mobile_app_settings`. AzuraCast serves streams and on-demand files. |
| Monetization | **None in-app** | No ads (AdMob removed entirely). Access is governed by entitlements/plans managed in the provider portal — the app just respects them. |
| v1 additions over the v3 Flutter app | **Apple Music UX + entitlement-filtered content + on-demand as first-class** | Voice + score preview are ports of existing features. Offline downloads, CarPlay/Android Auto, user-created playlists deferred. |

## Approach

### Architecture

```
ONE TypeScript codebase (Expo)
├── UI: React Native native views + Expo Router (typed file-based navigation)
├── Auth: @clerk/clerk-expo (email-code sign-in, device trust, session restore)
│     • Clerk JWT → Supabase via accessToken callback (third-party integration,
│       same wiring the v3 Flutter app proved out)
│     • public.users.id (uuid joined to Clerk sub) used for all FK writes
├── Audio playback: react-native-track-player (RNTP)
│     • iOS: AVPlayer under the hood — the same engine the custom
│       LiveRadioPlayer native fix converged on after the stuttering saga
│     • Android: ExoPlayer/Media3 with foreground service
│     • Lock screen / Control Center / notification controls built in
├── Audio capture (voice samples): WAV 44.1 kHz / 16-bit / mono recorder
│     with on-device quality validation (port of the v3 implementation)
├── Server state: TanStack Query over Supabase JS + AzuraCast REST
├── Client state: Zustand (player UI state, theme) — RNTP owns playback state
├── Local persistence: react-native-mmkv + expo-secure-store (Clerk session)
└── Builds: EAS Build (cloud iOS builds from Windows) + EAS Update for OTA JS fixes
```

Key insight from the Flutter app's history: the iOS playback work converged on a **native AVPlayer** path. RNTP's iOS backend *is* AVPlayer — the new stack lands on that architecture by default instead of via a custom Objective-C plugin and kill-switch. But AVPlayer alone is **not** the whole fix — see the next section.

### The iOS cold-start stutter — STILL UNSOLVED, must be fixed in v1

**Symptom (current, on the v3 app with the native player):** open the app, press play — audio plays a few seconds, cuts out a few seconds, plays, cuts out — until the user pauses ~10 seconds, after which playback is continuous. Apple Music never does this; neither may we. This is the single most important quality bar for the rebuild.

**Root cause analysis:** the v3 native player code (`ios/Runner/LiveRadioPlayer.m`) is structurally sound — correct KVO, session handling, interruption handling. The problem is the **stream format**, not the player. The app feeds AVPlayer a progressive Icecast stream (`/listen/{station}/radio.mp3`). AVPlayer's stall-avoidance machinery (`automaticallyWaitsToMinimizeStalling`, `preferredForwardBufferDuration`) is designed around HLS's segment model and behaves poorly on endless progressive streams: it starts playback on a sliver of buffer, drains it, stalls, refills a sliver, repeats. Apple's own developer forums document that these two properties conflict (auto-waits must be *off* for the buffer-duration hint to be respected) and that stalled progressive streams often need a manual kick to resume. The "pause 10 seconds" workaround works because AVPlayer keeps downloading while paused — the user is hand-building the buffer the player won't build itself. That is textbook cold-start buffer starvation.

**The industry-standard fix: serve HLS, not raw Icecast, to the apps.**

1. **Enable HLS on the AzuraCast stations** (built-in: station profile → AutoDJ tab; streams served at `/hls/{station}/live.m3u8`, sub-stream bitrates configurable under Broadcasting → HLS Streams). No new infrastructure.
2. **Play the HLS URL in RNTP.** AVPlayer is *the* reference HLS client (it's what Apple Music radio uses); ExoPlayer/Media3 on Android has first-class HLS support. Segmented delivery gives the player declared durations and real buffer accounting — the stall logic finally works as designed.
3. **Metadata** continues to come from the AzuraCast now-playing API (HLS doesn't carry ICY `StreamTitle`; the app already polls the API, so nothing is lost).
4. **Stream selection is data + config, not code**: `content_assets.stream_url` carries the HLS URL per station; a remote-config flag allows falling back to the Icecast URL per platform if HLS misbehaves — same kill-switch pattern as `ios_use_native_live_player`.
5. **Defense in depth — preroll gate**: if the Icecast fallback is ever active, do not start playback until N seconds are buffered (new `cold_start_preroll_seconds` tunable in `mobile_app_settings`) — automating the manual pause-trick instead of relying on the user to discover it.

**Trade-off to accept:** HLS adds latency behind the live edge (a few segment durations, typically 10–30 s). For radio listening this is imperceptible and is the same trade Apple Music's live stations make.

**Cheap validation before any app code is written:** enable HLS on one station and open `https://<azuracast>/hls/<station>/live.m3u8` in Safari on the iPhone — Safari plays it with the same AVPlayer stack. If cold-start playback is continuous there, the fix is confirmed with zero builds.

### Auth (port of v3 Clerk architecture)

- Clerk email-code sign-in with device trust, replacing the old Supabase email/password entirely. Use `@clerk/clerk-expo` instead of hand-rolled client code.
- Supabase client authenticates with the **Clerk session JWT** via the `accessToken` callback; all authorization is RLS against that JWT. Supabase Auth namespace is not used.
- Resolve and persist `public.users.id` (the uuid joined to the Clerk `sub`) — it is the FK for `station_listens`, voice submissions, etc.
- Session restore on launch without UI prompt; sign-out revokes the Clerk session but preserves device trust (matching v3 behavior).
- Dev Clerk instance `eager-calf-94` is shared with the v3 Supabase project; production launch requires cutting a production Clerk app (open question below).

### Content authorization model

Content is not public. On sign-in, the app resolves what this member may see and play:

1. Fetch the member's **content grants**: `member_content_grants` (grant/revoke, prescriber, optional expiry) joined to `content_assets`.
2. `content_assets` rows are typed `radio_station` | `playlist` | `frequency` | `audio_protocol`, each carrying its `azuracast_station_id` / `stream_url` and an optional `entitlement_code` gate (checked via `has_entitlement` / `tenant_entitlements`).
3. The app renders **only granted, active, non-expired, entitlement-satisfied assets**. Home, Radio, Library, and Search all operate on this filtered set — a member never sees content they aren't authorized for.
4. Grants are re-fetched on app foreground and cached in MMKV for fast cold start; a revoked grant disappears on next refresh and stops playback eligibility.

AzuraCast remains the audio source (live streams + on-demand files); the v3 database is the source of truth for *who may play what*.

### Apple Music UX mapping

| Apple Music concept | Thrive equivalent |
|---|---|
| Tab bar | **Home** (featured/recently played from granted content, voice-analysis + score cards), **Radio** (granted live stations), **Library** (granted playlists + on-demand collections), **Search** (within granted content) |
| Album/artist page | **Station page**: hero artwork, "Play" (live) button, description, then that station's on-demand tracks listed like album tracks. **Playlist page**: same layout for granted playlist assets. |
| Mini-player above tab bar | Persistent mini-player (artwork, title/artist, play/pause); tap/swipe-up opens full player |
| Full-screen Now Playing | Blurred-artwork background, large artwork, live metadata from AzuraCast now-playing, native AirPlay/output picker, favorite + share |
| Native fidelity details | SF Symbols (`expo-symbols`), native blur (`expo-blur`), native context menus on long-press, platform-native tab bar (`react-native-bottom-tabs`), haptics, large-title navigation headers |

### Voice analysis (port of the implemented v3 feature)

The v3 Flutter app (`lib/voice/`, `lib/score/`) is the reference implementation — port its behavior and its hard-won fixes, not just the plan document:

- **Profile health context (one-time setup)**: year of birth, biological sex, smoking status, respiratory/vocal conditions, preferred language (English/Spanish). Collected only when missing, editable in Settings → Profile; non-blocking completion banner.
- **Mic test screen** before first recording (exists in v3 — keep it).
- **Guided three-recording session**: sustained "ah" (30 s), reading passage (35 s window; member's language, randomly chosen from bundled validated passages EN-01/EN-02/ES-01/ES-02 with passage ID reported), "pa-ta-ka" diadochokinetic task (10 s). Bundled audio examples. Review screen with per-recording playback, quality status, selective re-record.
- **Playback hard-stop on voice-flow entry** (v3 fix — radio must not be playing into the mic).
- **On-device quality validation** after each recording: minimum duration, max-silence ratio, clipping, background-noise floor, RMS energy — pass / pass-with-warning / fail-with-retry. Port the v3 validator thresholds and its **RIFF-chunk WAV parsing** (do not assume a 44-byte header — that bug already happened and was fixed).
- **Capture format**: WAV, 44.1 kHz, 16-bit PCM, mono, no processing. Port the v3 WAV parsing unit tests.
- **Upload — must go through the `voice-upload-urls` edge function** (service-role signed upload URLs). Direct client Storage uploads **fail under Clerk** because Storage writes the JWT `sub` into a uuid `owner_id` column and Clerk subs are text (`user_xxx`). This is a known, solved blocker — keep the v3 upload path: parallel upload of three files to `voice-samples/{client_user_id}/{submission_uuid}/{recording_type}.wav`, per-file retry, then insert `voice_submissions` + three `voice_recordings` rows with full capture metadata.
- **Quota awareness**: respect `voice_submission_unlimited` vs `voice_submission_metered` (4/month) — show remaining quota and a friendly limit message.
- **Score preview ("My Score")**: port the v3 score screens — Vitality Score + 4 sub-scores read from `analysis_results`, scoring weights from config, info popovers describing the four domains. Gated by `basic_score_preview` (included in every plan).
- **Offline resilience**: recordings captured without network are kept and uploaded when connectivity returns.

### Non-negotiable carry-over: the remote-config tuning layer

`public.mobile_app_settings` (v3 Supabase, key/jsonb, anon-readable, admin-written) is the playback tuning layer and **must be wired into the new player from day one**. The v3 seed already carries the migrated buffering-saga values. Mapping:

| `mobile_app_settings` key | Where it lands in RNTP |
|---|---|
| `android_min_buffer_seconds`, `android_max_buffer_seconds`, `android_buffer_for_playback_seconds`, `android_buffer_for_playback_after_rebuffer_seconds` | `setupPlayer({ minBuffer, maxBuffer, playBuffer, backBuffer })` |
| `retry_max_count`, `retry_delay_seconds`, `reconnect_delay_seconds` | App-level retry/reconnect loop in the player service (port of the v3 state machine) |
| `stream_probe_timeout_seconds` | Pre-play probe with timeout (port of stream probe + RTT capture) |
| `ios_preferred_forward_buffer_seconds`, `ios_auto_waits_to_minimize_stalling` | Verify RNTP exposure during the playback-core step; if not exposed, add via Expo config plugin / small native patch — do **not** drop the tunables |
| `ios_use_native_live_player` | Retire (RNTP is already the native AVPlayer path); add new kill-switch flags as needed following the same pattern |
| `listen_heartbeat_seconds` | Listen-session heartbeat cadence (see analytics) |
| **NEW** `live_stream_protocol` (or per-platform variants) | HLS vs Icecast-fallback kill-switch for live streams (see cold-start stutter section) |
| **NEW** `cold_start_preroll_seconds` | Preroll buffer gate before starting playback on the Icecast fallback path |

New tunables discovered during development go into `mobile_app_settings`, never hardcoded.

### What ports straight across (parity checklist)

- **Analytics**: `station_listens` sessions (start/stop/duration, **periodic heartbeat** at `listen_heartbeat_seconds` so killed-mid-listen sessions close at last-known time — v3 behavior), keyed by `public.users.id` with `practice_id`; `user_reports` diagnostic dialog (player state, connectivity, stream RTT, buffering stats). Mobile no longer writes `auth_events` (dropped in v3 — don't reintroduce).
- **Theming**: dark/light with system-follow; persisted.
- **Multi-language support**: English and Spanish — all UI labels, plus the voice flow's reading passages and instructions follow the member's `preferred_language`. (The translation framework — e.g. `i18next` — is an implementation detail; the requirement is every user-facing string exists in both languages.)
- **Maintenance/force-update gate** driven by remote config.

## Proposed project structure (new repo: `ThriveMemberApp`)

```
app/                      # Expo Router routes
  (tabs)/home, radio, library, search
  station/[id].tsx        # Station page (live + on-demand tracks)
  playlist/[id].tsx       # Playlist asset page
  player.tsx              # Full-screen Now Playing (modal)
  voice/                  # Mic test → intro → 3 recordings → review → upload → success
  score/                  # My Score (vitality + 4 sub-scores)
  profile-setup/          # One-time health-context wizard
  (auth)/welcome, sign-in # Clerk email-code flow
src/
  audio/                  # RNTP service, playback machine, retry logic, stream probe
  voice/                  # Recorder, WAV/RIFF validation, passages, upload queue
  api/                    # Supabase client (Clerk accessToken), AzuraCast client,
                          # mobile_app_settings loader, grants resolver
  features/               # auth/, entitlements/, analytics/, reports/, scores/
  components/             # MiniPlayer, StationCard, TrackRow, design system
  stores/                 # Zustand stores
  config/                 # remote-config types + defaults
```

## Reuse

- **v3 Supabase schema and edge functions as-is** — `users`, `practice_memberships`, `content_assets`, `member_content_grants`, entitlements + `has_entitlement`, `voice_submissions` / `voice_recordings` / `analysis_results`, `station_listens`, `user_reports`, `mobile_app_settings`, `voice-upload-urls` / `analyze-voice`. No backend changes expected for v1.
- **The v3 Flutter implementation as the behavioral reference** — voice validator thresholds + RIFF parsing (and its unit tests), uploader sequencing + signed-URL flow, ClerkSession lifecycle (restore / JWT refresh / `public.users.id` resolution), score screens + descriptions, listen heartbeat, playback retry state machine.
- **AzuraCast endpoints** — `/api/stations`, `/api/nowplaying[/id]`, `/api/station/{id}`, `/api/station/{id}/ondemand`; port the existing provider logic 1:1 to TypeScript.
- **Voice plan assets** — the four validated reading passages, audio examples, validation thresholds, metadata shape.
- **Translation strings, share text, artwork fallbacks** — copy from the Flutter app.

## Steps

0. **HLS validation (no app code)**: enable HLS on one AzuraCast station; play `live.m3u8` in Safari on the physical iPhone; confirm cold-start playback is continuous (no play/stall cycling). This proves the stutter fix before a single line of the new app exists. Then enable HLS on all stations and populate `content_assets.stream_url` with HLS URLs.
1. **Scaffold + CI**: Expo app (TypeScript, Expo Router), EAS Build profiles (dev/preview/prod), one successful cloud iOS build installed on the iPhone 17 before any feature work — de-risk the build pipeline first.
2. **Auth**: Clerk Expo sign-in (email code), session restore, Supabase client wired to Clerk `accessToken`, `public.users.id` resolution. Verify: existing v3 member account signs in and an RLS-protected query returns data.
3. **Data layer**: grants/entitlements resolver + AzuraCast client + `mobile_app_settings` loader with typed defaults. Verifiable via unit tests against the live backends.
4. **Playback core (the critical step)**: RNTP setup with remote-config-driven buffers, **HLS live streams**, play/stop, retry state machine, stream probe, now-playing metadata sync to lock screen/Control Center. Verify on the real iPhone over cellular + flaky Wi-Fi *before building more UI* — the cold-start criterion below is the go/no-go gate for the whole stack.
5. **On-demand + playlist playback**: granted station on-demand track lists and playlist assets → RNTP queue, seek, track advance, metadata.
6. **UI shell**: native tab bar, mini-player, full Now Playing modal.
7. **Screens**: Home, Radio, Station/Playlist pages, Library, Search — all driven by the member's granted-content set, with empty states for members with few grants.
8. **Voice flow + score**: profile-setup wizard, mic test, three-recording session with validation, review/re-record, signed-URL upload + submission rows, quota handling, My Score screen. Validate WAV output against the ported unit tests and a real submission visible in the portal.
9. **Analytics + reports**: listen sessions with heartbeat, diagnostic report dialog.
10. **Polish + parity sweep**: theming, English/Spanish coverage, maintenance gate, empty/error/offline states, haptics, context menus.
11. **Device validation + release**: extended-session soak test on iPhone (background, lock screen, interruptions: calls/Siri/Bluetooth), Android equivalent; voice capture tested across several physical devices/mics in both languages; TestFlight + Play internal track.

## Acceptance criteria

- [ ] One repo, one TypeScript codebase; iOS and Android builds both produced by EAS from it.
- [ ] iOS build produced via EAS cloud **without requiring the Mac**.
- [ ] Existing v3 member signs in via Clerk email code; session survives app restart without re-prompt; RLS queries work via the Clerk JWT.
- [ ] Signing in shows **only** that member's granted content; granting/revoking an asset in the portal changes what the app shows on next refresh without an app update.
- [ ] An asset gated by an entitlement the member's tenant lacks does not appear (or appears locked, per design decision below).
- [ ] **Cold-start (the Apple Music bar)**: from app launch on the physical iPhone (iOS 26.x), tap play → audio starts within ~5 s and plays **continuously** for 10+ minutes on both Wi-Fi and cellular — no play/stall cycling, no pause-and-resume workaround, ever.
- [ ] Live stream plays ≥ 1 hour on the physical iPhone with screen locked — no stutter, no drop; survives app backgrounding, a phone call interruption, and a Bluetooth route change.
- [ ] Lock screen / Control Center / Android notification show artwork + live song metadata and working play/pause.
- [ ] On-demand: station/playlist pages list tracks; tapping plays with seek + auto-advance.
- [ ] All `mobile_app_settings` tunables are read at startup and demonstrably affect player behavior (verified by changing a value in Supabase and observing the change — no rebuild).
- [ ] Voice flow end-to-end on a real device: profile setup (first time only), mic test, three recordings with validation (including a forced failure → retry), one selective re-record, upload via `voice-upload-urls` producing correct Storage paths + `voice_submissions`/`voice_recordings` rows with full metadata, analysis triggered, submission visible in the provider portal.
- [ ] Radio playback hard-stops when the voice flow starts.
- [ ] Metered member sees remaining quota and a friendly block at the cap; unlimited member sees no cap.
- [ ] My Score shows Vitality Score + 4 sub-scores (with domain info popovers) after analysis completes.
- [ ] Voice flow works fully in Spanish (passages, instructions, labels).
- [ ] Listen sessions write heartbeats; force-killing the app mid-listen leaves a session closed at its last heartbeat.
- [ ] No ads or ad SDKs anywhere in the app.
- [ ] UI uses native components: native tab bar, SF Symbols on iOS, native blur, native context menus, native AirPlay/output picker.
- [ ] Dark/light theme; full English and Spanish coverage.

## Out of scope (v1)

- Ads / AdMob — removed permanently, not deferred
- User-created playlists (playlists are provider-curated `content_assets`)
- Offline downloads of music content (voice recordings do queue offline for upload)
- CarPlay / Android Auto (RNTP supports both — natural Phase 2)
- In-app purchases / Stripe flows (plans and entitlements are managed in the portal)
- Provider-facing features (reports authoring, member management — that's the web portal)
- Backend/schema changes (the v3 schema and edge functions are consumed as-is)

## Open questions / decisions

- **Store listing strategy**: ship as an update to the existing ThriveRadio listings (keeps installs/reviews) or as a new app (clean launch; old app sunset)? *(candidate ADR)*
- **Clerk production cutover**: the app currently runs on the dev Clerk instance (`eager-calf-94`). When is the production Clerk app cut, and does the v3 Supabase third-party integration get a prod counterpart or a separate prod Supabase project? *(candidate ADR)*
- **Locked vs hidden content**: should entitlement-gated assets the member lacks be invisible, or shown locked with a "contact your provider" message? Affects Library/Search design.
- **Playlist/frequency asset playback**: how do `playlist` and `frequency` content assets resolve to playable media — AzuraCast playlists, on-demand track sets, or `stream_url` directly? Needs confirmation against portal data before Step 5.
- **HLS rollout details**: confirm the AzuraCast version on the Elestio instance supports HLS; choose segment duration / sub-stream bitrates (Broadcasting → HLS Streams); confirm the Barix relay chain feeds AutoDJ in a way HLS can consume. Validated by Step 0 before any app work. *(candidate ADR)*
- **iOS buffer tunables in RNTP**: confirm whether `preferredForwardBufferDuration` / `automaticallyWaitsToMinimizeStalling` are exposed; if not, config-plugin patch vs. upstream PR. Less critical under HLS (AVPlayer manages HLS buffering itself); mainly relevant to the Icecast fallback path. *(candidate ADR)*
- **WAV capture library**: confirm the chosen Expo/RN recorder produces true 44.1 kHz/16-bit/mono PCM WAV on both platforms (Android often defaults to AAC); validate against the ported RIFF-parsing tests during Step 8.
- **Score-refresh UX**: does the app poll for analysis completion, or receive a push notification? (No push infra exists today — polling on app open is the simple v1 answer. Check what the v3 score screen does and match it.)
