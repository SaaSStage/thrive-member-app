# Voice-result display — backend coordination

Context for the member app's voice-analysis result + polling UI (`src/api/score.ts`,
`src/app/score.tsx`). The verified backend contract is implemented against the
**member's own rows via Supabase RLS** — no practitioner endpoint is involved.

## Decision: direct RLS reads, not a new status endpoint

The contract was written endpoint-first (mirroring the practitioner web portal). The
member app already reads `voice_submissions` and `analysis_results` directly under
RLS (`voice_submissions.client_id = current_user_id()`; `analysis_results` chains
through the submission). Every field the contract needs is already member-readable:

- `voice_submissions.status` — the pipeline state machine
- `analysis_results.narrative_status` — disambiguates the terminal `analyzed` state
- `analysis_results.narratives.wellness` — templated baseline progress message

So **the member-scoped status + results endpoints in the original contract are not
needed for this app.** We do NOT point the app at the practitioner endpoint (it 404s
for members). Column names used are snake_case (`status`, `narrative_status`,
`pipeline_error`), not the camelCase REST-wrapper names from the brief.

Polling stays lean: the 4s poll selects only `status` + `narrative_status` +
`vitality_score` presence. The heavy jsonb (`narratives`, `trend_data`,
`recommended_protocols`) is fetched **once, on terminal**, never per tick.

## Remaining ask (optional — enables a nicer locked state)

The locked "building your baseline" UI shows the progress message from
`narratives.wellness` verbatim ("…recorded on 1 separate day, 2 more to go…"). To show
a clean **"Day X of 3"** chip without parsing that prose, please persist two structured
columns on `analysis_results`:

| Column | Type | Meaning |
|---|---|---|
| `distinct_usable_days` | int | Count of separate days recorded so far (0–3). Multiple recordings on one day count once. |
| `days_remaining` | int | Separate days still needed to establish the baseline. |

The app already reads these defensively (`shapeAnalysis` in `src/api/score.ts`); they're
just omitted from the SELECT until they exist (selecting a missing column 400s in
PostgREST). When the columns ship, add `distinct_usable_days, days_remaining` to
`RESULT_COLUMNS` and the chip lights up automatically — no other change.

## To confirm with backend

- `voice_submissions.status` actually carries the full machine for member rows
  (`pending → queued → extracting → scoring → analyzed → narrating → reported`, plus
  `failed` / `narrative_failed`). The app currently inserts `status: 'pending'` and
  the pipeline is expected to advance it.
- `analysis_results.narrative_status` returns `baseline_pending` for no-baseline
  members (most common state for new members).
