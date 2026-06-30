# Spec — Session Response Insight (live-HRV → frequency)

- **Status:** Draft / proposed
- **Date:** 2026-06-29
- **Area:** member app (live BLE HRV tier) + a server-side cross-session aggregate
- **Related:** `hrv_sessions` (canonical migration `ThriveRadioPortal/supabase/migrations/0062_hrv_sessions.sql`), `src/stores/hrv-store.ts`, `src/api/hrv.ts`, `src/app/hrv-summary.tsx`, `docs/whoop-hrv-status.md`, portal `docs/whoop-dataset.md`

---

## 1. Problem / motivation

THRIVE uniquely captures a **physiological signal** (live HRV over BLE) bound to an
**intervention** (the station/frequency a member listened to) — `hrv_sessions.content_asset_id`.
Today a finished session shows a one-off summary (`hrv-summary.tsx`) but we don't turn it
into a durable, honest insight: *"this frequency moved your nervous system this much, this
way"* — nor do we aggregate across sessions into *"what calms you."*

This is the most defensible insight we can offer because the **within-session** change is
measured directly (before → after), unlike longitudinal recovery correlations which are
observational and confounded.

## 2. Goals

- Per session: a clean, gated, member-facing **Session Response** card (acute ΔHRV, ΔHR,
  time-to-calm, trend) computed from artifact-filtered R-R.
- Persist the per-session result so cross-session aggregation is trivial SQL.
- Cross-session: **"What calms you"** — average response per frequency, with a consistency
  measure and an n-gate, feeding a recommendation.

## 3. Non-goals (out of scope)

- Any **medical / diagnostic** claim. Wellness framing only.
- Longitudinal "frequency X improves overnight recovery" causal claims (observational —
  may be shown later as *personal patterns*, explicitly not proven effects).
- Changes to the WHOOP **cloud** tier (`whoop_daily/...`). This is the live BLE tier only.
- The recommendation UI/placement (separate spec); this defines the data + metrics it needs.

## 4. Design

### 4.0 Clean the signal first (credibility)
Recompute RMSSD from `rr_intervals_ms` with an artifact filter before any metric:
- keep R-R in **300–2000 ms**; drop intervals differing **>20%** from the running median.
- Rationale: live on-device RMSSD is fine for the realtime dial; the *insight* must run on
  filtered data so the number withstands scrutiny. (Raw R-R was stored for exactly this.)

### 4.1 Windows
- **Baseline** = median RMSSD over **30–60 s** after `started_at` (settling window; the store
  already locks this as `baselineRmssd`).
- **Response** = median RMSSD over the **final 60–90 s**.
- Same windows over `bpm_series` → `baselineHR`, `endHR`.

### 4.2 Metrics
| Metric | Formula | Notes |
|---|---|---|
| **ΔHRV %** (headline) | `(endRMSSD − baselineRMSSD) / baselineRMSSD × 100` | + = parasympathetic / calmer |
| **ΔHR** | `endHR − baselineHR` | HR drop = low-noise calming backup signal |
| **Time-to-calm** | first time RMSSD stays ≥ baseline +10 % for 60 s | null if never reached |
| **Sustained regulation** | CV of response-window RMSSD | lower = steadier (not a blip) |
| **Trend** | ΔHRV ≥ +12 → `settled` · −12…+12 → `steady` · ≤ −12 → `activated` | thresholds already in `hrv-store` |

### 4.3 Validity gate
Render the insight only if **all**: `duration_seconds ≥ 180`, clean-sample count ≥ threshold
(TBD, ~60), baseline established. Else show *"Capture was too short to read a clear response."*
A session that fails the gate still saves; it just doesn't get a response insight.

### 4.4 Presentation (member card)
Sentence + number + curve (extends `hrv-summary.tsx`):
```
432 Hz · Deep Calm            12 min
   RMSSD ──╱‾‾‾╲___╱‾‾‾‾  (baseline ┄┄)
        ▲ +18%     ▼ HR 72 → 64
   "Your HRV rose 18% — you reached a calmer,
    rest-and-restore state."  Settled by minute 6.
```
Copy varies on `trend` (settled / steady / activated).

## 5. Data model change

Persist the computed result on `hrv_sessions` (the store already computes `baselineRmssd` +
`pctFromBaseline` — currently display-only, not saved). New migration (next in portal
sequence, e.g. `0068_hrv_session_response.sql`):

```sql
alter table public.hrv_sessions
  add column if not exists baseline_rmssd    numeric,  -- ms, settling-window median (filtered)
  add column if not exists response_rmssd    numeric,  -- ms, response-window median (filtered)
  add column if not exists response_pct      numeric,  -- ΔHRV %
  add column if not exists response_hr_delta numeric,  -- ΔHR bpm (− = calming)
  add column if not exists time_to_calm_sec  integer,  -- nullable
  add column if not exists trend             text;     -- 'settled' | 'steady' | 'activated' | null
```
Wire `hrv-store.endSession()` → `hrv.ts` insert to populate them (compute on-device at save,
on filtered R-R). RLS/immutability unchanged.

## 6. Cross-session aggregate ("What calms you")

With the columns persisted, a view (member app or portal):
```sql
select client_id, content_asset_id, station_code,
       count(*)                        as sessions,
       round(avg(response_pct), 1)     as avg_hrv_response_pct,
       round(stddev(response_pct), 1)  as consistency,      -- lower = more reliable
       round(avg(response_hr_delta),1) as avg_hr_drop
from public.hrv_sessions
where response_pct is not null and duration_seconds >= 180
group by client_id, content_asset_id, station_code
having count(*) >= 3;                                        -- never recommend off 1 session
```
→ *"Your most calming frequency is 432 Hz — avg +14% HRV across 6 sessions."* Surface when
WHOOP recovery is low (ties into the audio-protocol recommender).

## 7. Honesty / safety rails

- Acute, n-of-1, **wellness not medical** — "your HRV rose," never a clinical claim.
- Lead with the **within-session Δ** (measured before→after); cross-session averages are
  framed as *"your personal patterns,"* gated at **n ≥ 3**, and always show `consistency`.

## 8. Acceptance criteria

1. Finishing a ≥3-min capture shows a Session Response card with ΔHRV %, ΔHR, trend, and the
   baseline-overlaid curve; copy matches the trend.
2. A <3-min / low-sample capture saves but shows the "too short" state (no fabricated number).
3. `hrv_sessions` rows carry `baseline_rmssd`, `response_pct`, `response_hr_delta`, `trend`
   after save; metrics are computed on **artifact-filtered** R-R.
4. The aggregate view returns one row per (member, frequency) with `sessions ≥ 3`, exposing
   `avg_hrv_response_pct` + `consistency`.
5. No medical/diagnostic copy anywhere in the feature.

## 9. Open questions

- Exact clean-sample threshold for the validity gate (tune on real captures).
- Response window length (60 vs 90 s) — validate against a few real sessions.
- Does the aggregate/recommendation live in the member app (RLS select-own) or the portal
  (provider view)? `hrv_sessions` RLS already allows practice staff, so either works.
- Compute on-device at save vs a server-side recompute pass (on-device is simplest and the
  raw R-R is already in the row for later reprocessing if we change the algorithm).
