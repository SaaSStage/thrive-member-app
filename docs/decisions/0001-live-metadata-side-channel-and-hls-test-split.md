# 0001 — Live now-playing metadata via side-channel; keep the hls_test relay until launch

- **Status:** accepted
- **Date:** 2026-06-17
- **Related:** `docs/AUDIO-PLAYBACK.md` (player = expo-audio, the authoritative audio architecture — that decision lives there, not duplicated here).

## Context

The member app must show "now playing" (track/artist/art) for the live radio. The live chain is:

```
Eversolo DMP-A6 (plays; knows the track) → Barix (hardware Icecast encoder) → AzuraCast thrive_radio
   (mount /YOYRasha1, passthrough) → hls_test (Liquidsoap forward → HLS) → app
```

Investigation this session established hard facts:
- A line-in/hardware audio **encoder carries no track metadata** — the upstream feed sends `StreamTitle=''` (empty). The Barix only moves an audio waveform.
- **HLS carries no ICY metadata at all**, so the app can never read now-playing from the audio stream.
- AzuraCast reports `is_online:false` / "Station Offline" for the relay because it has no recognized "song" — this is independent of the audio, which plays fine.
- The Barix sources **directly** into AzuraCast (no intermediate Icecast); the Eversolo→Barix leg is the encode stage. So **there are no eliminable hops** in the current audio path.
- `thrive_radio` is the **production** station (old app + public listeners) and cannot be reconfigured/taken down now.

## Decision

1. **The app gets now-playing only from AzuraCast's `/api/nowplaying/{shortcode}`** (polled in `src/audio/player.ts`), never from the HLS stream. When there's no real track it falls back to station identity ("THRIVE Radio"). This is implemented.
2. **Real metadata will be delivered via an out-of-band side-channel** (not yet built): read the current track from the Eversolo on the LAN (its Zidoo-based local HTTP API or UPnP AVTransport) and inject it as ICY `StreamTitle` on the `/YOYRasha1` mount via Icecast `/admin/metadata`. Runs as a small always-on bridge on a LAN host — not in the app.
3. **Keep the temporary `thrive_radio → hls_test` split until the new app launches.** Do not touch production `thrive_radio` now. At launch: promote `thrive_radio` to a Liquidsoap backend + HLS, point the app at its HLS, and retire `hls_test` (the dev seed's `stream_url` becomes a one-line change).

## Consequences

- Until the side-channel exists, the app correctly shows station identity (no track/art) — acceptable and normal for a relayed live stream with no source metadata.
- The metadata bridge is **infrastructure** (needs the Eversolo LAN API + Icecast admin creds + a host), tracked separately from app work.
- The hls_test split costs a little latency and is one more metadata-drop point, but is deliberately retained to protect production until cutover.
