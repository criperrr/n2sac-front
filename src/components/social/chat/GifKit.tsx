import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Search, TrendingUp, X } from 'lucide-react';
import { useM3Theme } from '../../../theme/ThemeContext';
import { useBackLayer } from '../../../navigation/backStack';
import { DURATION, EASING, prefersReducedMotion, spring } from '../../../theme/motion';
import { isKeyboardAnimating, onKeyboardInsetChange } from '../../../platform/keyboardInsets';
import { openExternalUrl } from '../../../platform/openExternal';
import { MorphingShapeIndicator } from '../../expressive/ShapeMorph';
import { ShimmerVeil } from '../../expressive/ShimmerVeil';
import { chatTone } from './chatModel';
import {
  giphyAutocomplete,
  giphyCategories,
  giphyEnabled,
  giphyBubbleUrl,
  giphyFullUrl,
  giphyGifUrl,
  giphyPageUrl,
  giphyPreviewUrl,
  giphyStillUrl,
  giphySearch,
  giphyTrending,
  giphyTrendingSearches,
  type GiphyCategory,
  type GiphyItem,
  type GiphyKind,
} from './giphy';

/**
 * A GIPHY rendition. While it loads, a CSS skeleton with the profile-banner ShimmerVeil look
 * (theme haze blobs + light sweep) covers the box, sized from the GIF's aspect ratio so nothing
 * jumps; then the media fades and settles in. CSS-only (one light layer) so a grid of dozens of
 * tiles stays smooth, unlike a full ShimmerVeil per tile.
 *
 * `quality`: `preview` (grid, 200px wide), `bubble` (chat, 200px tall), `full` (viewer).
 */
export const GifMedia: React.FC<{
  item: GiphyItem;
  quality: 'preview' | 'bubble' | 'full';
  radius: number | string;
  style?: React.CSSProperties;
}> = ({ item, quality, radius, style }) => {
  const primary = quality === 'full' ? giphyFullUrl(item.id) : quality === 'bubble' ? giphyBubbleUrl(item.id) : giphyPreviewUrl(item.id);
  const [src, setSrc] = useState(primary);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { tokens } = useM3Theme();
  // The veil only runs while the tile is on screen, and defers new veil mounts while the keyboard
  // is actively sliding so closing IME in GIF search never triggers a 15-tile mount storm mid-slide.
  const boxRef = useRef<HTMLDivElement>(null);
  const inViewRef = useRef(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const sync = () => {
      if (isKeyboardAnimating()) return;
      setVisible(inViewRef.current);
    };
    const io = new IntersectionObserver(
      (entries) => {
        inViewRef.current = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: '80px' }
    );
    io.observe(el);
    const offKb = onKeyboardInsetChange(sync);
    return () => {
      io.disconnect();
      offKb();
    };
  }, []);

  return (
    <div
      ref={boxRef}
      style={{
        position: 'relative',
        // `clip`, not `hidden`: an overflow:hidden box is a scroll container, and on Android
        // Chromium a touch starting on it (the loading image is scaled past its edges) latches the
        // gesture there, so the GIF grid only scrolled when dragged from the gaps between tiles.
        overflow: 'clip',
        borderRadius: radius,
        aspectRatio: `${item.width} / ${item.height}`,
        backgroundColor: item.kind === 'stickers' ? 'transparent' : chatTone(tokens, 8),
        ...style,
      }}
    >
      {!failed && item.kind !== 'stickers' && (
        <img
          src={giphyStillUrl(item.id)}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.8) contrast(0.92)' }}
        />
      )}
      {!failed && (
        <img
          src={src}
          alt={item.title || (item.kind === 'stickers' ? 'Figurinha' : 'GIF')}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Animated WebP unsupported or missing rendition: try the GIF once.
            if (src !== giphyGifUrl(item.id)) setSrc(giphyGifUrl(item.id));
            else setFailed(true);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 260ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        />
      )}
      {failed && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: tokens.onSurfaceVariant }}>
          GIF indisponível
        </span>
      )}
      {visible && <ShimmerVeil active={!loaded && !failed} radius={radius} tile />}
    </div>
  );
};

/** Full-screen GIF viewer inside the chat. */
export const GifViewer: React.FC<{ item: GiphyItem; onClose: () => void }> = ({ item, onClose }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const surface = surfaceRef.current;
    if (!surface || prefersReducedMotion()) {
      onClose();
      return;
    }
    const timing = { duration: DURATION.short4, easing: EASING.emphasizedAccelerate, fill: 'forwards' as const };
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    surface.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.9' }], timing).finished.then(onClose);
  }, [onClose]);

  useBackLayer(true, (source) => (source === 'gesture' ? onClose() : close()), { kind: 'modal', surfaceRef, scrimRef });
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const { easing, duration } = spring('defaultSpatial');
    surfaceRef.current?.animate([{ opacity: 0, scale: '0.82' }, { opacity: 1, scale: '1' }], { duration, easing });
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION.medium1, easing: EASING.linear });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const maxW = Math.min(window.innerWidth - 32, 720);
  const maxH = window.innerHeight * 0.7;
  const scale = Math.min(maxW / item.width, maxH / item.height);
  const width = Math.max(160, Math.round(item.width * scale));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-ime-managed>
      <div ref={scrimRef} onClick={close} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.86)' }} />
      <div ref={surfaceRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <GifMedia item={item} quality="full" radius={isMaterialYou ? 24 : 12} style={{ width, maxWidth: '100%' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => openExternalUrl(giphyPageUrl(item.id))} className="nsac-chat-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: tokens.surfaceContainerHigh, color: tokens.onSurface }}>
            <ExternalLink size={14} /> Abrir no GIPHY
          </button>
          <button type="button" onClick={close} className="nsac-chat-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: tokens.primary, color: tokens.onPrimary }}>
            <X size={14} /> Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

/** Splits items into balanced masonry columns using their aspect ratios. */
function masonry(items: GiphyItem[], columns: number): GiphyItem[][] {
  const cols: GiphyItem[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const it of items) {
    let target = 0;
    for (let c = 1; c < columns; c += 1) if (heights[c] < heights[target]) target = c;
    cols[target]!.push(it);
    heights[target] += it.height / it.width + 0.06;
  }
  return cols;
}

/**
 * GIF/sticker explorer: trending, trending searches, categories, search with autocomplete,
 * infinite masonry. Picking an item sends it.
 */
export const GifExplorer: React.FC<{ kind: GiphyKind; onPick: (item: GiphyItem) => void }> = ({ kind, onPick }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendingTerms, setTrendingTerms] = useState<string[]>([]);
  const [categories, setCategories] = useState<GiphyCategory[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const columns = typeof window !== 'undefined' && window.innerWidth >= 640 ? 3 : 2;

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  // Discovery rows (once).
  useEffect(() => {
    if (!giphyEnabled) return;
    const ctrl = new AbortController();
    giphyTrendingSearches(ctrl.signal).then(setTrendingTerms).catch(() => {});
    if (kind === 'gifs') giphyCategories(ctrl.signal).then(setCategories).catch(() => {});
    return () => ctrl.abort();
  }, [kind]);

  // Autocomplete.
  useEffect(() => {
    if (!giphyEnabled || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      giphyAutocomplete(query.trim(), ctrl.signal)
        .then((s) => setSuggestions(s.filter((x) => x.toLowerCase() !== query.trim().toLowerCase())))
        .catch(() => {});
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const load = useCallback(
    async (offset: number, reset: boolean) => {
      if (!giphyEnabled) return;
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const page = debounced ? await giphySearch(kind, debounced, offset) : await giphyTrending(kind, offset);
        if (id !== requestId.current) return;
        setItems((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((i) => i.id));
          return [...base, ...page.items.filter((i) => !seen.has(i.id))];
        });
        setNextOffset(page.nextOffset);
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar os GIFs.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [debounced, kind]
  );

  useEffect(() => {
    setItems([]);
    setNextOffset(0);
    scrollRef.current?.scrollTo({ top: 0 });
    void load(0, true);
  }, [load]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading && nextOffset !== null && nextOffset > 0) void load(nextOffset, false);
      },
      { root, rootMargin: '300px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load, loading, nextOffset]);

  const cols = useMemo(() => masonry(items, columns), [items, columns]);
  const radius = isMaterialYou ? 16 : 8;

  if (!giphyEnabled) {
    return <div style={{ padding: 20, textAlign: 'center', fontSize: '0.82rem', color: tokens.onSurfaceVariant }}>GIFs indisponíveis neste build.</div>;
  }

  const chip = (label: string, onClick: () => void, key: string, icon?: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="nsac-chat-chip nsac-gif-chip"
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: chatTone(tokens, 9), color: tokens.onSurface }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 42,
            padding: '0 12px',
            borderRadius: 999,
            backgroundColor: chatTone(tokens, 9),
            color: tokens.onSurfaceVariant,
          }}
        >
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setDebounced(query.trim());
              }
            }}
            placeholder={kind === 'gifs' ? 'Pesquisar no GIPHY' : 'Pesquisar figurinhas'}
            aria-label={kind === 'gifs' ? 'Pesquisar GIFs' : 'Pesquisar figurinhas'}
            enterKeyHint="search"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: tokens.onSurface, fontFamily: 'inherit', fontSize: '0.92rem' }}
          />
          {query && (
            <button type="button" aria-label="Limpar" onClick={() => setQuery('')} style={{ border: 'none', background: 'transparent', color: 'inherit', display: 'inline-flex', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="nsac-gif-chip-row">
          {query.trim()
            ? suggestions.map((s) => chip(s, () => setQuery(s), `s-${s}`))
            : [
                ...trendingTerms.map((t) => chip(t, () => setQuery(t), `t-${t}`, <TrendingUp size={13} />)),
                ...categories.map((c) => chip(c.name, () => setQuery(c.query), `c-${c.name}`)),
              ]}
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 8px 8px' }}>
        {error && <div style={{ padding: 16, textAlign: 'center', fontSize: '0.82rem', color: tokens.error }}>{error}</div>}
        {!error && !loading && items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: '0.84rem', color: tokens.onSurfaceVariant }}>Nada encontrado para “{debounced}”.</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6, alignItems: 'start' }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {col.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  className="nsac-gif-tile"
                  onClick={() => onPick(it)}
                  aria-label={`Enviar ${it.title || (kind === 'gifs' ? 'GIF' : 'figurinha')}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <GifMedia item={it} quality="preview" radius={radius} />
                </button>
              ))}
            </div>
          ))}
        </div>
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <MorphingShapeIndicator size={26} label="Carregando GIFs" />
          </div>
        )}
        <div style={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', color: tokens.onSurfaceVariant, padding: '10px 0 4px' }}>
          POWERED BY GIPHY
        </div>
      </div>
    </div>
  );
};
