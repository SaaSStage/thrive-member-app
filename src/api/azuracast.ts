/**
 * AzuraCast now-playing client. HLS carries no ICY metadata, so the live
 * track title/artist/artwork come from the now-playing REST API
 * (AUDIO-PLAYBACK.md §3/§6). The station's AzuraCast shortcode == the
 * content_assets.code (e.g. 'hls_test').
 */
const BASE = process.env.EXPO_PUBLIC_AZURACAST_BASE_URL;

export type NowPlaying = {
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  isLive: boolean;
};

export async function fetchNowPlaying(shortcode: string): Promise<NowPlaying | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/nowplaying/${encodeURIComponent(shortcode)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      now_playing?: { song?: { title?: string; text?: string; artist?: string; art?: string } };
      live?: { is_live?: boolean };
    };
    const song = data?.now_playing?.song;
    if (!song) return null;
    const artist = (song.artist ?? '').trim();
    return {
      title: (song.title ?? song.text ?? '').trim() || null,
      artist: artist || null,
      artworkUrl: song.art ?? null,
      isLive: Boolean(data?.live?.is_live),
    };
  } catch {
    return null;
  }
}
