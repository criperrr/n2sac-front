import { argbFromHex, Blend, hexFromArgb, Hct } from '@material/material-color-utilities';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../theme/motion';
import { useM3Theme } from '../../theme/ThemeContext';
import { attachFlowField, type FlowFieldHandle, type RainbowStop } from './flowField';

/**
 * Loading veil in the spirit of Circle to Search: a translucent haze colored by the active M3
 * theme tokens drifting over the area, a soft highlight sweeping across, and fine film grain.
 * When `active` turns false the veil dissolves smoothly while the underlying media begins playing.
 *
 * The `tile` variant (GIF grid, chat GIFs) renders its frosted wash, 9 Monet+theme flowing clouds,
 * soft inner rainbow halo, and crisp theme-pulled spinning rainbow border inside ONE single
 * `<canvas>` (zero CSS `mask-composite`, zero per-frame DOM style writes, staggered 38 FPS
 * scheduling) paired with static micro-sparkle film grain.
 */

function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (full.length !== 6) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseRadiusPx(radius: number | string): number {
  if (typeof radius === 'number') return radius;
  const n = parseFloat(radius);
  return Number.isFinite(n) ? n : 16;
}

let grainUrl: string | null = null;
/** Monochrome film grain + subtle Circle-to-Search micro-sparkles, generated once per session. */
function grainTile(): string {
  if (grainUrl) return grainUrl;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = Math.random();
    if (r < 0.008) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = 155;
    } else if (r < 0.56) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 36;
    } else {
      img.data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  grainUrl = canvas.toDataURL('image/png');
  return grainUrl;
}

const EXIT_MS = 1100;
const TILE_EXIT_MS = 1000;
const SURFACE_EXIT_MS = 560;

export const ShimmerVeil: React.FC<{
  active: boolean;
  /** Corner radius of the covered area (the veil clips to it). */
  radius?: number | string;
  /** Lighter variant for small areas (text skeletons): no grain, subtler haze. */
  compact?: boolean;
  /** Large dialog/card surface variant: smaller GPU overhang, no mix-blend readback, crisp exit. */
  surface?: boolean;
  /**
   * Small media tiles (GIF grid, chat GIFs): Circle to Search activation look over the content
   * below — frosted wash, 9 Monet+theme flowing clouds, theme-pulled spinning rainbow border with
   * random speed and positions, and crisp grain. Single canvas = zero CSS mask or flicker.
   */
  tile?: boolean;
  /** Fires whenever the veil mounts or finishes fading out and unmounts. */
  onMountedChange?: (mounted: boolean) => void;
}> = ({ active, radius = 0, compact = false, surface = false, tile = false, onMountedChange }) => {
  const { tokens, effectiveIsDark } = useM3Theme();
  const rootRef = useRef<HTMLDivElement>(null);
  const flowHandleRef = useRef<FlowFieldHandle | null>(null);
  const [mounted, setMounted] = useState(active);
  const onMountedChangeRef = useRef(onMountedChange);
  onMountedChangeRef.current = onMountedChange;

  const themePalette = useMemo(() => {
    const baseAlpha = compact ? (effectiveIsDark ? 0.14 : 0.18) : surface ? (effectiveIsDark ? 0.22 : 0.24) : effectiveIsDark ? 0.28 : 0.3;
    const boost = effectiveIsDark ? 1 : 0.92;
    const haze = [
      `radial-gradient(38% 42% at 28% 34%, ${hexAlpha(tokens.primary, 0.54 * boost)}, transparent 70%)`,
      `radial-gradient(34% 40% at 70% 30%, ${hexAlpha(tokens.tertiary, 0.48 * boost)}, transparent 72%)`,
      `radial-gradient(40% 44% at 62% 72%, ${hexAlpha(tokens.primaryContainer, 0.58 * boost)}, transparent 70%)`,
      `radial-gradient(30% 36% at 30% 76%, ${hexAlpha(tokens.secondary, 0.44 * boost)}, transparent 72%)`,
      `radial-gradient(26% 30% at 84% 62%, ${hexAlpha(tokens.tertiaryContainer, 0.46 * boost)}, transparent 72%)`,
    ].join(', ');
    const sweepColor = effectiveIsDark ? hexAlpha(tokens.primary, 0.3) : hexAlpha('#FFFFFF', 0.48);
    const sweep = `linear-gradient(100deg, transparent 38%, ${sweepColor} 50%, transparent 62%)`;
    return {
      base: hexAlpha(tokens.primaryContainer, baseAlpha),
      haze,
      sweep,
    };
  }, [tokens, effectiveIsDark, compact, surface]);

  // Flowing fields: the user's theme colors plus random Monet colors harmonized with them, each
  // tile drawing its own deterministic random set (positions & motion are random too).
  const [tileSeed] = useState(() => Math.random());
  const tilePalette = useMemo(
    () =>
      shuffle(
        [
          tokens.primary,
          tokens.tertiary,
          tokens.secondary,
          tokens.primaryContainer,
          tokens.tertiaryContainer,
          ...monetExtras(tokens.primary, 4, effectiveIsDark, tileSeed),
        ],
        tileSeed
      ),
    [tokens, effectiveIsDark, tileSeed]
  );

  // Per-tile randomized prismatic rainbow pulled toward the user's active Monet theme.
  const rainbowStops = useMemo(
    () => buildRainbowStops(tokens.primary, tokens.tertiary, tileSeed, effectiveIsDark),
    [tokens.primary, tokens.tertiary, tileSeed, effectiveIsDark]
  );
  const frostColor = useMemo(
    () => hexAlpha(effectiveIsDark ? tokens.onSurface : '#FFFFFF', effectiveIsDark ? 0.16 : 0.32),
    [tokens.onSurface, effectiveIsDark]
  );
  const radiusPx = useMemo(() => parseRadiusPx(radius), [radius]);

  useEffect(() => {
    onMountedChangeRef.current?.(mounted);
  }, [mounted]);

  useEffect(() => {
    if (active) {
      setMounted(true);
      flowHandleRef.current?.setExitProgress(-1);
      flowHandleRef.current?.setSpeedScale(1);
      const root = rootRef.current;
      if (root) {
        root.getAnimations({ subtree: true }).forEach((a) => a.updatePlaybackRate(1));
      }
      return;
    }
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    let cancelled = false;
    let startRaf = 0;
    let fade: Animation | null = null;
    let frame = 0;

    // Wait one frame after the revealed content commits/paints so the dissolve always starts cleanly
    // while the animated GIF starts playing immediately underneath.
    startRaf = requestAnimationFrame(() => {
      if (cancelled) return;
      if (tile) {
        // 1-second 3-phase dissolve driven directly inside the tile canvas:
        // rainbow rushes inward -> swirls & mixes with the Monet clouds -> rapid random burst outward.
        const grainEl = root.querySelector('.n2sac-veil__grain') as HTMLElement | null;
        if (grainEl) {
          fade = grainEl.animate([{ opacity: 0.28 }, { opacity: 0 }], {
            duration: TILE_EXIT_MS * 0.75,
            delay: TILE_EXIT_MS * 0.15,
            easing: 'ease-out',
            fill: 'forwards',
          });
        }
        const start = performance.now();
        const driveExit = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / TILE_EXIT_MS);
          flowHandleRef.current?.setExitProgress(t);
          if (t < 1) {
            frame = requestAnimationFrame(driveExit);
          } else {
            setMounted(false);
          }
        };
        flowHandleRef.current?.setExitProgress(0);
        frame = requestAnimationFrame(driveExit);
        return;
      }

      const exitMs = surface ? SURFACE_EXIT_MS : EXIT_MS;
      const easing = surface ? 'cubic-bezier(0.25, 0.1, 0.25, 1)' : 'cubic-bezier(0.05, 0.7, 0.1, 1)';
      fade = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: exitMs,
        easing,
        fill: 'forwards',
      });
      if (!surface) {
        const loops = root.getAnimations({ subtree: true }).filter((a) => a !== fade);
        const start = performance.now();
        const brake = (now: number) => {
          const t = Math.min(1, (now - start) / exitMs);
          const rate = Math.max(0.02, (1 - t) ** 2);
          flowHandleRef.current?.setSpeedScale(rate);
          loops.forEach((a) => a.updatePlaybackRate(rate));
          if (t < 1) frame = requestAnimationFrame(brake);
        };
        frame = requestAnimationFrame(brake);
      }
      fade.onfinish = () => {
        if (!cancelled) setMounted(false);
      };
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(startRaf);
      cancelAnimationFrame(frame);
      fade?.cancel();
    };
  }, [active, surface, tile]);

  if (!mounted) return null;
  const reduced = prefersReducedMotion();
  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`n2sac-veil${compact ? ' n2sac-veil--compact' : ''}${surface ? ' n2sac-veil--surface' : ''}${tile ? ' n2sac-veil--tile' : ''}${reduced ? ' n2sac-veil--static' : ''}`}
      style={{
        borderRadius: radius,
        background: tile ? 'transparent' : themePalette.base,
      }}
    >
      {tile ? (
        <TileFlowCanvas
          colors={tilePalette}
          frostColor={frostColor}
          rainbowStops={rainbowStops}
          radiusPx={radiusPx}
          isDark={effectiveIsDark}
          reduced={reduced}
          handleRef={flowHandleRef}
        />
      ) : (
        <div className="n2sac-veil__haze" style={{ background: themePalette.haze }} />
      )}
      {!tile && <div className="n2sac-veil__sweep" style={{ background: themePalette.sweep }} />}
      {((!compact && !surface) || tile) && <div className="n2sac-veil__grain" style={{ backgroundImage: `url(${grainTile()})` }} />}
    </div>
  );
};

/**
 * Single `<canvas>` rendering the frosted wash + 9 Monet/theme flowing clouds + soft inner rainbow
 * halo + crisp rounded rainbow border rim with zero CSS `mask-composite` or per-frame DOM writes.
 */
const TileFlowCanvas: React.FC<{
  colors: string[];
  frostColor: string;
  rainbowStops: RainbowStop[];
  radiusPx: number;
  isDark: boolean;
  reduced: boolean;
  handleRef: React.MutableRefObject<FlowFieldHandle | null>;
}> = ({ colors, frostColor, rainbowStops, radiusPx, isDark, reduced, handleRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialRef = useRef({ colors, frostColor, rainbowStops, radiusPx, isDark, reduced });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const init = initialRef.current;
    const handle = attachFlowField({
      canvas,
      colors: init.colors,
      frostColor: init.frostColor,
      rainbowStops: init.rainbowStops,
      radiusPx: init.radiusPx,
      isDark: init.isDark,
      reducedMotion: init.reduced,
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef]);

  useEffect(() => {
    handleRef.current?.updateAppearance(colors, frostColor, rainbowStops, isDark);
  }, [colors, frostColor, rainbowStops, isDark, handleRef]);

  return <canvas ref={canvasRef} className="n2sac-veil__canvas" />;
};

/** Deterministic PRNG so a tile keeps its colors and rainbow stop positions across re-renders. */
function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 2 ** 32) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], seed: number): T[] {
  const rnd = mulberry32(seed + 0.5);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Random extra colors from the Monet engine: random hues at a vivid chroma and a tone that suits
 * light/dark mode (HCT), then `Blend.harmonize`d toward the user's primary so they still belong
 * to the theme. Hues are spread apart so a tile never gets two near-identical extras.
 */
function monetExtras(primaryHex: string, count: number, dark: boolean, seed: number): string[] {
  let primary: number;
  try {
    primary = argbFromHex(primaryHex);
  } catch {
    return [];
  }
  const rnd = mulberry32(seed);
  const source = Hct.fromInt(primary);
  const chroma = Math.max(56, source.chroma);
  const tone = dark ? 68 : 62;
  const start = rnd() * 360;
  return Array.from({ length: count }, (_, i) => {
    const hue = (start + (360 / count) * i + (rnd() - 0.5) * 50 + 360) % 360;
    const random = Hct.from(hue, chroma, tone).toInt();
    return hexFromArgb(Blend.harmonize(random, primary));
  });
}

/**
 * Builds a random multicolor rainbow ring whose hues are pulled toward the user's active theme
 * via Monet (`Blend.hctHue` + HCT theme anchors). Each tile gets randomized angular positions,
 * uneven arc widths, random spectrum orientation, and theme-anchored glow peaks so it still reads
 * as a lively random rainbow while harmonizing strongly with the user's palette.
 */
function buildRainbowStops(
  primaryHex: string,
  tertiaryHex: string,
  seed: number,
  dark: boolean
): RainbowStop[] {
  const rnd = mulberry32(seed + 0.77);
  const count = 7;
  const dir = rnd() < 0.5 ? 1 : -1;
  const tone = dark ? 75 : 59;
  const baseChroma = dark ? 68 : 64;

  let primaryArgb: number | null = null;
  let primaryHue = rnd() * 360;
  let primaryChroma = baseChroma;
  let tertiaryHue = (primaryHue + 60) % 360;
  let tertiaryChroma = baseChroma;

  try {
    primaryArgb = argbFromHex(primaryHex);
    const pHct = Hct.fromInt(primaryArgb);
    primaryHue = pHct.hue;
    primaryChroma = Math.max(58, pHct.chroma * 1.15);
    const tHct = Hct.fromInt(argbFromHex(tertiaryHex));
    tertiaryHue = tHct.chroma > 14 ? tHct.hue : (primaryHue + 34 * dir + 360) % 360;
    tertiaryChroma = Math.max(54, tHct.chroma * 1.1);
  } catch {
    // Fallback to pure random hues if token isn't a valid hex string.
  }

  const weights = Array.from({ length: count }, () => 0.55 + rnd() * 1.15);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const primarySlot = Math.floor(rnd() * count);
  const tertiarySlot = (primarySlot + 2 + Math.floor(rnd() * (count - 3))) % count;
  const startOffset = rnd() * 360;

  let acc = 0;
  return weights.map((w, i) => {
    const pos = acc / totalWeight;
    acc += w;

    if (i === primarySlot) {
      const h = (primaryHue + (rnd() - 0.5) * 14 + 360) % 360;
      return { pos, color: hexFromArgb(Hct.from(h, primaryChroma, tone).toInt()) };
    }
    if (i === tertiarySlot) {
      const h = (tertiaryHue + (rnd() - 0.5) * 18 + 360) % 360;
      return { pos, color: hexFromArgb(Hct.from(h, tertiaryChroma, tone).toInt()) };
    }

    const rawHue = (startOffset + dir * ((360 / count) * i + (rnd() - 0.5) * 28) + 720) % 360;
    const rawInt = Hct.from(rawHue, baseChroma + 6, tone).toInt();
    if (primaryArgb !== null) {
      const pull = 0.36 + rnd() * 0.14;
      const pulled = Hct.fromInt(Blend.hctHue(rawInt, primaryArgb, pull));
      const color = hexFromArgb(Hct.from(pulled.hue, Math.max(58, pulled.chroma), tone).toInt());
      return { pos, color };
    }
    return { pos, color: hexFromArgb(rawInt) };
  });
}
