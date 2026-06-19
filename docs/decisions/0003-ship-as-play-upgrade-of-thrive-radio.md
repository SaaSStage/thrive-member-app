# 0003 — Ship the new app as a Play upgrade of the existing Thrive Radio (same package + key)

- **Status:** accepted
- **Date:** 2026-06-19
- **Related:** `docs/lessons/expo-cng-release-signing.md`

## Context

"Thrive Radio" is already published on Google Play as **`com.thriveradio.app`** (the old Flutter app,
`Radio-App-2.2.2`, versionCode 24). This Expo rebuild should reach existing users as an **update to
that same listing**, not a separate new app.

## Decision

Distribute as an in-place upgrade:
- **Same `applicationId`: `com.thriveradio.app`** — the Expo app already uses it (no change).
- **Sign with the existing production key** `thrive-radio` (SHA-1
  `89:CC:4D:FD:B9:A4:BF:D5:67:80:16:4F:C9:B6:CD:B8:39:85:6A:12`), copied into `credentials/`
  (gitignored) so the project is self-contained and the old project can be archived.
- **`versionCode` must exceed 24** → set to **25**, versionName **2.6.0** (in `app.json` and
  build.gradle).
- **Upload an AAB** (`./gradlew bundleRelease`) to Play, not an APK — Play requires an App Bundle
  unless the app predates Aug 2021.

## Consequences

- Android accepts it as an upgrade (data preserved, no uninstall) **iff** package + signing key match
  and versionCode > installed. The built artifact's signature was verified to match the production
  cert before handing it off.
- **Play "advertising ID" gotcha:** the listing's Advertising-ID declaration was set to "Yes"
  (inherited from the old Flutter app's bundled SDKs); the new Expo bundle omits the `AD_ID`
  permission → upload throws an error. **Fix is a console setting, not code:** set the Play Console
  Advertising-ID declaration to **"No"** (the app doesn't use an advertising ID).
- Modern RN minSdk drops support for ~41 very old devices the Flutter app supported (accepted).
- Universal artifact is large (~86 MB AAB / 122 MB APK). Per-ABI splits / R8 are deferred size
  optimizations. No deobfuscation mapping (R8 disabled) — fine, crashes stay readable.
- The keystore is the single irreplaceable asset; keep a secure backup outside the repo.
