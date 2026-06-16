# Audio Playback — hard-won lessons (READ before touching the player)

This captures **months of iOS/Android playback troubleshooting** from the Flutter apps so the RN
rebuild does not repeat them. If you change anything about playback, read this first. Sources:
the Flutter v3 native player (`reference/flutter-v3/...` + `ios/Runner/LiveRadioPlayer.m`), the live
`mobile_app_settings` tuning table, and the spec's stutter analysis.

---

## TL;DR — the one rule

**Do not try to fix live-stream stutter by tuning buffers. The stutter is a stream-format problem,
and the fix is to play HLS, not raw Icecast.**

The iOS symptom: open app, press play → a few seconds of audio, a few seconds of silence, repeating,
until you pause ~10 s (which lets the buffer fill), after which it's continuous. **Root cause
confirmed (2026-06-15):** a bare **AVPlayer cannot reliably play an endless Icecast/SHOUTcast
progressive stream** (no Content-Length, ICY). Safari works on the *identical URL* because WebKit
uses a tolerant progressive-download path. AVPlayer is, however, an excellent **HLS** client (it's
what Safari uses for HLS, and what Apple Music radio uses). **So feed the player HLS.**

Proven: the same audio as an HLS `.m3u8` plays flawlessly in iPhone Safari. The relay station
`hls_test` already serves it: `https://azuracast-radio-u62352.vm.elestio.app/hls/hls_test/live.m3u8`.

---

## Do NOT re-try these (already tested, already failed)

Every one of these cost real time and did **not** fix the stutter:

- ❌ Tuning `preferredForwardBufferDuration` — tested 0, 5, 15, 20; setting it to **0 live** on the
  native player did **not** fix it. No buffer value fixes it.
- ❌ `automaticallyWaitsToMinimizeStalling = false` — caused a worse regression (audio went **silent
  after 3 s** on iOS 26.x). Must stay **true**.
- ❌ Blaming server / network / codec — **Android plays the same stream fine, and Safari plays the
  same URL fine.** The stream is healthy. It is an iOS-client/format issue.
- ❌ AudioSession category/mode experiments (custom `allowBluetooth`, `.music()` preset) — no
  meaningful effect. The landing spot is plain **Playback + Default**, to match Safari.
- ❌ `just_audio_background` (old Flutter wrapper) — its ~30 s MediaSession-sync cadence matched the
  interruption cadence; removing it was part of the path, not the fix.
- ❌ Treating HLS as a "make the server healthy" change — the server is fine; HLS is about giving
  AVPlayer a format it can buffer correctly.

**If you find yourself adjusting a buffer number to fix stutter, stop — you're repeating history.**

---

## Player library: react-native-track-player → **expo-audio**

The spec named RNTP, but on **RN 0.85 there is no stable RNTP** — 4.1.2 is broken and the only
forward version is `5.0.0-alpha0` (a nightly alpha; shipping an alpha audio engine in a store app is
a real risk). **Decision: use `expo-audio`** (first-party, maintained by Expo, guaranteed compatible
with SDK 56 + New Architecture). It rides the **same engines that matter** — AVPlayer (iOS),
ExoPlayer/Media3 (Android) — so the entire "HLS fixes the stutter" rationale is **unchanged**. It
does background audio + HLS streaming.

**Caveat to know going in:** `expo-audio` does **not** expose low-level buffer knobs
(`preferredForwardBufferDuration`, ExoPlayer min/max buffer) in JS the way RNTP/just_audio did. That
is **fine**, because the saga's whole conclusion is *stop tuning buffers, use HLS*. The buffer
tunables only ever mattered on the Icecast path, which HLS replaces. If a real need for a native
buffer knob appears later, add it via a tiny Expo config plugin / native patch — don't block on it,
and don't reintroduce buffer-tuning as a stutter "fix."

---

## Carry these behaviors across (hard-won, from `LiveRadioPlayer.m`)

These are correct iOS behaviors the native player converged on. `expo-audio` handles some
automatically; verify each and implement the rest in JS.

1. **Audio session = Playback + Default, nothing fancy.** Match Safari. In expo-audio:
   `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`.
   Background audio also requires `UIBackgroundModes: ["audio"]` (iOS) — add via the expo-audio
   config plugin / `app.json`.
2. **Interruptions (calls, Siri, other audio):** on *begin* → pause; on *end* → resume **only if**
   the system says `shouldResume`. Don't blindly resume. (expo-audio surfaces interruption events —
   wire them; don't hand-roll re-emits.)
3. **Route changes:** when the **old device becomes unavailable** (headphones unplugged, BT
   dropped) → **pause, do NOT auto-resume**. (Classic "don't blast audio out the speaker" rule.)
4. **Stall detection → app-level retry, not buffer tuning.** The native player treated
   `timeControlStatus == WaitingToPlayAtSpecifiedRate` as "stalled" and let the Dart service drive a
   retry/reconnect loop. In RN: watch expo-audio's status (`isBuffering`/`playing`/error) and run the
   **port of the retry state machine** (see tuning table: `retry_max_count`, `retry_delay_seconds`,
   `reconnect_delay_seconds`).
5. **Lock screen / Now Playing:** mark the item as a **live stream**
   (`MPNowPlayingInfoPropertyIsLiveStream` equivalent) and **update now-playing info on the main
   thread only** — on iOS 26 beta, off-main updates crash or silently kill lock-screen UI. Verify how
   expo-audio exposes now-playing metadata; if insufficient, a small native shim may be needed.
6. **Never deactivate→reactivate the audio session inside one restart.** The native rewrite explicitly
   tears down the player but **keeps the AVAudioSession active** across a watchdog re-init; full
   deactivation happens **only** on real dispose (with `NotifyOthersOnDeactivation`). Deactivate→
   reactivate thrash is a CoreAudio failure pattern. Keep the session warm across reconnects.
7. **Metadata via the AzuraCast now-playing API, not the stream.** ICY `StreamTitle` (which the
   native player parsed as `"Artist - Title"`) is **not present in HLS**. Poll AzuraCast's
   `/api/nowplaying/{station}` for title/artist/artwork — the app already does this, so nothing is
   lost by moving to HLS.

---

## Stream selection: HLS primary, Icecast fallback, kill-switch + preroll

- The DB drives the URL: **`content_assets.stream_url` carries the HLS `.m3u8`.** (Already seeded for
  `hls_test`.) The player just plays whatever URL it's handed; `.m3u8` is auto-detected as HLS.
- Keep an **Icecast fallback** behind a remote-config kill-switch (new `live_stream_protocol` /
  per-platform variant in `mobile_app_settings`) — same pattern as the old `ios_use_native_live_player`
  switch, so a bad HLS rollout can be reverted without a build.
- **Preroll gate for the fallback only:** if Icecast fallback is ever active, don't start playback
  until N seconds are buffered (new `cold_start_preroll_seconds`) — this automates the manual
  "pause 10 s" trick instead of relying on the user to discover it. On the HLS path this is unneeded.
- **Latency trade-off (accept it):** HLS sits a few segments behind live (~10–30 s). For radio this
  is imperceptible and is the same trade Apple Music's live stations make.

---

## The remote-config tuning layer — preserve it (non-negotiable)

`public.mobile_app_settings` (v3 Supabase, key/value, anon-readable, admin-written) is the playback
tuning layer and must be wired into the new player **from day one**. Never hardcode a value that
already lives here; new tunables go here too. **Current live values:**

| key | value | role in the RN app |
|---|---|---|
| `android_min_buffer_seconds` | 30 | ExoPlayer minBuffer — **not exposed by expo-audio**; HLS makes it moot. Keep the row. |
| `android_max_buffer_seconds` | 60 | ExoPlayer maxBuffer — same. |
| `android_buffer_for_playback_seconds` | 5 | ExoPlayer playback buffer — same. |
| `android_buffer_for_playback_after_rebuffer_seconds` | 8 | ExoPlayer rebuffer — same. |
| `ios_preferred_forward_buffer_seconds` | 20 | AVPlayer fwd buffer — **not exposed by expo-audio**; HLS makes it moot. Keep the row. |
| `ios_auto_waits_to_minimize_stalling` | true | Must stay **true** (false broke playback). expo-audio default. |
| `ios_use_native_live_player` | true | **Retire** — expo-audio *is* the native AVPlayer path. Replace with `live_stream_protocol` kill-switch. |
| `retry_max_count` | 3 | App-level retry loop on stall/error. **Port this.** |
| `retry_delay_seconds` | 2 | Delay between retries. **Port this.** |
| `reconnect_delay_seconds` | 3 | Delay before auto-reconnect on unexpected stream end. **Port this.** |
| `stream_probe_timeout_seconds` | 3 | HEAD-probe timeout for the diagnostic report. **Port.** |
| `listen_heartbeat_seconds` | 300 | Listen-session heartbeat cadence (analytics — closes killed-mid-listen sessions). **Port.** |
| **NEW** `live_stream_protocol` | — | HLS vs Icecast-fallback kill-switch (add). |
| **NEW** `cold_start_preroll_seconds` | — | Preroll gate for the Icecast fallback (add). |

The app-level tunables (retry/reconnect/heartbeat/probe) **do** carry over directly. The buffer knobs
don't map to expo-audio — that's acceptable on HLS; **keep the rows** (don't delete tuning history)
and revisit only if a real need appears.

---

## Validation protocol (don't burn a week-long store cycle to find out)

1. **Zero builds:** open the HLS `.m3u8` in **iPhone Safari**. Safari uses the same AVPlayer stack —
   if cold-start playback is continuous there, the format fix is confirmed before any app code.
   (Already have the `hls_test` URL.)
2. **Dev build on a real iPhone** (`expo prebuild` + EAS dev client) before submitting — confirm
   in-app HLS is smooth, lock screen works, interruptions/route-changes behave.
3. Only then ship to TestFlight/Play.

---

## Android note

Android **already played fine** on the old stack (it's the control that proved the stream healthy).
ExoPlayer/Media3 has first-class HLS support. The risk surface is iOS; don't over-engineer Android.
