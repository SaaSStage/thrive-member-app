# Thrive Member App — Wireframes

Low-to-mid fidelity wireframes for the **Apple Music-style React Native rebuild**, derived from
[`docs/specs/thrive-music-rn-app.md`](../specs/thrive-music-rn-app.md). iPhone frame, dark theme
(light theme follows the same layout). These are layout/flow studies, not final visual design.

- **Source:** [`screens.html`](screens.html) — all screens, editable in any browser
- **Renderer:** [`render.js`](render.js) — Puppeteer script that exports each frame to `png/`
- **Images:** [`png/`](png/) — one PNG per screen + `00_contact-sheet.png` (all screens on one canvas)

## Re-render after editing `screens.html`

```bash
cd docs/wireframes
NODE_PATH="C:/tmp/econtract-sample/node_modules" node render.js
```

## Screens

| # | Screen | Maps to spec |
|---|--------|--------------|
| 01 | Welcome | `(auth)/welcome` — provider-provisioned access |
| 02 | Sign in (email code) | `(auth)/sign-in` — Clerk email-code + device trust |
| 03 | Profile setup | `profile-setup/` — one-time health-context wizard |
| 04 | Home | `(tabs)/home` — Vitality + voice cards, recently played, provider content |
| 05 | Radio | `(tabs)/radio` — granted live stations (incl. a locked/entitlement-gated example) |
| 06 | Library | `(tabs)/library` — granted playlists + on-demand collections |
| 07 | Search | `(tabs)/search` — scoped to authorized content |
| 08 | Station page | `station/[id]` — hero, Play Live, description, on-demand episodes |
| 09 | Playlist page | `playlist/[id]` — Apple Music album-style track list |
| 10 | Now Playing | `player.tsx` — blurred-artwork full player, LIVE state, AirPlay/share/favorite |
| 11 | Voice intro | `voice/` — 3-recording session overview + quota |
| 12 | Mic test | `voice/` — mic + noise check before first recording |
| 13 | Recording | `voice/` — sustained "ahh" with ring timer + live waveform |
| 14 | Review & re-record | `voice/` — per-recording pass / warn / fail + selective re-record |
| 15 | Submitting & success | `voice/` — signed-URL upload progress + analysis-pending state |
| 16 | My Score | `score/` — Vitality Score + 4 sub-scores with info popovers |
| 17 | Settings & Profile | health details, language, quota, stream quality, diagnostic report, sign out |

## Alternate theme — "Healing Frequency"

A second visual direction tuned to the frequency/sound-healing concept, **without touching the
original** above. Same layouts, re-skinned.

- **Source:** [`screens-frequency.html`](screens-frequency.html)
- **Renderer:** [`render-frequency.js`](render-frequency.js) → outputs to [`png-frequency/`](png-frequency/)
- **Palette:** deep-indigo night sky + aurora gradients (teal → indigo → violet → rose) and a warm
  gold accent — meditative, cosmic, spa-like instead of Apple Music pink.
- **Graphics:** concentric **frequency-ripple** rings + sine **waveforms** as the signature motif;
  soft glows and glassmorphic cards.
- **Fonts:** **Fraunces** (soft serif) for titles/numbers + **Nunito** (rounded sans) for UI.
- **Concept tie-in:** content reframed as **solfeggio frequencies** (396/432/528/639/741/963 Hz),
  the "Radio" tab becomes **Frequencies**, and the score state reads "Resonant".
- **Screens shown (representative set):** Welcome, Home, Frequencies, Library, Frequency page,
  Now Playing, Voice intro, Recording, My Score.

```bash
cd docs/wireframes
NODE_PATH="C:/tmp/econtract-sample/node_modules" node render-frequency.js
```

## Notes / decisions reflected

- **Apple Music UX mapping** from the spec: 4-tab bar (Home/Radio/Library/Search), persistent
  mini-player above the tab bar, full-screen Now Playing modal, station-as-album track lists.
- **Entitlement gating** is shown as *locked rows* (Radio screen) — one of the spec's open
  questions (hidden vs. locked). Swap to hidden if that decision lands the other way.
- **LIVE** treatment on live streams: badge + live dot, no scrubber end time in the player.
- **Voice flow** mirrors the v3 port: mic test → guided 3 recordings → on-device validation
  (pass/warn/fail) → selective re-record → signed-URL upload → analysis-pending → score.
- Artwork is placeholder gradients; real artwork comes from AzuraCast / content assets.
