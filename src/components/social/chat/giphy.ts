/**
 * GIPHY client for the chat GIF explorer.
 *
 * GIFs are sent as plain text messages in the form `giphy:<g|s>:<id>:<w>x<h>` (g = GIF,
 * s = sticker), so they work with any server version and nothing is uploaded: the bubble renders
 * the media straight from GIPHY's CDN, built from the id (never from a URL in the message).
 */

const API = 'https://api.giphy.com/v1';
const API_KEY = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim() ?? '';
/** School app: nothing above PG-13. */
const RATING = 'pg-13';
const LANG = 'pt';

export type GiphyKind = 'gifs' | 'stickers';

export interface GiphyItem {
  id: string;
  title: string;
  width: number;
  height: number;
  kind: GiphyKind;
}

export interface GiphyPage {
  items: GiphyItem[];
  nextOffset: number | null;
}

export interface GiphyCategory {
  name: string;
  /** Search term for the category. */
  query: string;
  preview: GiphyItem | null;
}

export const giphyEnabled = API_KEY.length > 0;

const ID_RE = /^[A-Za-z0-9]{4,64}$/;
const MESSAGE_RE = /^giphy:([gs]):([A-Za-z0-9]{4,64}):(\d{1,4})x(\d{1,4})$/;

interface RawGif {
  id: string;
  title?: string;
  images?: { original?: { width?: string; height?: string }; fixed_width?: { width?: string; height?: string } };
}

function toItem(raw: RawGif, kind: GiphyKind): GiphyItem | null {
  if (!raw?.id || !ID_RE.test(raw.id)) return null;
  const dims = raw.images?.original ?? raw.images?.fixed_width;
  const width = Number(dims?.width) || 200;
  const height = Number(dims?.height) || 200;
  return { id: raw.id, title: (raw.title ?? '').replace(/\s+GIF.*$/i, '').trim(), width, height, kind };
}

async function call<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  if (!giphyEnabled) throw new Error('GIFs indisponíveis neste build.');
  const qs = new URLSearchParams({ api_key: API_KEY, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  let res: Response;
  try {
    res = await fetch(`${API}/${path}?${qs.toString()}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error('Sem conexão com a internet para carregar os GIFs.');
  }
  if (!res.ok) throw new Error(res.status === 429 ? 'Muitas buscas de GIF agora. Tente em instantes.' : 'Não foi possível carregar os GIFs.');
  return (await res.json()) as T;
}

type ListResponse = { data: RawGif[]; pagination?: { total_count?: number; count?: number; offset?: number } };

function page(res: ListResponse, kind: GiphyKind, offset: number): GiphyPage {
  const items = res.data.map((g) => toItem(g, kind)).filter((g): g is GiphyItem => g !== null);
  const total = res.pagination?.total_count ?? 0;
  const next = offset + (res.pagination?.count ?? res.data.length);
  return { items, nextOffset: res.data.length > 0 && next < Math.min(total, 4999) ? next : null };
}

export async function giphyTrending(kind: GiphyKind, offset = 0, signal?: AbortSignal): Promise<GiphyPage> {
  const res = await call<ListResponse>(`${kind}/trending`, { limit: 24, offset, rating: RATING, bundle: 'messaging_non_clips' }, signal);
  return page(res, kind, offset);
}

export async function giphySearch(kind: GiphyKind, q: string, offset = 0, signal?: AbortSignal): Promise<GiphyPage> {
  const res = await call<ListResponse>(`${kind}/search`, { q, limit: 24, offset, rating: RATING, lang: LANG, bundle: 'messaging_non_clips' }, signal);
  return page(res, kind, offset);
}

export async function giphyTrendingSearches(signal?: AbortSignal): Promise<string[]> {
  const res = await call<{ data: string[] }>('trending/searches', {}, signal);
  return res.data.slice(0, 12);
}

export async function giphyAutocomplete(q: string, signal?: AbortSignal): Promise<string[]> {
  const res = await call<{ data: { name: string }[] }>('gifs/search/tags', { q, limit: 6 }, signal);
  return res.data.map((t) => t.name);
}

export async function giphyCategories(signal?: AbortSignal): Promise<GiphyCategory[]> {
  const res = await call<{ data: { name: string; name_encoded: string; gif?: RawGif }[] }>('gifs/categories', {}, signal);
  return res.data.slice(0, 18).map((c) => ({
    name: c.name,
    query: c.name,
    preview: c.gif ? toItem(c.gif, 'gifs') : null,
  }));
}

/** Small animated rendition for grids. */
export const giphyPreviewUrl = (id: string) => `https://media.giphy.com/media/${id}/200w.webp`;
/** Chat bubble rendition (200px tall, ~3× lighter than the original). */
export const giphyBubbleUrl = (id: string) => `https://media.giphy.com/media/${id}/200.webp`;
/** Full-quality rendition for the viewer. */
export const giphyFullUrl = (id: string) => `https://media.giphy.com/media/${id}/giphy.webp`;
/** Tiny still frame (~8 KB) shown under the loading veil, like the screenshot under Circle to Search. */
export const giphyStillUrl = (id: string) => `https://media.giphy.com/media/${id}/100w_s.gif`;
/** Fallback when a WebView can't decode animated WebP. */
export const giphyGifUrl = (id: string) => `https://media.giphy.com/media/${id}/giphy.gif`;
export const giphyPageUrl = (id: string) => `https://giphy.com/gifs/${id}`;

export function encodeGifMessage(item: GiphyItem): string {
  return `giphy:${item.kind === 'stickers' ? 's' : 'g'}:${item.id}:${Math.round(item.width)}x${Math.round(item.height)}`;
}

export function parseGifMessage(text: string): GiphyItem | null {
  const m = MESSAGE_RE.exec(text.trim());
  if (!m) return null;
  return { kind: m[1] === 's' ? 'stickers' : 'gifs', id: m[2]!, width: Number(m[3]) || 200, height: Number(m[4]) || 200, title: '' };
}

/** Text for previews/notifications/copy. */
export function describeMessageText(text: string): string {
  const gif = parseGifMessage(text);
  return gif ? (gif.kind === 'stickers' ? '🏷️ Figurinha' : '🎞️ GIF') : text;
}
