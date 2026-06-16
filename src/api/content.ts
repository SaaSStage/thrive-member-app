/**
 * Granted-content queries (the entitlement-filtered catalog the member may
 * see/play). Mirrors the spec's content authorization model: effective access
 * = granted, not revoked, not expired, asset active.
 *
 * RLS on member_content_grants restricts rows to the signed-in member's own
 * membership, so we don't filter by member id here — the JWT does it.
 */
import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';

export type AssetType = 'radio_station' | 'playlist' | 'frequency' | 'audio_protocol';

export type ContentAsset = {
  id: string;
  code: string;
  asset_type: AssetType;
  name: string;
  description: string | null;
  stream_url: string | null;
  azuracast_station_id: number | null;
  is_active: boolean;
};

type GrantRow = {
  grant_type: 'grant' | 'revoke';
  expires_at: string | null;
  content_assets: ContentAsset | null;
};

export function useGrantedContent() {
  const supabase = useSupabase();

  return useQuery({
    queryKey: ['granted-content'],
    queryFn: async (): Promise<ContentAsset[]> => {
      const { data, error } = await supabase
        .from('member_content_grants')
        .select(
          'grant_type, expires_at, content_assets!inner(id, code, asset_type, name, description, stream_url, azuracast_station_id, is_active)',
        )
        .eq('grant_type', 'grant');

      if (error) throw error;

      const now = Date.now();
      const seen = new Set<string>();
      const assets: ContentAsset[] = [];

      for (const row of (data ?? []) as unknown as GrantRow[]) {
        const asset = row.content_assets;
        if (!asset || !asset.is_active) continue;
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
        if (seen.has(asset.id)) continue;
        seen.add(asset.id);
        assets.push(asset);
      }
      return assets;
    },
  });
}

/** Granted live radio stations only (the Radio tab's data). */
export function useGrantedStations() {
  const query = useGrantedContent();
  return {
    ...query,
    data: query.data?.filter((a) => a.asset_type === 'radio_station'),
  };
}
