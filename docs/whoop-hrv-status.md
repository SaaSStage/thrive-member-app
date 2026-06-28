# WHOOP / HRV integration — build status & handoff

Branch: **`feat/whoop-hrv`** (this repo) + **`feat/whoop-hrv`** in **ThriveRadioPortal** (backend).
Rip-out = delete both branches. Spec: `~/.claude/plans/alright-i-want-you-synchronous-wilkinson.md`. UX: `docs/wireframes/screens-thrive-concept.html`.

Two independent tiers sharing the WHOOP wearable:
- **Tier 1 — live HRV over Bluetooth** (no cloud API). Standard Heart Rate Service `0x180D`/`0x2A37`; app computes RMSSD on-device.
- **Tier 2 — daily recovery/HRV trends** (WHOOP cloud OAuth + REST, foreground sync). Tokens server-side only.

## What's verified ✅
- **Core math + parser** — `src/hrv/rmssd.ts`, `src/hrv/parse-hr.ts`: 22 jest tests pass.
- **BLE library builds on RN 0.85 New Arch** — `react-native-ble-plx` 3.5.1 + the Expo plugin; `expo prebuild` + a full Android **debug APK build succeeded** (this was the single biggest risk — retired). Manifest gets `BLUETOOTH_SCAN` with `neverForLocation` (no Android location prompt).
- **Type-check + lint clean** — `tsc --noEmit` green; no new lint errors (two pre-existing issues in `use-color-scheme.web.ts` / `validator.test.ts` are unrelated).
- **Full suite** — 63/63 jest tests pass.

## What is NOT yet verified (needs hardware / credentials / deploy) ⚠️
1. **On-device BLE spike (Tier 1 gate).** Emulators can't do BLE. On a physical device with a real **WHOOP in Broadcast mode**, confirm: scan→connect, `0x2A37` flag bit-4 (R-R present) is set, and parsed R-R look physiological (~700–1100 ms at rest). If R-R is absent in Broadcast mode, the live tier is infeasible on the provided band — escalate. Also learn whether Broadcast mode persists across charge/sync (shapes the connect-sheet copy).
2. **WHOOP developer app + redirect.** Create the WHOOP OAuth app; set `EXPO_PUBLIC_WHOOP_CLIENT_ID` in `.env.local`; register redirect `thrivememberapp://whoop-callback`. **Verify WHOOP accepts a custom-scheme redirect**; if https-only, add a bounce page.
3. **Backend deploy (Tier 2).** In ThriveRadioPortal: `npm run db:push` (migrations 0062–0066), set `WHOOP_CLIENT_ID`/`WHOOP_CLIENT_SECRET` in Supabase function secrets, `supabase functions deploy whoop-link whoop-sync whoop-unlink`.
4. **~39 WHOOP API field/endpoint confirmations.** Marked "confirm against developer.whoop.com" in `_shared/whoop.ts` and `whoop-sync/index.ts` (token path, v1-vs-v2 base, pagination keys, recovery/sleep/cycle/workout + body-measurement field names). The `raw` jsonb columns hedge schema drift.

### Data capture (full)
- `hrv_sessions` now also stores **raw R-R intervals + per-tick RMSSD/bpm series** (jsonb) — the complete record for recomputing any HRV metric later. Excluded from list reads.
- `whoop_body` (migration 0066) stores **dated height/weight/max-HR snapshots** → weight time-series (steps when the member updates weight in WHOOP; no scale).
- WHOOP **profile** intentionally NOT pulled (name/email already from Clerk). App-only WHOOP metrics (stress, WHOOP Age, hormonal) and continuous intraday HR are not exposed by the API at all.
5. **Dev 10-user cap.** WHOOP apps are capped at ~10 connected members until app-approval (Typeform; needs working OAuth + privacy-policy URL). Gate "Connect WHOOP" behind a flag for the dark launch.
6. **iOS build** not run here (needs a Mac). Android is the verified target.

## How to exercise it
- Tier 1 (device): build & install (`npm run android` on a physical device), open a station → toggle **Track Live HRV** on the Play Live button → Play → Now Playing should connect and show the live readout → **Stop capture & save** → summary; a `hrv_sessions` row appears.
- Tier 2: Account → WHOOP → Connect (OAuth) → Sync now → `whoop_daily`/`whoop_workouts` rows; trends render.

## Key files
- Engine: `src/hrv/{rmssd,parse-hr,ble-hr,use-live-hrv}.ts`, `src/stores/hrv-store.ts`
- UI: `src/app/{player,station/[id],hrv-summary,whoop}.tsx`, `src/components/hrv/*`, `src/components/mini-player.tsx`
- Tier 2: `src/whoop/*`, `src/api/whoop.ts`, `src/stores/whoop-store.ts`
- Backend (portal): `supabase/migrations/0062–0065`, `supabase/functions/whoop-*`, `_shared/whoop.ts`

## BLE data landscape — what the band actually exposes (verified on a real WHOOP 5)

Verified 2026-06-28 on **WHOOP 5 "WHOOP 5B01246771" (fw ~r52)** via `src/hrv/ble-diagnostic.ts`
(writes the full channel dump to Supabase `user_reports.playback_stats`, `player_state='ble-diagnostic'`)
plus an open-source reverse-engineering survey. **Corrects the earlier "R-R is all you get over BLE."**

GATT map seen on the band: `0x180D`→`0x2A37` (HR+R-R), `0x180A` device info, `0x180F`→`0x2A19` battery,
and a **proprietary service `fd4b0001-cce1-4033-93ce-002d5875f58a`** (`fd4b0002` write/command;
`fd4b0003/4/5/7` notify). WHOOP 4.0 used `61080001`/`61080002…` instead.

Three access tiers:

1. **Broadcast-HR — what we use, NO bonding.** Member enables **"Broadcast Heart Rate"** in the WHOOP
   app → `0x2A37` streams **HR + R-R** read-only, *while the band stays bonded to the member's WHOOP
   app*. No conflict. The `fd4b` channels show 0 packets here (they need a command handshake). Captures:
   R-R 828–913 ms at rest; first R-R ~2.5 s–40 s after connect.
2. **Proprietary `fd4b` handshake — needs an EXCLUSIVE BLE bond.** Write an `AA…`+CRC frame to
   `fd4b0002`, then read the notify chars. Unlocks (confirmed in code by whoop-vault, r52): live
   **skin temperature, motion/activity, battery+charge, device events (wrist/charge/double-tap/boot/
   alarms), a ~14-day per-second on-device history buffer (HR/temp/motion/activity)**, and **control
   commands — set alarms, FIRE HAPTICS (`RUN_HAPTICS_PATTERN`), reboot**. ⚠️ The bond is **exclusive**:
   the band must be unpaired from the member's WHOOP app first, which breaks their WHOOP use — so this
   route generally isn't viable for members who also use WHOOP. Haptics/commands live ONLY here.
3. **NOT on BLE → cloud API only.** SpO2, raw PPG/optical, raw IMU accel+gyro, per-second HRV,
   respiratory rate, and all **scores (recovery/strain/sleep)** are server-side. Use the WHOOP cloud
   OAuth API (Tier 2) for those.

Reverse-engineering references (WHOOP DMCAs these — they disappear):
[Sophonbot0/whoop-vault](https://github.com/Sophonbot0/whoop-vault) (WHOOP 5/r52, Python, exact match
to our `fd4b` map — the protocol reference), [madhursatija/whoof](https://github.com/madhursatija/whoof)
(Gen4+5, Rust+Swift/CoreBluetooth — closest to our iOS stack),
[christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader) (Gen4),
[bWanShiTong RE writeup](https://github.com/bWanShiTong/reverse-engineering-whoop-post) (Gen4 protocol).
Cloud clients: [felixnext/whoopy](https://github.com/felixnext/whoopy) (official v2),
[jjur/whoop-data](https://github.com/jjur/whoop-sleep-HR-data-api) (unofficial private API; ToS risk).
