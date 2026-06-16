-- Dev seed — give the app something to render during development.
-- Run against the v3 project (yotaqkgfpifomudtwgzr) in the Supabase SQL editor.
-- Idempotent. Long-term, content seeding belongs to the ThriveRadioPortal, not here.
--
-- VERIFY before trusting: azuracast_station_id and the HLS URL against the AzuraCast
-- server's /api/stations. HLS works only on the `ladder_to_thrive` station; the main
-- `thrive_radio` is an Icecast relay with NO HLS.

-- 1) One playable radio station (Ladder to THRIVE — has working HLS).
insert into public.content_assets (code, asset_type, name, description, stream_url, is_active)
values (
  'ladder_to_thrive',
  'radio_station',
  'Ladder to THRIVE',
  'Dev seed station (HLS).',
  'https://azuracast-radio-u62352.vm.elestio.app/hls/ladder_to_thrive/live.m3u8',
  true
)
on conflict (code) do update
  set stream_url = excluded.stream_url,
      is_active  = true,
      updated_at = now();

-- 2) Grant it to the first ACTIVE member (practice_client), so it shows up for someone.
--    Adjust the WHERE if you want to target a specific member.
insert into public.member_content_grants (practice_membership_id, content_asset_id, grant_type, notes)
select pm.id, ca.id, 'grant', 'dev seed'
from public.practice_memberships pm
join public.roles r          on r.id = pm.role_id and r.code = 'practice_client'
cross join lateral (select id from public.content_assets where code = 'ladder_to_thrive') ca
where pm.status = 'active'
  and not exists (
    select 1 from public.member_content_grants g
    where g.practice_membership_id = pm.id
      and g.content_asset_id = ca.id
  )
order by pm.created_at
limit 1;

-- Sanity check:
--   select code, asset_type, stream_url, is_active from public.content_assets;
--   select count(*) from public.member_content_grants;
