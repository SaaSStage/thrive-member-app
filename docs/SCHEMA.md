# Backend Schema — v3 Supabase (`yotaqkgfpifomudtwgzr`)

The mobile app **consumes this backend as-is**. Schema is owned by the **ThriveRadioPortal** repo
(`supabase/migrations/`, 50+ files). This doc captures the slice the member app touches. Source of
truth is the migrations + the live DB — verify before trusting this file.

- **Project:** `yotaqkgfpifomudtwgzr` (NOT prod `mxktlbhiknpdauzoitnm`, which is the old Flutter app).
- **Auth:** Clerk owns identity; `public.users` owns app data. App signs in with Clerk, passes the
  Clerk JWT to Supabase as `accessToken`; RLS does the filtering.
- **Schema:** everything is in `public`. The REST OpenAPI introspection is locked down (root returns
  nothing) — query tables directly; read DDL from the portal migrations.

## Identity & membership

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` uuid PK, `clerk_user_id` text, `email`, `name`, `role` (user/admin/superadmin), `plan_key`, clinical fields (`year_of_birth`, `biological_sex`, `smoking_status`, `respiratory_conditions[]`, `vocal_conditions[]`, `preferred_language`, `phone`, `avatar_url`) | One row per Clerk user. **The mobile member is a `users` row.** |
| `practices` | `id`, `name`, `slug`, `status` | The clinic/org. |
| `practice_memberships` | `user_id`→users, `practice_id`→practices, `role_id`→roles, `status` (pending/active/deactivated) | **Mobile members have role `practice_client`, status `active`.** One active client membership per user (enforced by trigger). |
| `roles` | `code` (`practice_admin`/`practice_provider`/`practice_client`), `scope` | RBAC catalog. |

**Onboarding is invite-only:** a practice invites an email (`fn_members_invite` → `practice_invitations`),
the person signs up in Clerk, and Clerk's `user.created` webhook calls `fn_members_accept_invitation`
to create the `users` row + active membership. The app does **not** self-register users.

## Content (what the app lists & plays)

| Table | Key columns | Notes |
|---|---|---|
| `content_assets` | `code`, `asset_type` (`radio_station`/`playlist`/`frequency`/`audio_protocol`), `name`, `description`, `target_subscores subscore_category[]`, `azuracast_station_id` int, `stream_url`, `entitlement_code`, `is_active` | The catalog of stations/playlists/etc. **Currently EMPTY — see dev-seed.sql.** |
| `member_content_grants` | `practice_membership_id`→membership, `content_asset_id`→asset, `grant_type` (`grant`/`revoke`), `expires_at` | Per-member authorization. **Currently EMPTY.** Effective access = granted, not revoked, not expired. |

> ⚠️ **The content layer has zero data.** Until `content_assets` + `member_content_grants` are
> populated (by the portal, or `docs/dev-seed.sql`), the radio/library/home screens render empty no
> matter how correct the code is. Streaming: HLS works only on AzuraCast station `ladder_to_thrive`
> (`/hls/ladder_to_thrive/live.m3u8`); the main `thrive_radio` is an Icecast relay with no HLS.

## Voice & score

| Table | Key columns | Notes |
|---|---|---|
| `voice_submissions` | `id`, `client_id`→users, `practice_id`, status | One per voice-capture session. |
| `voice_recordings` | `submission_id` | Individual WAV recordings. |
| `analysis_results` | `submission_id`, scores (Vitality + 4 sub-scores), `shared_with_member_at` | **The score screen reads this.** Rows are large (analysis blobs) — always `select` specific columns, never `*`. |

Sub-score categories (`subscore_category` enum) map to the 4 sub-scores: emotional_wellness,
cognitive_clarity, physical_energy, voice_power (see `system_settings.scoring_config`).

## Entitlements & config

| Table | Notes |
|---|---|
| `entitlement_features` / `tenant_entitlements` | Paid feature flags. `basic_score_preview` is always-on; `voice_submission_unlimited`/`_metered` gate uploads. Check via `has_entitlement(code)`. |
| `mobile_app_settings` | Remote-config `key`/`value`/`description` (12 rows) — the tuning layer. Fetch at startup. |
| `system_settings` (singleton) | `scoring_config` jsonb (weights, thresholds), `plans` jsonb. |

## RLS / helper functions (how the app reads its own data)

Policies use the Clerk JWT. Key SQL helpers (all `security definer`):
- `current_clerk_user_id()` → `auth.jwt()->>'sub'`
- `current_user_id()` → `users.id` for the current Clerk user
- `has_active_membership(practice_id)`, `has_role_in_practice(practice_id, codes[])`
- `has_entitlement(feature_code, ...)`

A member can read: their own `users` row, their `practice_memberships`, `content_assets` they're
granted, their `voice_submissions`/`analysis_results`. Reference data (roles, content_assets) is
readable by all authenticated users; grants filter what's *theirs*.
