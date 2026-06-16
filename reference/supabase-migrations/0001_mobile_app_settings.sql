-- mobile_app_settings — remote playback/behavior tuning for the v3 mobile app.
--
-- Replaces the legacy thrive_radio.app_settings (which doesn't exist in the v3
-- project). Key/value (jsonb) shape, read by AppConfigService at startup.
-- Seed values are MIGRATED from the legacy production rows (the buffering-saga
-- tuning), not the original seed defaults, plus the new listen_heartbeat_seconds.
--
-- Apply via the v3 Supabase SQL editor (project yotaqkgfpifomudtwgzr).
-- Idempotent: safe to re-run (table IF NOT EXISTS; seed ON CONFLICT DO NOTHING
-- so it won't clobber values later tuned in the dashboard).

create table if not exists public.mobile_app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

alter table public.mobile_app_settings enable row level security;

-- Config is read at app startup (often pre-login as anon). Allow read to all;
-- writes are service-role/admin only (no client write policy granted).
drop policy if exists mobile_app_settings_read on public.mobile_app_settings;
create policy mobile_app_settings_read
  on public.mobile_app_settings for select using (true);

insert into public.mobile_app_settings (key, value, description) values
  ('retry_max_count', '3'::jsonb,
    'Max retries in _handlePlaybackError before giving up'),
  ('retry_delay_seconds', '2'::jsonb,
    'Delay before each retry in _handlePlaybackError'),
  ('reconnect_delay_seconds', '3'::jsonb,
    'Delay before auto-reconnect on unexpected stream end'),
  ('stream_probe_timeout_seconds', '3'::jsonb,
    'Timeout for the HEAD probe used in diagnostic reports'),
  ('ios_use_native_live_player', 'true'::jsonb,
    'iOS live-radio kill-switch. true = native AVPlayer plugin; false = legacy just_audio path. Flip to revert iOS live behavior without a rebuild.'),
  ('ios_auto_waits_to_minimize_stalling', 'true'::jsonb,
    'iOS AVPlayer automaticallyWaitsToMinimizeStalling. true = pre-buffer aggressively (higher latency, fewer stalls).'),
  ('ios_preferred_forward_buffer_seconds', '20'::jsonb,
    'iOS AVPlayer preferredForwardBufferDuration in seconds'),
  ('android_min_buffer_seconds', '30'::jsonb,
    'Android ExoPlayer minBufferDuration in seconds'),
  ('android_max_buffer_seconds', '60'::jsonb,
    'Android ExoPlayer maxBufferDuration in seconds'),
  ('android_buffer_for_playback_seconds', '5'::jsonb,
    'Android ExoPlayer bufferForPlaybackDuration in seconds'),
  ('android_buffer_for_playback_after_rebuffer_seconds', '8'::jsonb,
    'Android ExoPlayer bufferForPlaybackAfterRebufferDuration in seconds'),
  ('listen_heartbeat_seconds', '300'::jsonb,
    'How often the active listen session writes a progress heartbeat (s) so a killed-mid-listen session closes at its last-known time. 300 = 5 min.')
on conflict (key) do nothing;
