# iOS build handoff — live-HRV (WHOOP) on iPhone

**For a fresh Claude session on the Mac.** Goal: build the THRIVE member app on a **physical iPhone** and verify the live-HRV feature (read R-R intervals from a WHOOP over Bluetooth) now that the wearable is in hand. Branch: **`feat/whoop-hrv`** (both repos).

## What was built (context)
- **Tier 1 — live HRV over BLE** (the thing to test): a toggle on the station's Play-Live button arms HRV; an app-level `LiveHrvProvider` connects to the WHOOP over the standard BLE Heart Rate Service, computes RMSSD on-device, and shows it inline on Now Playing. Verified on Android (APK builds on RN 0.85 New Arch; 22 unit tests pass) — **never run on iOS or against a real WHOOP yet.**
- **Tier 2 — WHOOP cloud trends** (OAuth + daily sync + webhook): backend functions are deployed to Supabase but **not functional** (no WHOOP dev app/secrets, migrations not applied). **Not needed for the iOS build or the live-HRV test — ignore it for now.**
- Full status + risks: [`docs/whoop-hrv-status.md`](whoop-hrv-status.md). Visual reference: `docs/wireframes/screens-thrive-concept.html`.

## 1. Pull
```bash
git fetch origin && git checkout feat/whoop-hrv && git pull
```

## 2. Restore `.env.local` (gitignored — NOT in the repo)
Copy `.env.local` from the Windows machine to the repo root, or recreate it. Without it the app throws on startup (missing Clerk/Supabase keys):
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=https://yotaqkgfpifomudtwgzr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_AZURACAST_BASE_URL=...
```
(`EXPO_PUBLIC_WHOOP_CLIENT_ID` is only for the cloud tier — not needed to test live BLE.)

## 3. Prereqs on the Mac
Node, **Xcode + Command Line Tools**, **CocoaPods**, an Apple developer account (free tier is fine for device builds), and a **physical iPhone** — **BLE does NOT work on the iOS Simulator.**

## 4. Install + prebuild iOS
```bash
npm install
npx expo prebuild -p ios --clean
```
This generates `ios/` and runs `pod install`. The `react-native-ble-plx` config plugin (in `app.json`) auto-injects the iOS Bluetooth usage string (`NSBluetoothAlwaysUsageDescription`) into `Info.plist` — no manual Info.plist edit needed.

## 5. Build & run on a physical iPhone
```bash
npx expo run:ios --device   # pick your connected iPhone
```
- **Signing:** if `run:ios` can't auto-sign, open `ios/thrivememberapp.xcworkspace` in Xcode → select the app target → Signing & Capabilities → set your Team. Bundle id is `com.thriveradio.app`.
- First launch on the iPhone: trust the dev profile (Settings → General → VPN & Device Management).

## 6. iOS-specific watch-outs (the "special" stuff)
- **BLE on iOS New Arch is UNVERIFIED.** We proved `react-native-ble-plx` 3.5.1 builds on Android RN 0.85 New Arch; iOS uses the same library (CoreBluetooth / Obj-C), so it should be fine, but this is the **first iOS build with it** — watch for Fabric/New-Arch link errors during pod install / Xcode build. If pods fail: `cd ios && pod install --repo-update`.
- **Bluetooth permission:** first "Track Live HRV" triggers the OS Bluetooth prompt — allow it.
- Simulator can't do BLE — real iPhone only.

## 7. The on-device HRV test (Gate 1 — the key thing to verify)
1. On the **WHOOP**, enable **Broadcast Heart Rate** (WHOOP app → tap the strap icon → toggle Broadcast Heart Rate). Wear it, stay still.
2. In THRIVE: **Home → "From Your Provider" station card** → station page (NOT the Radio tab — that just plays).
3. Toggle **Track Live HRV** on (teal toggle on the Play Live button). It should connect.
4. Expected: status → Connecting → connected; tap **Play Live** to reach Now Playing where the **live RMSSD numeral + sparkline** render.
5. **CONFIRM THE CORE HYPOTHESIS:** that real **R-R intervals** arrive and RMSSD shows a plausible resting value (~20–80 ms). This is the whole point — it proves WHOOP broadcasts R-R over BLE. If it connects but shows *"turn on Broadcast mode"* / no R-R, the band isn't emitting R-R in broadcast mode → that's the project's biggest risk (see `whoop-hrv-status.md` risk #1) — capture exactly what you see and stop.

## 8. Caveat: DB migrations not applied yet
The `hrv_sessions` table doesn't exist in the DB yet (`supabase db push` needs the DB password and hasn't run). So **"Stop capture & save" will error** until migrations are applied — but the **live readout (connect + RMSSD on screen) works without the DB**, which is all Gate 1 needs. To enable saving later, from the ThriveRadioPortal repo: `supabase db push --linked` (enter DB password).

## 9. Verify (no device)
```bash
npm run test       # 63 tests incl. 22 HRV core
npx tsc --noEmit
```

## Key files
- Engine: `src/hrv/live-hrv-provider.tsx`, `src/hrv/{ble-hr,rmssd,parse-hr}.ts`, `src/stores/hrv-store.ts`
- UI: `src/app/station/[id].tsx` (toggle), `src/app/player.tsx` (inline tracking), `src/components/hrv/*`
- BLE plugin config: `app.json` (`react-native-ble-plx` block)
