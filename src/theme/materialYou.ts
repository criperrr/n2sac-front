import {
  argbFromHex,
  hexFromArgb,
  Hct,
  SchemeTonalSpot,
  SchemeVibrant,
  Blend,
} from '@material/material-color-utilities';

export type DesignSystemMode = 'default' | 'material-you';
export type ThemeMode = 'system' | 'adaptive' | 'dark' | 'light' | 'amoled';
export type PaletteStyle = 'editorial' | 'tonalSpot' | 'expressive' | 'vibrant';
export type IconShapeVariant = 'squircle' | 'cookie6' | 'clover' | 'pill' | 'pentagon' | 'random';
export type AvatarShapeVariant = 'circle' | 'squircle' | 'rounded' | 'square';

export function resolveAvatarRadius(shape: AvatarShapeVariant | undefined, size: number): string {
  switch (shape) {
    case 'squircle':
      return `${Math.round(size * 0.34)}px`;
    case 'rounded':
      return `${Math.round(size * 0.24)}px`;
    case 'square':
      return `${Math.max(4, Math.round(size * 0.1))}px`;
    case 'circle':
    default:
      return '50%';
  }
}

export const EDITORIAL_PRESET_ID = 'editorial-default';
export const EDITORIAL_SEED_HEX = '#10A37F';

export interface AndroidDynamicColorPayload {
  seedHex: string;
  secondaryHex?: string;
  tertiaryHex?: string;
  isSystemDark?: boolean;
  source?: 'android-aosp' | 'css-accent';
}

declare global {
  interface Window {
    __NSAC_ANDROID_DYNAMIC_COLOR__?: string | AndroidDynamicColorPayload;
  }
}

export interface AperturePalettePreset {
  id: string;
  label: string;
  courseTag?: string;
  seedHex: string;
  primaryPreview: string;
  secondaryPreview: string;
  tertiaryPreview: string;
  isEditorial?: boolean;
}

export const APERTURE_PALETTE_PRESETS: AperturePalettePreset[] = [
  {
    id: EDITORIAL_PRESET_ID,
    label: 'Padrão (Grafite & Marfim)',
    courseTag: 'Editorial',
    seedHex: EDITORIAL_SEED_HEX,
    primaryPreview: '#10A37F',
    secondaryPreview: '#0D0D0D',
    tertiaryPreview: '#F5F5F5',
    isEditorial: true,
  },
  {
    id: 'cti-info',
    label: 'Azul Informática',
    courseTag: 'INI / INF',
    seedHex: '#3B82F6',
    primaryPreview: '#A9C7FF',
    secondaryPreview: '#B7D9FF',
    tertiaryPreview: '#BFC1FF',
  },
  {
    id: 'cti-eletronica',
    label: 'Âmbar Eletrônica',
    courseTag: 'ELI / ELE',
    seedHex: '#F59E0B',
    primaryPreview: '#FFB86B',
    secondaryPreview: '#FFD0A0',
    tertiaryPreview: '#FFC875',
  },
  {
    id: 'cti-mecanica',
    label: 'Esmeralda Mecânica',
    courseTag: 'MEI / MEC',
    seedHex: '#10B981',
    primaryPreview: '#7DDA9A',
    secondaryPreview: '#A4DDB5',
    tertiaryPreview: '#B9D98B',
  },
  {
    id: 'aperture-purple',
    label: 'Violeta Clássico',
    courseTag: 'Dinâmico',
    seedHex: '#7C4DFF',
    primaryPreview: '#D0BCFF',
    secondaryPreview: '#CCC2DC',
    tertiaryPreview: '#EFB8C8',
  },
  {
    id: 'ocean-teal',
    label: 'Ciano Oceano',
    seedHex: '#06B6D4',
    primaryPreview: '#7CD8D2',
    secondaryPreview: '#A4DCD7',
    tertiaryPreview: '#B8D6A5',
  },
  {
    id: 'cinema-red',
    label: 'Coral Intenso',
    seedHex: '#EF4444',
    primaryPreview: '#FFB4AB',
    secondaryPreview: '#FFC9C3',
    tertiaryPreview: '#FFC17D',
  },
  {
    id: 'neon-pink',
    label: 'Rosa Suave',
    seedHex: '#EC4899',
    primaryPreview: '#FFB0D0',
    secondaryPreview: '#FFC5D9',
    tertiaryPreview: '#D6BCFF',
  },
];

export interface AdaptiveLuxStep {
  id: string;
  label: string;
  lux: number;
  description: string;
}

export const ADAPTIVE_LUX_STEPS: AdaptiveLuxStep[] = [
  { id: 'DARK', label: 'Escuridão Total', lux: 0, description: '0 lx • Quarto escuro' },
  { id: 'DIM', label: 'Penumbra', lux: 1, description: '1 lx • Luz noturna mínima' },
  { id: 'SOFT', label: 'Luz Suave', lux: 10, description: '10 lx • Ambiente interno noturno' },
  { id: 'BRIGHT', label: 'Iluminado', lux: 100, description: '100 lx • Sala de aula / Laboratório CTI' },
  { id: 'DAYLIGHT', label: 'Luz do Dia', lux: 1000, description: '1.000 lx • Pátio coberto / Janela' },
  { id: 'SUNLIGHT', label: 'Sol Direto', lux: 10000, description: '10.000 lx • Área externa UNESP' },
];

export interface M3ColorTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  gradeSuccess: string;
  onGradeSuccess: string;
  gradeSuccessContainer: string;
  onGradeSuccessContainer: string;
  gradeWarning: string;
  onGradeWarning: string;
  gradeWarningContainer: string;
  onGradeWarningContainer: string;
  mixedContainer: string;
  onMixedContainer: string;
}

export function normalizeHexColor(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Number(rgbMatch[1])));
    const g = Math.max(0, Math.min(255, Number(rgbMatch[2])));
    const b = Math.max(0, Math.min(255, Number(rgbMatch[3])));
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return null;
}

/**
 * Probes Android AOSP / System Dynamic Color from:
 * 1. Native Android 12+ (API 31+) bridge (`window.__NSAC_ANDROID_DYNAMIC_COLOR__` injected from `android.R.color.system_accent1_500`)
 * 2. CSS `AccentColor` system keyword exposed by the OS / Chromium WebView
 */
export function probeSystemDynamicColor(): AndroidDynamicColorPayload | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const nativeBridge = window.__NSAC_ANDROID_DYNAMIC_COLOR__;
  if (nativeBridge) {
    if (typeof nativeBridge === 'string') {
      const hex = normalizeHexColor(nativeBridge);
      if (hex) {
        return { seedHex: hex, source: 'android-aosp' };
      }
    } else if (typeof nativeBridge === 'object' && nativeBridge.seedHex) {
      const hex = normalizeHexColor(nativeBridge.seedHex);
      if (hex) {
        return {
          seedHex: hex,
          secondaryHex: normalizeHexColor(nativeBridge.secondaryHex) ?? undefined,
          tertiaryHex: normalizeHexColor(nativeBridge.tertiaryHex) ?? undefined,
          isSystemDark: nativeBridge.isSystemDark,
          source: 'android-aosp',
        };
      }
    }
  }

  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      if (!CSS.supports('color', 'AccentColor')) return null;
    }
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.pointerEvents = 'none';
    probe.style.backgroundColor = 'rgb(1, 2, 3)';
    probe.style.backgroundColor = 'AccentColor';
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe).backgroundColor;
    document.body.removeChild(probe);

    if (computed && computed !== 'rgb(1, 2, 3)' && computed !== 'rgba(0, 0, 0, 0)') {
      const hex = normalizeHexColor(computed);
      if (hex) {
        return { seedHex: hex, source: 'css-accent' };
      }
    }
  } catch {
    // ignore DOM probe error
  }

  return null;
}

export function detectCoursePresetFromClassCode(classCode?: string | null): AperturePalettePreset {
  const normalized = (classCode ?? '').trim().toUpperCase();
  if (normalized.startsWith('ELI') || normalized.startsWith('ELE')) {
    return APERTURE_PALETTE_PRESETS.find((p) => p.id === 'cti-eletronica') ?? APERTURE_PALETTE_PRESETS[0]!;
  }
  if (normalized.startsWith('MEI') || normalized.startsWith('MEC')) {
    return APERTURE_PALETTE_PRESETS.find((p) => p.id === 'cti-mecanica') ?? APERTURE_PALETTE_PRESETS[0]!;
  }
  if (normalized.startsWith('INI') || normalized.startsWith('INF')) {
    return APERTURE_PALETTE_PRESETS.find((p) => p.id === 'cti-info') ?? APERTURE_PALETTE_PRESETS[0]!;
  }
  return APERTURE_PALETTE_PRESETS[0]!;
}

/**
 * Generates exact OpenAI Design System (`nexu-io/open-design/design-systems/openai`)
 * monochrome neutral surfaces + hairline borders + `#10a37f` Teal accent + `#0d0d0d` Ink Black,
 * mapped seamlessly onto all 34 Material 3 tokens so spring physics & components remain 100% alive.
 */
export function generateEditorialColorTokens(
  isDark: boolean,
  isAmoled: boolean,
  contrastLevel: number = 0,
  seedHex: string = EDITORIAL_SEED_HEX
): M3ColorTokens {
  const highContrast = contrastLevel >= 0.4;
  const accentHex = normalizeHexColor(seedHex) ?? EDITORIAL_SEED_HEX;
  let accentArgb: number;
  try {
    accentArgb = argbFromHex(accentHex);
  } catch {
    accentArgb = argbFromHex(EDITORIAL_SEED_HEX);
  }
  const accentHct = Hct.fromInt(accentArgb);
  const hctTone = (targetTone: number, minChroma = 36) =>
    hexFromArgb(Hct.from(accentHct.hue, Math.max(minChroma, accentHct.chroma), targetTone).toInt());

  const isDefaultTeal = accentHex.toUpperCase() === EDITORIAL_SEED_HEX;
  const darkPrimary = isDefaultTeal ? '#10A37F' : hctTone(72);
  const darkPrimaryContainer = isDefaultTeal ? '#0E2E26' : hctTone(22, 24);
  const darkOnPrimaryContainer = isDefaultTeal ? '#D1F4E8' : hctTone(90, 24);

  const lightAccent = isDefaultTeal ? '#10A37F' : hctTone(40);
  const lightPrimaryContainer = isDefaultTeal ? '#E8F5F0' : hctTone(92, 20);
  const lightOnPrimaryContainer = isDefaultTeal ? '#0A7A5E' : hctTone(22, 28);

  if (isDark) {
    return {
      primary: darkPrimary,
      onPrimary: isDefaultTeal ? '#FFFFFF' : '#0D0D0D',
      primaryContainer: darkPrimaryContainer,
      onPrimaryContainer: darkOnPrimaryContainer,
      inversePrimary: lightAccent,
      secondary: '#ECECEC',
      onSecondary: '#0D0D0D',
      secondaryContainer: '#212121',
      onSecondaryContainer: '#F5F5F5',
      tertiary: '#A3A3A3',
      onTertiary: '#0D0D0D',
      tertiaryContainer: '#262626',
      onTertiaryContainer: '#ECECEC',
      error: '#F87171',
      onError: '#2D090A',
      errorContainer: '#3B1214',
      onErrorContainer: '#FECACA',
      background: isAmoled ? '#000000' : '#0D0D0D',
      onBackground: '#F5F5F5',
      surface: isAmoled ? '#000000' : '#0D0D0D',
      onSurface: '#F5F5F5',
      surfaceVariant: isAmoled ? '#050505' : '#212121',
      onSurfaceVariant: highContrast ? '#D4D4D4' : '#A3A3A3',
      surfaceDim: isAmoled ? '#000000' : '#0A0A0A',
      surfaceBright: isAmoled ? '#0A0A0A' : '#1E1E1E',
      surfaceContainerLowest: isAmoled ? '#000000' : '#0A0A0A',
      surfaceContainerLow: isAmoled ? '#000000' : '#141414',
      surfaceContainer: isAmoled ? '#000000' : '#171717',
      surfaceContainerHigh: isAmoled ? '#030303' : '#1E1E1E',
      surfaceContainerHighest: isAmoled ? '#0D0D0D' : '#262626',
      outline: '#6E6E6E',
      outlineVariant: highContrast ? '#3C3C3C' : isAmoled ? '#1A1A1A' : '#262626',
      gradeSuccess: darkPrimary,
      onGradeSuccess: '#FFFFFF',
      gradeSuccessContainer: darkPrimaryContainer,
      onGradeSuccessContainer: darkOnPrimaryContainer,
      gradeWarning: '#F5A623',
      onGradeWarning: '#291800',
      gradeWarningContainer: '#382405',
      onGradeWarningContainer: '#FDE68A',
      mixedContainer: isAmoled ? '#000000' : '#1A1A1A',
      onMixedContainer: '#F5F5F5',
    };
  }

  return {
    primary: '#0D0D0D',
    onPrimary: '#FFFFFF',
    primaryContainer: lightPrimaryContainer,
    onPrimaryContainer: lightOnPrimaryContainer,
    inversePrimary: lightAccent,
    secondary: lightAccent,
    onSecondary: '#FFFFFF',
    secondaryContainer: '#ECECEC',
    onSecondaryContainer: '#0D0D0D',
    tertiary: '#3C3C3C',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#F5F5F5',
    onTertiaryContainer: '#1A1A1A',
    error: '#EF4146',
    onError: '#FFFFFF',
    errorContainer: '#FEE2E2',
    onErrorContainer: '#991B1B',
    background: '#FFFFFF',
    onBackground: '#0D0D0D',
    surface: '#FFFFFF',
    onSurface: '#0D0D0D',
    surfaceVariant: '#F5F5F5',
    onSurfaceVariant: highContrast ? '#3C3C3C' : '#6E6E6E',
    surfaceDim: '#ECECEC',
    surfaceBright: '#FFFFFF',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#FAFAFA',
    surfaceContainer: '#F5F5F5',
    surfaceContainerHigh: '#FFFFFF',
    surfaceContainerHighest: '#ECECEC',
    outline: '#9B9B9B',
    outlineVariant: highContrast ? '#C4C4C4' : '#E5E5E5',
    gradeSuccess: lightAccent,
    onGradeSuccess: '#FFFFFF',
    gradeSuccessContainer: lightPrimaryContainer,
    onGradeSuccessContainer: lightOnPrimaryContainer,
    gradeWarning: '#D97706',
    onGradeWarning: '#FFFFFF',
    gradeWarningContainer: '#FEF3C7',
    onGradeWarningContainer: '#92400E',
    mixedContainer: '#FAFAFA',
    onMixedContainer: '#1A1A1A',
  };
}

export function generateM3ColorTokens(
  seedHex: string,
  isDark: boolean,
  isAmoled: boolean,
  contrastLevel: number = 0,
  style: PaletteStyle = 'editorial'
): M3ColorTokens {
  if (style === 'editorial') {
    return generateEditorialColorTokens(isDark, isAmoled, contrastLevel, seedHex);
  }

  let seedArgb: number;
  try {
    seedArgb = argbFromHex(seedHex);
  } catch {
    seedArgb = argbFromHex('#7C4DFF');
  }

  const sourceHct = Hct.fromInt(seedArgb);
  const clampedContrast = Math.max(-1, Math.min(1, contrastLevel));

  const scheme =
    style === 'vibrant'
      ? new SchemeVibrant(sourceHct, isDark, clampedContrast)
      : new SchemeTonalSpot(sourceHct, isDark, clampedContrast);

  const p = scheme.primaryPalette;
  const s = scheme.secondaryPalette;
  const t = scheme.tertiaryPalette;
  const n = scheme.neutralPalette;
  const nv = scheme.neutralVariantPalette;
  const e = scheme.errorPalette;

  const rawGreenArgb = argbFromHex('#22C55E');
  const rawAmberArgb = argbFromHex('#F59E0B');
  const harmonizedGreen = Hct.fromInt(Blend.harmonize(rawGreenArgb, seedArgb));
  const harmonizedAmber = Hct.fromInt(Blend.harmonize(rawAmberArgb, seedArgb));

  const tone = (palette: { tone: (t: number) => number }, value: number) =>
    hexFromArgb(palette.tone(Math.max(0, Math.min(100, Math.round(value)))));

  const hctTone = (hct: Hct, targetTone: number) =>
    hexFromArgb(Hct.from(hct.hue, Math.max(28, hct.chroma), targetTone).toInt());

  const cShift = Math.round(clampedContrast * 8);

  if (isDark) {
    return {
      primary: tone(p, 80 + cShift),
      onPrimary: tone(p, 20 - cShift),
      primaryContainer: tone(p, 30),
      onPrimaryContainer: tone(p, 90),
      inversePrimary: tone(p, 40),
      secondary: tone(s, 80 + cShift),
      onSecondary: tone(s, 20 - cShift),
      secondaryContainer: tone(s, 30),
      onSecondaryContainer: tone(s, 90),
      tertiary: tone(t, 80 + cShift),
      onTertiary: tone(t, 20 - cShift),
      tertiaryContainer: tone(t, 30),
      onTertiaryContainer: tone(t, 90),
      error: tone(e, 80),
      onError: tone(e, 20),
      errorContainer: tone(e, 30),
      onErrorContainer: tone(e, 90),
      background: isAmoled ? '#000000' : tone(n, 6),
      onBackground: tone(n, 92),
      surface: isAmoled ? '#000000' : tone(n, 6),
      onSurface: tone(n, 93),
      surfaceVariant: isAmoled ? '#050505' : tone(nv, 30),
      onSurfaceVariant: tone(nv, 82),
      surfaceDim: isAmoled ? '#000000' : tone(n, 6),
      surfaceBright: isAmoled ? '#0A0A0A' : tone(n, 24),
      surfaceContainerLowest: isAmoled ? '#000000' : tone(n, 4),
      surfaceContainerLow: isAmoled ? '#000000' : tone(n, 10),
      surfaceContainer: isAmoled ? '#000000' : tone(n, 12),
      surfaceContainerHigh: isAmoled ? '#030303' : tone(n, 17),
      surfaceContainerHighest: isAmoled ? '#0D0D0D' : tone(n, 22),
      outline: tone(nv, 60),
      outlineVariant: isAmoled ? '#1C1C1C' : tone(nv, 30),
      gradeSuccess: hctTone(harmonizedGreen, 82),
      onGradeSuccess: hctTone(harmonizedGreen, 18),
      gradeSuccessContainer: hctTone(harmonizedGreen, 26),
      onGradeSuccessContainer: hctTone(harmonizedGreen, 92),
      gradeWarning: hctTone(harmonizedAmber, 82),
      onGradeWarning: hctTone(harmonizedAmber, 20),
      gradeWarningContainer: hctTone(harmonizedAmber, 28),
      onGradeWarningContainer: hctTone(harmonizedAmber, 92),
      mixedContainer: isAmoled ? '#000000' : tone(p, 24),
      onMixedContainer: tone(p, 92),
    };
  }

  return {
    primary: tone(p, 40 - cShift),
    onPrimary: '#FFFFFF',
    primaryContainer: tone(p, 90),
    onPrimaryContainer: tone(p, 12),
    inversePrimary: tone(p, 80),
    secondary: tone(s, 40 - cShift),
    onSecondary: '#FFFFFF',
    secondaryContainer: tone(s, 90),
    onSecondaryContainer: tone(s, 14),
    tertiary: tone(t, 40 - cShift),
    onTertiary: '#FFFFFF',
    tertiaryContainer: tone(t, 90),
    onTertiaryContainer: tone(t, 14),
    error: tone(e, 40),
    onError: '#FFFFFF',
    errorContainer: tone(e, 90),
    onErrorContainer: tone(e, 12),
    background: tone(n, 98),
    onBackground: tone(n, 10),
    surface: tone(n, 98),
    onSurface: tone(n, 10),
    surfaceVariant: tone(nv, 90),
    onSurfaceVariant: tone(nv, 30),
    surfaceDim: tone(n, 87),
    surfaceBright: tone(n, 98),
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: tone(n, 96),
    surfaceContainer: tone(n, 94),
    surfaceContainerHigh: tone(n, 92),
    surfaceContainerHighest: tone(n, 90),
    outline: tone(nv, 50),
    outlineVariant: tone(nv, 82),
    gradeSuccess: hctTone(harmonizedGreen, 34),
    onGradeSuccess: '#FFFFFF',
    gradeSuccessContainer: hctTone(harmonizedGreen, 90),
    onGradeSuccessContainer: hctTone(harmonizedGreen, 14),
    gradeWarning: hctTone(harmonizedAmber, 36),
    onGradeWarning: '#FFFFFF',
    gradeWarningContainer: hctTone(harmonizedAmber, 90),
    onGradeWarningContainer: hctTone(harmonizedAmber, 16),
    mixedContainer: tone(p, 92),
    onMixedContainer: tone(p, 16),
  };
}

/**
 * Harmonizes a semantic role/tag base hex color toward the active Material You (Monet)
 * seed/primary color using HCT tonal blending, returning accessible container/text/border colors.
 */
export function harmonizeRoleBadgeColors(
  baseHex: string,
  seedHex: string,
  isDark: boolean,
  harmonizeWithMonet: boolean
): { bg: string; fg: string; border: string } {
  const safeBase = /^#[0-9a-fA-F]{6}$/.test(baseHex) ? baseHex : '#6366F1';
  const safeSeed = /^#[0-9a-fA-F]{6}$/.test(seedHex) ? seedHex : '#6750A4';
  const baseArgb = argbFromHex(safeBase);
  const seedArgb = argbFromHex(safeSeed);
  const hct = Hct.fromInt(harmonizeWithMonet ? Blend.harmonize(baseArgb, seedArgb) : baseArgb);
  const chroma = Math.max(32, Math.min(64, hct.chroma));

  if (isDark) {
    return {
      bg: hexFromArgb(Hct.from(hct.hue, chroma, 24).toInt()),
      fg: hexFromArgb(Hct.from(hct.hue, Math.max(36, chroma), 90).toInt()),
      border: hexFromArgb(Hct.from(hct.hue, chroma, 42).toInt()),
    };
  }
  return {
    bg: hexFromArgb(Hct.from(hct.hue, chroma, 91).toInt()),
    fg: hexFromArgb(Hct.from(hct.hue, Math.max(40, chroma), 22).toInt()),
    border: hexFromArgb(Hct.from(hct.hue, chroma, 76).toInt()),
  };
}
