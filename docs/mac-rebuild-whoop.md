# Mac rebuild handoff — WHOOP + Session Response (2026-06-30)

**For the Claude session on the Mac.** You've **already built this app and deployed it to the
iPhone once** from this Mac (branch `feat/whoop-hrv`). This is an **incremental rebuild** to pick up
the latest work. Bundle id `com.thriveradio.app`, scheme `thrivememberapp`.

> Supersedes `docs/ios-build-handoff.md`, which is now stale (it says the WHOOP cloud tier is
> "not functional — ignore it," that the client ID isn't needed, and that DB migrations aren't
> applied — all of that is outdated; the cloud tier is live and verified).

## What changed since your last build (all **JS-only** — no native changes)
- The post-session screen is now the **Session Response card** (ΔHRV vs. settled baseline, HR settle,
  time-to-calm, RMSSD curve with baseline). Spec: `docs/specs/session-response-insight.md`.
- WHOOP **cloud tier is live + verified** (OAuth link, pull sync, and webhook push all confirmed
  against a real account). Link status fixed (was always showing "Not connected"); weight shows in
  **lb**; a new `whoop-callback` route fixes the OAuth "Unmatched Route" 404.
- Backend (Supabase edge functions + migrations incl. `hrv_sessions`) is **already deployed to prod**
  — nothing to deploy from here.

## 1. Pull
```bash
git fetch origin && git checkout feat/whoop-hrv && git pull
```

## 2. `.env.local` — add the one new key
Your Mac `.env.local` already exists and predates the WHOOP feature, so it's just **missing one line**.
Verify these `EXPO_PUBLIC_*` keys are present, and **add the WHOOP one if absent**:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...        # (already have)
EXPO_PUBLIC_SUPABASE_URL=https://yotaqkgfpifomudtwgzr.supabase.co   # (already have)
EXPO_PUBLIC_SUPABASE_ANON_KEY=...            # (already have)
EXPO_PUBLIC_AZURACAST_BASE_URL=...           # (already have)
EXPO_PUBLIC_WHOOP_CLIENT_ID=adc186e0-1187-43dd-9d4a-279d6625f5ab   # <-- ADD THIS
```
**Why the app needs it:** the app builds the WHOOP OAuth authorize URL on-device, and that URL must
include `client_id` ([`src/whoop/oauth.ts`](../src/whoop/oauth.ts)). Without it, tapping "Connect
WHOOP" throws `EXPO_PUBLIC_WHOOP_CLIENT_ID is not set` before anything reaches the server. It is
**not a secret** (it's public by design — the `EXPO_PUBLIC_` prefix bakes it into the bundle); the
secret half lives only in Supabase. Quick check:
```bash
grep EXPO_PUBLIC_WHOOP_CLIENT_ID .env.local || echo "MISSING — add it"
```

## 3. Build
This pull added **no native modules or config** (the `react-native-ble-plx` plugin and the
`thrivememberapp` scheme were already in your last build), so you do **not** need a fresh prebuild:
```bash
npm install            # picks up any JS dep changes
npx expo run:ios --device   # pick your connected iPhone; rebuilds + installs
```
- If `npm install` reports native dep changes, or you're unsure your `ios/` is current, do a clean
  regen instead: `npx expo prebuild -p ios --clean` (runs `pod install`), then `npx expo run:ios --device`.
- **No version bump needed** for a device/dev build (`buildNumber` only matters for TestFlight/App
  Store). It's currently `9` in `app.json`.
- Signing: if auto-sign fails, open `ios/thrivememberapp.xcworkspace` in Xcode → target → Signing &
  Capabilities → set your Team.

## 4. Test on the iPhone

### A. WHOOP cloud (now live)
1. Avatar (top-right) → **Account → WHOOP**.
2. Under **Wearable**, tap **Connect WHOOP** → Safari opens to WHOOP → sign in + approve.
3. It returns to the app showing **Connected · synced …** plus **Recovery score** and **HRV** charts
   (and weight in **lb**). The OAuth redirect (`thrivememberapp://whoop-callback`) is registered with
   WHOOP and handled by the new route.

### B. Live BLE HRV — the Session Response card (the new thing, **real device only**)
1. On the **WHOOP app**: tap the strap icon → enable **Broadcast Heart Rate**. Wear the band, stay still.
2. In THRIVE: **Account → WHOOP → "Connect your WHOOP band"** (the *Live HRV · Bluetooth* card). Allow
   the iOS Bluetooth prompt on first use. This gates HRV on app-wide.
3. Go to a station's **Now Playing**; the live-HRV control is the **pulse icon** in the transport
   (left of play/pause). Tap to arm a capture; hold still **≥ 3 minutes**, then tap again to stop.
4. **Expected:** the **Session Response card** — your real ΔHRV vs. baseline, the RMSSD curve, HR
   settle, and a takeaway. Saving to `hrv_sessions` now works (migration is applied), so it persists.
   - A capture under 3 min shows the "too short to read a clear response" state by design.

## 5. Watch-outs
- **BLE is real-device only** — never the iOS Simulator.
- This is the **first iOS build to actually exercise the WHOOP band over BLE on New Arch** (it was
  verified on Android). If pods fail during build: `cd ios && pod install --repo-update`.
- If the WHOOP login page loads but the return lands on a blank/404, confirm the scheme
  `thrivememberapp` is in the built app (it's in `app.json`; a clean prebuild guarantees it).

## 6. Verify without a device
```bash
npm test           # jest (HRV core tests)
npx tsc --noEmit
```

## Key files (this round)
- `src/app/hrv-summary.tsx` (Session Response card), `src/hrv/session-response.ts` (metrics),
  `src/components/hrv/sparkline.tsx` (baseline line)
- `src/app/whoop.tsx` + `src/app/whoop-callback.tsx` + `src/api/whoop.ts` (cloud connect/display)
- Dataset reference for the portal side: `ThriveRadioPortal/docs/whoop-dataset.md`
