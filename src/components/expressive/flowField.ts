/**
 * Ultra-lightweight unified canvas driver for the Circle to Search–style loading veil (`tile`).
 *
 * Visual & performance architecture:
 * - Pure soft gradient borders (zero hard fixed rim line, zero `Path2D` clip, zero `mask-composite`,
 *   zero `ResizeObserver`): every tile renders onto ONE tiny `64×80` `<canvas>` (~20 KB VRAM)
 *   upscaled seamlessly by hardware bilinear filtering — works identically on wide (`16:9`),
 *   square (`1:1`), and tall (`9:16`) GIF tiles with zero corner distortion.
 * - The 9 flowing Monet+theme clouds render onto a tiny shared `32×40` buffer using cached `32×32`
 *   radial sprites; the spinning theme-pulled rainbow border glow is pre-baked ONCE per tile into
 *   a soft feathered `96×96` disk (`haloDisk`) + circular dissolve wave (`exitRingDisk`).
 * - Staggered round-robin scheduling (~31 FPS steady-state, auto-adapts down on weak CPUs; 60 FPS
 *   during the 1s gather -> mix -> cascading off-screen stream dissolve).
 * - Automatically pauses while off-screen (`IntersectionObserver`), backgrounded (`visibilitychange`),
 *   or while the Android software keyboard is sliding open/closed (`isKeyboardAnimating()`).
 */

import { isKeyboardAnimating, onKeyboardInsetChange } from '../../platform/keyboardInsets';

export interface RainbowStop {
  /** Normalized position around the circle in [0, 1). */
  pos: number;
  color: string;
}

export interface FlowFieldOptions {
  canvas: HTMLCanvasElement;
  colors: string[];
  frostColor: string;
  rainbowStops: RainbowStop[];
  radiusPx: number;
  isDark: boolean;
  reducedMotion: boolean;
}

export interface FlowFieldHandle {
  /** Smoothly scales physics + border angular speed (1 = normal). */
  setSpeedScale: (scale: number) => void;
  /**
   * Drives the 3-phase 1s dissolve choreography inside the tile canvas:
   * - `< 0`: normal active loading state
   * - `0..0.36`: rainbow border glow & clouds rush inward and swirl/mix with the 9 Monet clouds
   * - `0.35..1.0`: everything peels off one after another along a similar random escape direction off-screen
   */
  setExitProgress: (progress: number) => void;
  /** Updates palette / theme colors without resetting blob positions or border phase. */
  updateAppearance: (colors: string[], frostColor: string, rainbowStops: RainbowStop[], isDark: boolean) => void;
  /** Unregisters the tile and stops the loop if it was the last mounted tile. */
  destroy: () => void;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  nextForceAt: number;
  phase: number;
  sprite: HTMLCanvasElement;
  burstAngle: number;
  burstSpeed: number;
  departAt: number;
}

interface Field {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  blobs: Blob[];
  exitRainbowBlobs: Blob[];
  rainbowStops: RainbowStop[];
  frostColor: string;
  /** Pure soft feathered gradient rainbow border glow (zero hard rim, zero corner distortion). */
  haloDisk: HTMLCanvasElement | null;
  /** Circular soft-feathered rainbow ring (alpha = 0 at outer edge -> zero square artifacts ever). */
  exitRingDisk: HTMLCanvasElement | null;
  isDark: boolean;
  borderAngle: number;
  borderVel: number;
  borderTargetVel: number;
  nextBorderRetargetAt: number;
  speedScale: number;
  exitProgress: number;
  exitSwirlDir: number;
  exitMixOffsetX: number;
  exitMixOffsetY: number;
  exitHeading: number;
  visible: boolean;
  lastStepAt: number;
  lastPaintAt: number;
}

/** Tiny soft-gradient canvas (~20 KB VRAM/tile, silky bilinear upscaled to any aspect ratio). */
const CANVAS_W = 64;
const CANVAS_H = 80;
const HALF_W = CANVAS_W / 2;
const HALF_H = CANVAS_H / 2;
const CLOUD_W = 32;
const CLOUD_H = 40;
const SPRITE_SIZE = 32;
const HALO_DISK_SIZE = 96;
const MAX_SPRITE_CACHE = 96;

/** Per-tile cadence (~31 FPS steady-state; auto-adapts to ~22 FPS on weak CPUs; 60 FPS on 1s exit). */
const FAST_TILE_FRAME_MS = 32;
const SLOW_TILE_FRAME_MS = 45;
const FAST_TILES_PER_TICK = 2;
const LOW_END_HW = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;

const spriteCache = new Map<string, HTMLCanvasElement>();
let sharedCloudCanvas: HTMLCanvasElement | null = null;
let sharedCloudCtx: CanvasRenderingContext2D | null = null;
let sharedIo: IntersectionObserver | null = null;
const elToField = new WeakMap<Element, Field>();

const fields: Field[] = [];
let roundRobin = 0;
let raf = 0;
let lastWindAt = 0;
let paintCostEwmaMs = LOW_END_HW ? 6 : 1.2;

const wind = { x: 0, y: 0, tx: 0, ty: 0, nextAt: 0 };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function parseRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}

function getBlobSprite(hex: string): HTMLCanvasElement {
  const key = hex.toLowerCase();
  const cached = spriteCache.get(key);
  if (cached) return cached;

  if (spriteCache.size >= MAX_SPRITE_CACHE) {
    const oldest = spriteCache.keys().next().value;
    if (oldest !== undefined) spriteCache.delete(oldest);
  }

  const off = document.createElement('canvas');
  off.width = SPRITE_SIZE;
  off.height = SPRITE_SIZE;
  const ctx = off.getContext('2d');
  if (ctx) {
    const half = SPRITE_SIZE / 2;
    const rgb = parseRgb(hex);
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    if (rgb) {
      const [r, g, b] = rgb;
      grad.addColorStop(0, `rgba(${r},${g},${b},0.74)`);
      grad.addColorStop(0.32, `rgba(${r},${g},${b},0.38)`);
      grad.addColorStop(0.68, `rgba(${r},${g},${b},0.10)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    } else {
      grad.addColorStop(0, hex);
      grad.addColorStop(1, 'transparent');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }
  spriteCache.set(key, off);
  return off;
}

function getCloudBuffer(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (sharedCloudCanvas && sharedCloudCtx) {
    return { canvas: sharedCloudCanvas, ctx: sharedCloudCtx };
  }
  const c = document.createElement('canvas');
  c.width = CLOUD_W;
  c.height = CLOUD_H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  sharedCloudCanvas = c;
  sharedCloudCtx = ctx;
  return { canvas: c, ctx };
}

/**
 * Pre-bakes two pure-gradient rainbow disks once per tile/theme:
 * - `haloDisk` (96×96): luminous rainbow smoothly fading from transparent center to glowing outer
 *   perimeter — creates pure soft gradient rainbow borders on ANY aspect ratio with zero hard rim.
 * - `exitRingDisk` (96×96): smooth circular Gaussian rainbow ring (alpha = 0 before outer edge)
 *   for the 1-second gather -> mix -> off-screen stream dissolve.
 */
function bakeRainbowDisks(stops: RainbowStop[]): {
  haloDisk: HTMLCanvasElement | null;
  exitRingDisk: HTMLCanvasElement | null;
} {
  if (stops.length === 0) return { haloDisk: null, exitRingDisk: null };

  const base = document.createElement('canvas');
  base.width = HALO_DISK_SIZE;
  base.height = HALO_DISK_SIZE;
  const bctx = base.getContext('2d');
  if (!bctx || typeof bctx.createConicGradient !== 'function') {
    return { haloDisk: null, exitRingDisk: null };
  }

  const half = HALO_DISK_SIZE / 2;
  const grad = bctx.createConicGradient(-Math.PI / 2, half, half);
  for (let i = 0; i < stops.length; i += 1) {
    const s = stops[i]!;
    grad.addColorStop(s.pos, s.color);
  }
  grad.addColorStop(1, stops[0]!.color);
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, HALO_DISK_SIZE, HALO_DISK_SIZE);

  // Pure soft gradient border halo: clear center -> gentle inner bloom -> vivid glowing edges.
  const halo = document.createElement('canvas');
  halo.width = HALO_DISK_SIZE;
  halo.height = HALO_DISK_SIZE;
  const hctx = halo.getContext('2d');
  if (hctx) {
    hctx.drawImage(base, 0, 0);
    hctx.globalCompositeOperation = 'destination-in';
    const mask = hctx.createRadialGradient(half, half, half * 0.34, half, half, half);
    mask.addColorStop(0, 'rgba(255,255,255,0)');
    mask.addColorStop(0.30, 'rgba(255,255,255,0.14)');
    mask.addColorStop(0.56, 'rgba(255,255,255,0.48)');
    mask.addColorStop(0.80, 'rgba(255,255,255,0.86)');
    mask.addColorStop(1, 'rgba(255,255,255,1)');
    hctx.fillStyle = mask;
    hctx.fillRect(0, 0, HALO_DISK_SIZE, HALO_DISK_SIZE);
  }

  // Soft circular Gaussian ring reaching alpha = 0 before r = 0.96 (zero square edges ever).
  const exitRing = document.createElement('canvas');
  exitRing.width = HALO_DISK_SIZE;
  exitRing.height = HALO_DISK_SIZE;
  const ectx = exitRing.getContext('2d');
  if (ectx) {
    ectx.drawImage(base, 0, 0);
    ectx.globalCompositeOperation = 'destination-in';
    const ringMask = ectx.createRadialGradient(half, half, 0, half, half, half);
    ringMask.addColorStop(0, 'rgba(255,255,255,0)');
    ringMask.addColorStop(0.24, 'rgba(255,255,255,0.18)');
    ringMask.addColorStop(0.52, 'rgba(255,255,255,0.78)');
    ringMask.addColorStop(0.74, 'rgba(255,255,255,0.34)');
    ringMask.addColorStop(0.95, 'rgba(255,255,255,0)');
    ringMask.addColorStop(1, 'rgba(255,255,255,0)');
    ectx.fillStyle = ringMask;
    ectx.fillRect(0, 0, HALO_DISK_SIZE, HALO_DISK_SIZE);
  }

  return { haloDisk: halo, exitRingDisk: exitRing };
}

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (sharedIo) return sharedIo;
  sharedIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const f = elToField.get(e.target);
        if (f) f.visible = e.isIntersecting;
      }
      ensureRunning();
    },
    { rootMargin: '60px' }
  );
  return sharedIo;
}

function retargetWind(now: number): void {
  const angle = Math.random() * Math.PI * 2;
  const strength = rand(0.55, 1.65);
  wind.tx = Math.cos(angle) * strength;
  wind.ty = Math.sin(angle) * strength;
  wind.nextAt = now + rand(800, 2000);
}

function retargetBorderVel(field: Field, now: number, allowFlip: boolean): void {
  const currentSign = field.borderVel >= 0 ? 1 : -1;
  const sign = allowFlip && Math.random() < 0.28 ? -currentSign : currentSign;
  field.borderTargetVel = sign * rand(0.55, 2.45);
  field.nextBorderRetargetAt = now + rand(1200, 3200);
}

/** Seeds soft rainbow cloud puffs right along the 4 edges and assigns staggered flocking escapes. */
function seedExitDissolve(field: Field): void {
  const stops = field.rainbowStops;
  const mixX = 0.5 + field.exitMixOffsetX;
  const mixY = 0.5 + field.exitMixOffsetY;
  const heading = field.exitHeading;

  field.exitRainbowBlobs = stops.map((s) => {
    const ang = field.borderAngle - Math.PI / 2 + s.pos * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const scale = 0.5 / Math.max(Math.abs(ca), Math.abs(sa), 0.001);
    const x = 0.5 + ca * scale;
    const y = 0.5 + sa * scale;
    return {
      x,
      y,
      vx: (mixX - x) * rand(3.0, 4.2) + (Math.random() - 0.5) * 0.8,
      vy: (mixY - y) * rand(3.0, 4.2) + (Math.random() - 0.5) * 0.8,
      fx: 0,
      fy: 0,
      nextForceAt: 0,
      phase: Math.random() * Math.PI * 2,
      sprite: getBlobSprite(s.color),
      burstAngle: heading,
      burstSpeed: 6,
      departAt: 0.4,
    };
  });

  const all = [...field.blobs, ...field.exitRainbowBlobs];
  const order = all.map((_, idx) => idx);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const n = Math.max(1, order.length - 1);
  for (let rank = 0; rank < order.length; rank += 1) {
    const b = all[order[rank]!]!;
    const frac = rank / n;
    b.departAt = 0.35 + frac * 0.23;
    b.burstAngle = heading + (Math.random() - 0.5) * 0.56;
    b.burstSpeed = rand(4.6, 8.8) * (1.12 - frac * 0.22);
  }
}

function advanceField(field: Field, now: number): void {
  const rawDt = Math.min(0.05, (now - (field.lastStepAt || now)) / 1000);
  field.lastStepAt = now;
  const p = field.exitProgress;

  if (p >= 0) {
    const swirl = field.exitSwirlDir;
    const mixCenterX = 0.5 + field.exitMixOffsetX;
    const mixCenterY = 0.5 + field.exitMixOffsetY;

    const stepGroup = (list: Blob[], isRainbow: boolean) => {
      for (let i = 0; i < list.length; i += 1) {
        const b = list[i]!;
        if (p < b.departAt) {
          const dx = mixCenterX - b.x;
          const dy = mixCenterY - b.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const inward = (isRainbow ? 15.0 : 9.8) * (1 - smoothstep(0.24, b.departAt, p));
          const tangX = (-dy / dist) * swirl * (isRainbow ? 7.2 : 5.6);
          const tangY = (dx / dist) * swirl * (isRainbow ? 7.2 : 5.6);
          const jitterX = Math.sin(now * 0.03 + b.phase * 3.7) * 4.8;
          const jitterY = Math.cos(now * 0.034 + b.phase * 2.9) * 4.8;
          const damp = Math.exp(-rawDt * 3.2);
          b.vx = (b.vx + (dx * inward + tangX + jitterX) * rawDt) * damp;
          b.vy = (b.vy + (dy * inward + tangY + jitterY) * rawDt) * damp;
        } else {
          const since = Math.min(1, (p - b.departAt) / Math.max(0.15, 1 - b.departAt));
          const targetVx = Math.cos(b.burstAngle) * b.burstSpeed * (0.85 + since * 1.65);
          const targetVy = Math.sin(b.burstAngle) * b.burstSpeed * (0.85 + since * 1.65);
          const ease = 1 - Math.exp(-rawDt * 12.5);
          b.vx += (targetVx - b.vx) * ease;
          b.vy += (targetVy - b.vy) * ease;
        }
        b.x += b.vx * rawDt;
        b.y += b.vy * rawDt;
      }
    };

    stepGroup(field.blobs, false);
    stepGroup(field.exitRainbowBlobs, true);

    const spinMult = p < 0.42 ? 2.8 + p * 5.2 : 4.8 + (p - 0.42) * 6.5;
    const baseSpin = Math.abs(field.borderVel) > 0.6 ? field.borderVel : swirl * 1.4;
    field.borderAngle = (field.borderAngle + baseSpin * spinMult * rawDt) % (Math.PI * 2);
    return;
  }

  const dt = rawDt * field.speedScale;
  const damping = Math.exp(-dt * 1.9);

  for (let i = 0; i < field.blobs.length; i += 1) {
    const b = field.blobs[i]!;
    if (now >= b.nextForceAt) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.32, 1.45);
      b.fx = Math.cos(a) * s;
      b.fy = Math.sin(a) * s;
      b.nextForceAt = now + rand(400, 1200);
    }
    const pullX = b.x < 0.05 ? (0.05 - b.x) * 6 : b.x > 0.95 ? (0.95 - b.x) * 6 : 0;
    const pullY = b.y < 0.05 ? (0.05 - b.y) * 6 : b.y > 0.95 ? (0.95 - b.y) * 6 : 0;
    b.vx = (b.vx + (wind.x * 0.9 + b.fx + pullX) * dt) * damping;
    b.vy = (b.vy + (wind.y * 0.9 + b.fy + pullY) * dt) * damping;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  if (now >= field.nextBorderRetargetAt) {
    retargetBorderVel(field, now, true);
  }
  const borderEase = 1 - Math.exp(-rawDt * 2.1);
  field.borderVel += (field.borderTargetVel - field.borderVel) * borderEase;
  field.borderAngle = (field.borderAngle + field.borderVel * dt) % (Math.PI * 2);
}

function renderField(field: Field, now: number): void {
  const { ctx, blobs, exitRainbowBlobs, frostColor, haloDisk, exitRingDisk, isDark } = field;
  const p = field.exitProgress;

  const frostAlpha = p < 0 ? 1 : 1 - smoothstep(0.15, 0.72, p);
  const cloudAlpha = p < 0 ? 1 : 1 - smoothstep(0.58, 0.98, p);
  const rainbowCloudAlpha = p < 0 ? 0 : smoothstep(0.0, 0.16, p) * (1 - smoothstep(0.56, 0.96, p));

  // 1. Frosted wash + 9 Monet clouds (+ rainbow edge clouds during dissolve) on tiny 32×40 buffer.
  const buf = getCloudBuffer();
  if (buf) {
    const bctx = buf.ctx;
    bctx.clearRect(0, 0, CLOUD_W, CLOUD_H);
    if (frostAlpha > 0.01) {
      bctx.globalAlpha = frostAlpha;
      bctx.fillStyle = frostColor;
      bctx.fillRect(0, 0, CLOUD_W, CLOUD_H);
    }

    const baseRadius = Math.max(CLOUD_W, CLOUD_H) * 0.56;
    if (cloudAlpha > 0.01) {
      bctx.globalAlpha = cloudAlpha;
      const exitScaleMod =
        p < 0 ? 1 : p < 0.45 ? 1 - smoothstep(0, 0.45, p) * 0.14 : 0.86 + smoothstep(0.45, 1, p) * 0.45;
      for (let i = 0; i < blobs.length; i += 1) {
        const b = blobs[i]!;
        const speed = Math.hypot(b.vx, b.vy);
        const scale = (0.86 + Math.min(0.48, speed * 0.58) + Math.sin(now / 900 + b.phase) * 0.08) * exitScaleMod;
        const rad = baseRadius * scale;
        bctx.drawImage(b.sprite, b.x * CLOUD_W - rad, b.y * CLOUD_H - rad, rad * 2, rad * 2);
      }
    }

    if (rainbowCloudAlpha > 0.01 && exitRainbowBlobs.length > 0) {
      bctx.globalAlpha = rainbowCloudAlpha * (isDark ? 0.92 : 0.82);
      const rbRadius = Math.max(CLOUD_W, CLOUD_H) * (p < 0.45 ? 0.42 : 0.48);
      for (let i = 0; i < exitRainbowBlobs.length; i += 1) {
        const b = exitRainbowBlobs[i]!;
        const speed = Math.hypot(b.vx, b.vy);
        const scale = 0.8 + Math.min(0.55, speed * 0.14);
        const rad = rbRadius * scale;
        bctx.drawImage(b.sprite, b.x * CLOUD_W - rad, b.y * CLOUD_H - rad, rad * 2, rad * 2);
      }
    }
    bctx.globalAlpha = 1;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(buf.canvas, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (frostAlpha > 0.01) {
      ctx.globalAlpha = frostAlpha;
      ctx.fillStyle = frostColor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
  }

  // 2. Pure soft gradient rainbow borders (zero hard rim line, zero corner distortion).
  if (p < 0) {
    if (haloDisk) {
      ctx.save();
      ctx.translate(HALF_W, HALF_H);
      ctx.scale(1, CANVAS_H / CANVAS_W);
      ctx.rotate(field.borderAngle);
      ctx.globalAlpha = isDark ? 0.84 : 0.72;
      const haloSide = CANVAS_W * 1.48;
      ctx.drawImage(haloDisk, -haloSide / 2, -haloSide / 2, haloSide, haloSide);
      ctx.restore();
    }
  } else {
    const edgeFade = 1 - smoothstep(0.0, 0.28, p);
    if (haloDisk && edgeFade > 0.01) {
      ctx.save();
      ctx.translate(HALF_W, HALF_H);
      ctx.scale(1, CANVAS_H / CANVAS_W);
      ctx.rotate(field.borderAngle);
      ctx.globalAlpha = (isDark ? 0.84 : 0.72) * edgeFade;
      const haloSide = CANVAS_W * 1.48;
      ctx.drawImage(haloDisk, -haloSide / 2, -haloSide / 2, haloSide, haloSide);
      ctx.restore();
    }

    if (exitRingDisk) {
      const inT = smoothstep(0.0, 0.36, p);
      const outT = smoothstep(0.40, 1.0, p);
      const travel = outT * outT * Math.max(CANVAS_W, CANVAS_H) * 1.65;
      const cx = HALF_W + field.exitMixOffsetX * CANVAS_W * inT + Math.cos(field.exitHeading) * travel;
      const cy = HALF_H + field.exitMixOffsetY * CANVAS_H * inT + Math.sin(field.exitHeading) * travel;
      const ringScale = p < 0.40 ? 1.75 - inT * 0.99 : 0.76 + outT * 0.42;
      const ringAlpha = smoothstep(0.02, 0.20, p) * (1 - smoothstep(0.58, 0.96, p)) * (isDark ? 0.75 : 0.62);
      if (ringAlpha > 0.01) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, CANVAS_H / CANVAS_W);
        ctx.rotate(field.borderAngle * 1.2);
        ctx.globalAlpha = ringAlpha;
        const side = CANVAS_W * ringScale;
        ctx.drawImage(exitRingDisk, -side / 2, -side / 2, side, side);
        ctx.restore();
      }
    }
  }
}

function step(now: number): void {
  // Yield completely to Android's software keyboard slide animation so opening/closing IME never stutters.
  if (isKeyboardAnimating()) {
    raf = 0;
    return;
  }

  const windDt = Math.min(0.05, (now - (lastWindAt || now)) / 1000);
  lastWindAt = now;
  if (now >= wind.nextAt) retargetWind(now);
  const windEase = 1 - Math.exp(-windDt * 3.2);
  wind.x += (wind.tx - wind.x) * windEase;
  wind.y += (wind.ty - wind.y) * windEase;

  const total = fields.length;
  const slowDevice = paintCostEwmaMs > 5.5;
  const frameInterval = slowDevice ? SLOW_TILE_FRAME_MS : FAST_TILE_FRAME_MS;
  const maxPerTick = slowDevice ? 1 : FAST_TILES_PER_TICK;
  let anyVisible = false;
  let painted = 0;

  for (let offset = 0; offset < total; offset += 1) {
    const idx = (roundRobin + offset) % total;
    const field = fields[idx]!;
    if (!field.visible) continue;
    anyVisible = true;
    const exiting = field.exitProgress >= 0;
    const due = exiting ? now - field.lastPaintAt >= 15.5 : painted < maxPerTick && now - field.lastPaintAt >= frameInterval;
    if (due) {
      const t0 = performance.now();
      advanceField(field, now);
      renderField(field, now);
      const cost = performance.now() - t0;
      if (!exiting) {
        paintCostEwmaMs = paintCostEwmaMs * 0.85 + cost * 0.15;
        painted += 1;
        roundRobin = (idx + 1) % total;
      }
      field.lastPaintAt = now;
    }
  }

  raf = anyVisible && document.visibilityState === 'visible' ? requestAnimationFrame(step) : 0;
}

function ensureRunning(): void {
  if (raf || fields.length === 0 || isKeyboardAnimating() || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
  if (!fields.some((f) => f.visible)) return;
  lastWindAt = 0;
  raf = requestAnimationFrame(step);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ensureRunning();
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  onKeyboardInsetChange(() => {
    if (!isKeyboardAnimating()) ensureRunning();
  });
}

/** Registers a tile veil canvas with the shared staggered flow engine. */
export function attachFlowField(opts: FlowFieldOptions): FlowFieldHandle {
  const { canvas, colors, frostColor, rainbowStops, isDark, reducedMotion } = opts;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    return {
      setSpeedScale: () => {},
      setExitProgress: () => {},
      updateAppearance: () => {},
      destroy: () => {},
    };
  }

  const initialDir = Math.random() < 0.5 ? 1 : -1;
  const initialVel = initialDir * rand(0.75, 2.25);
  const now = performance.now();
  const { haloDisk, exitRingDisk } = bakeRainbowDisks(rainbowStops);

  const blobs: Blob[] = colors.map((c) => ({
    x: rand(0.1, 0.9),
    y: rand(0.1, 0.9),
    vx: rand(-0.3, 0.3),
    vy: rand(-0.3, 0.3),
    fx: 0,
    fy: 0,
    nextForceAt: 0,
    phase: Math.random() * Math.PI * 2,
    sprite: getBlobSprite(c),
    burstAngle: Math.random() * Math.PI * 2,
    burstSpeed: rand(4.6, 8.8),
    departAt: 0.4,
  }));

  const field: Field = {
    canvas,
    ctx,
    blobs,
    exitRainbowBlobs: [],
    rainbowStops,
    frostColor,
    haloDisk,
    exitRingDisk,
    isDark,
    borderAngle: Math.random() * Math.PI * 2,
    borderVel: initialVel,
    borderTargetVel: initialVel,
    nextBorderRetargetAt: now + rand(1200, 3000),
    speedScale: 1,
    exitProgress: -1,
    exitSwirlDir: Math.random() < 0.5 ? 1 : -1,
    exitMixOffsetX: rand(-0.12, 0.12),
    exitMixOffsetY: rand(-0.12, 0.12),
    exitHeading: Math.random() * Math.PI * 2,
    visible: true,
    lastStepAt: now,
    lastPaintAt: now - Math.random() * FAST_TILE_FRAME_MS,
  };

  renderField(field, now);

  if (!reducedMotion) {
    fields.push(field);
    elToField.set(canvas, field);
    getObserver()?.observe(canvas);
    if (wind.nextAt === 0) retargetWind(now);
    ensureRunning();
  }

  return {
    setSpeedScale(scale: number) {
      field.speedScale = Math.max(0.05, Math.min(1, scale));
    },
    setExitProgress(progress: number) {
      if (progress < 0) {
        field.exitProgress = -1;
        field.exitRainbowBlobs = [];
        return;
      }
      if (field.exitProgress < 0) {
        field.exitSwirlDir = Math.random() < 0.5 ? 1 : -1;
        field.exitMixOffsetX = rand(-0.12, 0.12);
        field.exitMixOffsetY = rand(-0.12, 0.12);
        field.exitHeading = Math.random() * Math.PI * 2;
        seedExitDissolve(field);
      }
      field.exitProgress = clamp01(progress);
      if (reducedMotion) renderField(field, performance.now());
    },
    updateAppearance(nextColors: string[], nextFrost: string, nextRainbowStops: RainbowStop[], nextIsDark: boolean) {
      field.frostColor = nextFrost;
      field.rainbowStops = nextRainbowStops;
      const disks = bakeRainbowDisks(nextRainbowStops);
      field.haloDisk = disks.haloDisk;
      field.exitRingDisk = disks.exitRingDisk;
      field.isDark = nextIsDark;
      for (let i = 0; i < field.blobs.length && i < nextColors.length; i += 1) {
        field.blobs[i]!.sprite = getBlobSprite(nextColors[i]!);
      }
      if (reducedMotion) renderField(field, performance.now());
    },
    destroy() {
      getObserver()?.unobserve(canvas);
      elToField.delete(canvas);
      const idx = fields.indexOf(field);
      if (idx !== -1) fields.splice(idx, 1);
      if (fields.length === 0 && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
