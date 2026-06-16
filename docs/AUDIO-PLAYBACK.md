# Audio Playback Architecture — RN/Expo rebuild (evidence-based, HLS-first)

> This is the **architect's analysis**, not a transcription of old workarounds. It re-evaluates every
> fix we made on the Flutter apps against two things that changed: (1) we're moving to **HLS**, and
> (2) we're on **expo-audio / RN 0.85 / SDK 56**. Many of the old tweaks were band-aids for a problem
> HLS deletes; a few were real root-cause fixes that stand. Each is graded below with the evidence.
>
> Lives in the **ThriveRadio** repo. Copy into `thrive-member-app` when wanted — not auto-synced.
> Sources are cited inline and listed at the end. Verify against the linked docs before relying on a claim.

---

## The one-paragraph reframe

The two-month stutter saga was a **stream-format** problem: a bare player fed an **endless progressive
Icecast** stream starves its buffer. The dozens of buffer tweaks (iOS *and* Android) were attempts to
compensate for that, by trial and error, and most never really worked. **HLS removes the root cause on
both platforms** because AVPlayer (iOS) and ExoPlayer/Media3 (Android) are *reference HLS clients that
self-manage buffering and live-edge latency by default.* So the correct v1 architecture is **HLS +
each engine's defaults + measure**, adding tuning only where a measured problem demands it — **not**
porting the old numbers as if they were laws. The DB tuning *pattern* survives; most of the specific
buffer keys become vestigial.

---

## 1. Player library & versions (decided, evidence-backed)

**Use `expo-audio`. Not react-native-track-player. Don't downgrade RN.**

- Expo SDK 56 pins **RN 0.85**. You can't downgrade RN without dropping the whole SDK (54/53) — that
  discards the foundation the rebuild exists for. Keep 0.85.
- **RNTP is structurally dead on this stack.** New Architecture is the **default since RN 0.76 and the
  old architecture is removed as of 0.82** — there's no opt-out path forward. RNTP has open issues for
  exactly this: TurboModule interop rejects it (`TurboModuleInteropUtils ParsingException`, unsupported
  return type `kotlinx.coroutines.Job`). 4.1.2 doesn't compile on 0.85; the only forward build is a
  `5.0.0-alpha0` nightly. The build session confirmed the runtime crash: *"returnType == void iff the
  method is synchronous."* We also can't disable New Arch (Reanimated 4 + react-native-mmkv need it).
- **expo-audio** is first-party, New-Arch-native, and uses the same engines that carry the HLS argument:
  AVPlayer / ExoPlayer-Media3. Keep it behind one `src/audio/player` module so a future stable RNTP (or
  a native shim) is a contained swap.

---

## 2. ⚠️ The #1 risk to de-risk FIRST: does expo-audio actually play our HLS audio?

This gates the entire plan and must be tested **before** any player architecture is built.

- expo-audio's docs **do not explicitly list `.m3u8`/HLS** as a supported source (they defer to the
  platform format docs). It *does* expose live-stream affordances — `currentOffsetFromLive`,
  `isLiveStream: true` for lock screen — which implies live support, but "implies" isn't "confirmed."
- The Expo ecosystem has a **documented history of HLS *audio-only* failures, especially on Android**:
  `expo/expo#1187` ("mSimpleExoPlayer is null" playing HLS audio), m3u8 restart bugs (`#16458`), and
  third-party reports of HLS radio "stops after ~1 minute." Audio-only HLS (no video track) is a known
  rough edge.

**Action:** Day 1, in a **dev build** (not Expo Go), point `expo-audio` at
`https://azuracast-radio-u62352.vm.elestio.app/hls/hls_test/live.m3u8` and confirm it (a) plays, (b)
keeps playing past 2–3 minutes, (c) survives backgrounding on **both** iOS and Android. Only after this
passes do you build the player layer.

**If expo-audio can't play the HLS audio reliably, contingencies (in order):**
1. Serve the HLS with a tiny/black video track and use **expo-video** (HLS is its home turf) — but
   verify its background/lock-screen behavior (`expo/expo#34170`, `#33930` are open there).
2. Thin native module wrapping AVPlayer / Media3 `HlsMediaSource` directly (most control, most work).
3. Re-check RNTP 5.0 stability later.
Decide this with data from the Day-1 test, not now.

---

## 3. Re-evaluation matrix — every old workaround, graded against HLS + expo-audio

| Old fix (Flutter era) | Why it existed | Verdict | Basis |
|---|---|---|---|
| iOS `preferredForwardBufferDuration` tuning (0/5/15/20) | fight Icecast stutter | **OBSOLETE** | Never worked even live-set to 0; AVPlayer self-manages HLS buffering. Only takes effect if `automaticallyWaits=false`, which *broke* playback. expo-audio exposes it — **leave it default.** |
| iOS `automaticallyWaitsToMinimizeStalling = true` | `false` → silent after 3 s | **KEEP (do nothing)** | True is the AVPlayer default and correct for HLS auto-buffering. |
| iOS: **no** `DarwinLoadControl` (let AVPlayer defaults) | match Safari | **VALIDATED** | This is exactly the right HLS posture. |
| iOS `AudioSession.music()`, **not** `allowBluetooth` | `allowBluetooth` enabled HFP/voice route → iOS treated it like a call → stutter | **STILL VALID** | Independent of stream format. In expo-audio: `setAudioModeAsync({ interruptionMode: 'doNotMix', playsInSilentMode: true, shouldPlayInBackground: true })` — playback routing, never voice/communication mode. (`doNotMix` is also **required** for lock-screen controls to bind.) |
| iOS native `LiveRadioPlayer.m` + `ios_use_native_live_player` kill-switch | bypass suspected just_audio_background bug | **OBSOLETE / RETIRE** | expo-audio *is* the native AVPlayer path; HLS is the real fix. Drop the native player and the kill-switch; replace with a `live_stream_protocol` switch. |
| Android `AndroidLoadControl` 30/60/5/8 | trial-and-error vs ExoPlayer rebuffering on **progressive Icecast** | **RE-EVALUATE — do NOT pre-port** | ExoPlayer "plays most adaptive live streams out-of-the-box without any special configuration" and **self-heals** (slows playback to back off the live edge on rebuffer). The numbers were a buffer-sizing band-aid on the wrong stream type; the HLS lever is `LiveConfiguration` (below), which the old code never used. Start with defaults; expo-audio exposes neither LoadControl nor LiveConfiguration, so you're on ExoPlayer defaults unless you add a native plugin. |
| Android foreground service + WAKE_LOCK + notification channel + `androidNotificationOngoing`/`StopForegroundOnPause` | background playback | **STILL REQUIRED — but built into expo-audio** | expo-audio **declares its own `AudioControlsService` foreground service** and manages the media notification. Don't hand-roll it. Ensure the config plugin (`enableBackgroundPlayback: true`) + `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` perms. |
| App-level retry / reconnect loop (`retry_max_count`, `retry_delay`, `reconnect_delay`) | recover progressive-stream drops | **KEEP, but LIGHTER** | HLS recovers at the segment/playlist layer (and ExoPlayer self-heals via speed), so aggressive reconnect matters far less. Keep a light reconnect on hard failure; don't rebuild the old state machine. |
| Listen-session heartbeat (`listen_heartbeat_seconds`) | analytics (close killed-mid-listen sessions) | **KEEP** | Format-independent. Port as-is. |
| Stream HEAD probe (`stream_probe_timeout_seconds`) | diagnostics report | **KEEP** | Format-independent. Port. |
| Metadata via AzuraCast now-playing API (not ICY) | ICY not carried by HLS | **KEEP (was always the plan)** | Poll AzuraCast `/api/nowplaying/{station}` → `player.updateLockScreenMetadata({title, artist, artworkUrl})`. |

---

## 4. iOS — the v1 posture (HLS)

Let AVPlayer do its job. Configure audio mode and metadata; **add no buffering overrides.**
- `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`.
- `app.json`: `["expo-audio", { "enableBackgroundPlayback": true }]` + iOS `UIBackgroundModes: ["audio"]`.
- Lock screen: `player.setActiveForLockScreen(true, { title, artist, artworkUrl }, { isLiveStream: true })`
  then `player.updateLockScreenMetadata(...)` from the AzuraCast poll. `isLiveStream: true` hides the
  scrubber/duration — correct for live radio.
- Interruptions/route changes: expo-audio surfaces interruption events; on headphone-unplug, **pause,
  don't auto-resume** (the one behavior to keep from the native player).

## 5. Android — the v1 posture (HLS)

Rely on ExoPlayer's built-in live handling. **Do not pre-configure LoadControl.**
- ExoPlayer auto-detects live and maintains a target live offset, **adjusting playback speed** to stay
  near it and to recover from rebuffers (self-healing) — this is what the old manual buffer tuning was
  badly approximating.
- The real live lever, *if* you need it, is `LiveConfiguration` (`targetOffsetMs`, `maxPlaybackSpeed`
  ~1.02) per-MediaItem — **orthogonal** to buffer sizes. Reach for it only on measured live-latency or
  rebuffer problems, and only via a native/config-plugin path (expo-audio doesn't expose it).
- Foreground service + media notification are provided by expo-audio's `AudioControlsService`. Keep the
  manifest perms; don't reimplement the service.

## 6. The DB tuning layer (`mobile_app_settings`) — keep the pattern, prune the band-aids

The startup-load pattern (3 s timeout → defaults fallback → no runtime refresh) is good; **port it.**
But most buffer-second keys are now **vestigial** because the engines self-manage HLS:
- **Keep & port:** `retry_*` / `reconnect_delay_seconds` (lighter), `listen_heartbeat_seconds`,
  `stream_probe_timeout_seconds`.
- **Add:** `live_stream_protocol` (HLS vs Icecast-fallback kill-switch), `cold_start_preroll_seconds`
  (fallback path only).
- **Mark vestigial (keep rows, don't wire unless a measured problem appears):** `android_*_buffer_*`,
  `ios_preferred_forward_buffer_seconds`, `ios_auto_waits_to_minimize_stalling`. **Retire:**
  `ios_use_native_live_player`.
- New tunables we *might* add if measurement demands: `android_live_target_offset_seconds`,
  `android_max_playback_speed` (ExoPlayer `LiveConfiguration`).

Principle going forward: **measure first (`currentOffsetFromLive`, rebuffer counts), tune second, in
the DB — never tweak blindly in code.** That's the discipline that was missing the first time.

## 7. Validation protocol (don't burn build cycles)
1. **Zero builds:** HLS `.m3u8` in **iPhone Safari** → confirms the format fix (same AVPlayer stack).
2. **Day-1 dev build:** expo-audio plays the `hls_test` m3u8, past 3 min, survives backgrounding, on
   **iOS and Android** (the §2 risk gate).
3. **Then** build the player; tune only against measured rebuffering/latency.

---

## Sources
- expo-audio API — https://docs.expo.dev/versions/latest/sdk/audio/
- ExoPlayer/Media3 live streaming (self-manages; LiveConfiguration vs LoadControl) — https://developer.android.com/media/media3/exoplayer/live-streaming
- RNTP New-Arch/TurboModule incompatibility — https://github.com/doublesymmetry/react-native-track-player/issues/2489 , /issues/2511 , /issues/2414
- RN New Arch default since 0.76 / old arch removed 0.82 — https://www.agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration
- expo HLS audio-only issues (Android) — https://github.com/expo/expo/issues/1187 , https://github.com/expo/expo/issues/16458
- AVPlayer `preferredForwardBufferDuration` requires `automaticallyWaits=false` — https://developer.apple.com/forums/thread/63435
- expo-audio lock screen / background (PR + docs) — https://github.com/expo/expo/pull/40919
