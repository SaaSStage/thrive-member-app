# 0002 — Adopt the sacred-geometry "mandala" visual language

- **Status:** accepted
- **Date:** 2026-06-19
- **Related:** `docs/wireframes/screens-thrive-concept.html` (aesthetic source of truth),
  `src/constants/theme.ts` (the single re-skin point).

## Context

The app shipped with an Apple-Music-style flat dark theme. Over a long design session we explored
several directions (chrome surfaces, brand purple/gold, wellness teal/mint, a "healing frequency"
aurora) and — via the HTML wireframes now in `docs/wireframes/` — converged on a sacred-geometry
**"mandala"** concept the user signed off on. THRIVE is a health/wellness + frequency-listening app,
so the sound/geometry motif is the brand differentiator.

## Decision

The app's visual language is:
- **Deep-plum aurora background** (`<Aura>`, SVG radial gradients) over **dark glass cards**
  (translucent white + hairline border; no real blur needed).
- A signature **`<Mandala>`** component (react-native-svg rosette: N circles on a ring + framing
  circles + glowing core), re-colorable via gradient stops, with **Gaussian-blur glow** and motion:
  `breathe` for focal score/timer dials, `rotate` (ghosted, top-right corner) behind cards. Focal
  dials + the entry emblem use **breath-coupled blur** (fuzzy when contracted → sharp when expanded)
  done as an **opacity cross-fade** of a sharp + a fuzzy layer (see
  [[react-native-svg-dynamic-blur-crossfade]]).
- **Fonts:** Sora (display) + Inter (body), loaded in `_layout`.
- **Color roles fixed by meaning:** gold = Vitality/score, teal = Voice; content tiles draw from a
  **teal-free `ContentHues`** palette so they never clash with those fixed roles.
- **`src/constants/theme.ts` is the single re-skin point** — raw palette → semantic roles; screens
  consume roles only, never raw hex.
- New deps: `react-native-svg`, `expo-linear-gradient`, `@expo-google-fonts/{sora,inter}`.

## Consequences

- Every screen inherits the look through semantic roles; future re-skins are one file.
- Adds native modules → requires a dev-client rebuild (svg + linear-gradient).
- **Entry screen** = the "YOY" / *You Only Younger* lockup: two custom vector `Y` glyphs flanking the
  THRIVE RADIO logo-as-"O", over a breathing gold mandala. The logo's white background was knocked out
  → `assets/images/logo-cut2.png`.
- Wireframes retained in `docs/wireframes/` as the design record.
- Still on inherited theme only (no bespoke mandala yet) at time of writing: Now Playing,
  Frequencies/Radio + station, Library, Search.
