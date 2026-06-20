# Handoff — 2026-06-19

## What we did
Re-skinned the THRIVE member app with the **sacred-geometry "mandala" visual concept** and produced a
**Google Play upgrade** build of the existing `com.thriveradio.app`.

- New design language (ADR 0002): `<Aura>` plum background, dark glass cards, `<Mandala>` (svg rosette
  + glow + breathe/rotate), Sora + Inter fonts, `theme.ts` as the single re-skin point. Committed as
  **`7d92a1f`** on `feat/voice-flow` (pushed to origin).
- Screens reskinned + verified on the Android emulator: **entry (YOY "Thrive Radio")**, **Home**,
  **My Vitality**, plus voice flow (sleek vector mic, recording dial) and profile (Aura). Entry +
  dials use **breath-coupled blur** (fuzzy→sharp via opacity cross-fade): ~4.5s on entry, ~5.6s on
  dials; gold=Vitality, teal=Voice, content tiles use a teal-free `ContentHues` palette.
- Built signed release artifacts (ADR 0003): APK + **AAB**, signed with the production `thrive-radio`
  key, **versionCode 25 / versionName 2.6.0**. AAB at
  `android/app/build/outputs/bundle/release/app-release.aab`.

## State
- Branch `feat/voice-flow`; last commit `7d92a1f` (the re-skin) is pushed.
- **Uncommitted since:** `app.json` version bump (2.6.0 / versionCode 25). `android/` is gitignored
  (CNG, not committed). `credentials/` (keystore + `key.properties`) is gitignored — keep a backup.
- AAB was uploaded to Play **Internal testing**; it triggered the **Advertising-ID declaration error**
  (declaration says "uses ad ID", new bundle omits `AD_ID`). The 3 warnings (dropped devices / size /
  no deobfuscation file) are non-blocking.

## Next step
1. **Play Console:** set **Advertising ID declaration → "No"** (Policy → App content → Advertising ID),
   then finish the Internal testing rollout. (See ADR 0003.)
2. Optionally **commit the `app.json` version bump** (2.6.0 / 25) so the repo matches what shipped.
3. Skin the **remaining screens** still on inherited theme only: Now Playing, Frequencies/Radio tab +
   station detail, Library, Search.
4. iOS not built/verified (needs a Mac); the concept is cross-platform (svg/gradient/fonts).

## Watch out
- **Emulator dev-client wedges** after many rapid force-stop/reload cycles (stuck on splash or black;
  app process alive, no JS error). Recovery: **cold-boot the emulator** + clean `expo run:android`.
  Relaunch via the dev-client deep link
  `thrivememberapp://expo-development-client/?url=http://localhost:8081` + `adb reverse tcp:8081 tcp:8081`
  — not `monkey` (stale 10.0.2.2 URL). adb taps onto animated cards are flaky — verify by rendering,
  not tapping. (Extends memory `metro-emulator-dev-server-recovery`.)
- After any `expo prebuild --clean`, **re-apply the release signingConfig** in
  `android/app/build.gradle` — `android/` is regenerated. See `docs/lessons/expo-cng-release-signing.md`.
- There is an uncommitted **git stash** (`frequency-theme exploration`) — superseded by the mandala
  concept; safe to drop.
