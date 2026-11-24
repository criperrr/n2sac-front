import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DesignSystemTransitionOverlay } from '../components/DesignSystemTransitionOverlay';
import {
  ADAPTIVE_LUX_STEPS,
  APERTURE_PALETTE_PRESETS,
  detectCoursePresetFromClassCode,
  EDITORIAL_PRESET_ID,
  EDITORIAL_SEED_HEX,
  generateM3ColorTokens,
  normalizeHexColor,
  probeSystemDynamicColor,
  type AndroidDynamicColorPayload,
  type AvatarShapeVariant,
  type DesignSystemMode,
  type IconShapeVariant,
  type M3ColorTokens,
  type PaletteStyle,
  type ThemeMode,
} from './materialYou';

const STORAGE_KEY = 'nsac_design_system_theme_v4';
const CUSTOMIZED_THEME_KEY = 'nsac_user_customized_theme_v1';

function resolveLauncherThemeKey(
  settings: AdaptiveThemeSettings,
  effectiveSeedHex: string,
  hasUserCustomized: boolean
): string {
  // Default fallback before user explicitly picks a theme in-app (or when following Android Monet):
  if (!hasUserCustomized || settings.useSystemDynamicColor) {
    return 'system';
  }
  if (settings.designSystem !== 'material-you' || settings.presetId === EDITORIAL_PRESET_ID) {
    return 'editorial';
  }
  switch (settings.presetId) {
    case 'cti-info':
      return 'blue';
    case 'cti-mecanica':
      return 'green';
    case 'aperture-purple':
      return 'purple';
    case 'ocean-teal':
      return 'teal';
    case 'cti-eletronica':
      return 'amber';
    case 'cinema-red':
      return 'coral';
    case 'neon-pink':
      return 'rose';
    default: {
      // Closest Monet hue family for custom color picker hexes
      const clean = effectiveSeedHex.replace('#', '');
      const r = parseInt(clean.slice(0, 2), 16) / 255;
      const g = parseInt(clean.slice(2, 4), 16) / 255;
      const b = parseInt(clean.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 0.08) return 'editorial';
      let h = 0;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      const deg = (h * 60 + 360) % 360;
      if (deg < 22 || deg >= 342) return 'coral';
      if (deg < 68) return 'amber';
      if (deg < 165) return 'green';
      if (deg < 205) return 'teal';
      if (deg < 252) return 'blue';
      if (deg < 305) return 'purple';
      return 'rose';
    }
  }
}

export interface AdaptiveThemeSettings {
  designSystem: DesignSystemMode;
  mode: ThemeMode;
  presetId: string;
  seedHex: string;
  useSystemDynamicColor: boolean;
  autoCourseSeed: boolean;
  paletteStyle: PaletteStyle;
  contrastLevel: number;
  iconShape: IconShapeVariant;
  avatarShape: AvatarShapeVariant;
  thresholdIndex: number;
  customThresholdLux: number | null;
  simulatedSensorLux: number;
  useRealAmbientSensor: boolean;
  stayDarkAtNight: boolean;
  nightStartMinutes: number;
  nightEndMinutes: number;
  amoledInAdaptiveDark: boolean;
}

export const DEFAULT_THEME_SETTINGS: AdaptiveThemeSettings = {
  designSystem: 'default',
  mode: 'system',
  presetId: EDITORIAL_PRESET_ID,
  seedHex: EDITORIAL_SEED_HEX,
  useSystemDynamicColor: false,
  autoCourseSeed: false,
  paletteStyle: 'editorial',
  contrastLevel: 0,
  iconShape: 'cookie6',
  avatarShape: 'circle',
  thresholdIndex: 3,
  customThresholdLux: null,
  simulatedSensorLux: 35,
  useRealAmbientSensor: true,
  stayDarkAtNight: true,
  nightStartMinutes: 21 * 60,
  nightEndMinutes: 6 * 60 + 30,
  amoledInAdaptiveDark: false,
};

export interface ThemeContextValue {
  settings: AdaptiveThemeSettings;
  isMaterialYou: boolean;
  isTransitioningDesignSystem: boolean;
  tokens: M3ColorTokens;
  effectiveSeedHex: string;
  systemDynamicColor: AndroidDynamicColorPayload | null;
  effectiveIsDark: boolean;
  effectiveIsAmoled: boolean;
  effectiveThresholdLux: number;
  currentLux: number;
  hasHardwareLightSensor: boolean;
  isWithinNightWindow: boolean;
  updateSettings: (patch: Partial<AdaptiveThemeSettings>) => void;
  switchDesignSystemWithAnimation: (target: DesignSystemMode, detectedClassCode?: string | null) => void;
  applyCourseClassCode: (classCode?: string | null) => void;
  refreshSystemDynamicColor: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function checkInNightWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes === endMinutes) return false;
  if (startMinutes > endMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AdaptiveThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_THEME_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_THEME_SETTINGS;
  });

  const [transitionTarget, setTransitionTarget] = useState<DesignSystemMode | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<'entering' | 'exiting' | null>(null);
  const transitionTimersRef = useRef<number[]>([]);

  const [systemDynamicColor, setSystemDynamicColor] =
    useState<AndroidDynamicColorPayload | null>(() => {
      const live = probeSystemDynamicColor();
      if (live) return live;
      try {
        const cached = localStorage.getItem('n2sac_last_android_monet_v1');
        if (cached) {
          const parsed = JSON.parse(cached) as AndroidDynamicColorPayload;
          if (parsed?.seedHex) return parsed;
        }
      } catch {
        // ignore
      }
      return null;
    });

  const [osPrefersDark, setOsPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [hardwareLux, setHardwareLux] = useState<number | null>(null);
  const [hasHardwareLightSensor, setHasHardwareLightSensor] = useState(false);

  const persistAndSetDynamicColor = useCallback((payload: AndroidDynamicColorPayload) => {
    setSystemDynamicColor(payload);
    try {
      localStorage.setItem('n2sac_last_android_monet_v1', JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, []);

  const refreshSystemDynamicColor = useCallback(() => {
    const detected = probeSystemDynamicColor();
    if (detected) {
      persistAndSetDynamicColor(detected);
      return;
    }
    try {
      const cached = localStorage.getItem('n2sac_last_android_monet_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as AndroidDynamicColorPayload;
        if (parsed?.seedHex) setSystemDynamicColor(parsed);
      }
    } catch {
      // ignore
    }
  }, [persistAndSetDynamicColor]);

  useEffect(() => {
    refreshSystemDynamicColor();

    const onAndroidColorEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<string | AndroidDynamicColorPayload>;
      const detail = customEvt.detail;
      if (typeof detail === 'string') {
        const hex = normalizeHexColor(detail);
        if (hex) {
          persistAndSetDynamicColor({ seedHex: hex, source: 'android-aosp' });
        }
      } else if (detail && typeof detail === 'object' && detail.seedHex) {
        const hex = normalizeHexColor(detail.seedHex);
        if (hex) {
          persistAndSetDynamicColor({
            seedHex: hex,
            secondaryHex: normalizeHexColor(detail.secondaryHex) ?? undefined,
            tertiaryHex: normalizeHexColor(detail.tertiaryHex) ?? undefined,
            isSystemDark: detail.isSystemDark,
            source: 'android-aosp',
          });
          if (typeof detail.isSystemDark === 'boolean') {
            setOsPrefersDark(detail.isSystemDark);
          }
        }
      } else {
        refreshSystemDynamicColor();
      }
    };

    window.addEventListener('nsac:android-dynamic-color', onAndroidColorEvent);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const onMediaChange = (e: MediaQueryListEvent) => {
      setOsPrefersDark(e.matches);
      refreshSystemDynamicColor();
    };

    mediaQuery?.addEventListener('change', onMediaChange);

    return () => {
      window.removeEventListener('nsac:android-dynamic-color', onAndroidColorEvent);
      mediaQuery?.removeEventListener('change', onMediaChange);
    };
  }, [refreshSystemDynamicColor]);

  useEffect(() => {
    if (!settings.useRealAmbientSensor) return;
    const win = window as unknown as {
      AmbientLightSensor?: new () => {
        illuminance?: number;
        addEventListener: (evt: string, cb: () => void) => void;
        start: () => void;
        stop: () => void;
      };
    };
    if (typeof win.AmbientLightSensor !== 'function') return;

    try {
      const sensor = new win.AmbientLightSensor();
      const onReading = () => {
        if (typeof sensor.illuminance === 'number') {
          setHardwareLux(sensor.illuminance);
          setHasHardwareLightSensor(true);
        }
      };
      sensor.addEventListener('reading', onReading);
      sensor.start();
      return () => {
        try {
          sensor.stop();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }, [settings.useRealAmbientSensor]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  const effectiveThresholdLux = useMemo(() => {
    if (settings.customThresholdLux !== null) {
      return settings.customThresholdLux;
    }
    return ADAPTIVE_LUX_STEPS[settings.thresholdIndex]?.lux ?? 100;
  }, [settings.customThresholdLux, settings.thresholdIndex]);

  const currentLux =
    settings.useRealAmbientSensor && hardwareLux !== null
      ? hardwareLux
      : settings.simulatedSensorLux;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isWithinNightWindow = checkInNightWindow(
    nowMinutes,
    settings.nightStartMinutes,
    settings.nightEndMinutes
  );

  const effectiveIsDark = useMemo(() => {
    if (settings.mode === 'dark' || settings.mode === 'amoled') return true;
    if (settings.mode === 'light') return false;
    if (settings.mode === 'system') {
      if (typeof systemDynamicColor?.isSystemDark === 'boolean') {
        return systemDynamicColor.isSystemDark;
      }
      return osPrefersDark;
    }
    if (settings.stayDarkAtNight && isWithinNightWindow) {
      return true;
    }
    return currentLux <= effectiveThresholdLux;
  }, [
    settings.mode,
    settings.stayDarkAtNight,
    isWithinNightWindow,
    currentLux,
    effectiveThresholdLux,
    osPrefersDark,
    systemDynamicColor?.isSystemDark,
  ]);

  const effectiveIsAmoled =
    settings.mode === 'amoled' ||
    ((settings.mode === 'adaptive' || settings.mode === 'system') &&
      effectiveIsDark &&
      settings.amoledInAdaptiveDark);

  const isMaterialYou = settings.designSystem === 'material-you';

  const effectiveSeedHex = useMemo(() => {
    if (settings.useSystemDynamicColor && systemDynamicColor?.seedHex) {
      return systemDynamicColor.seedHex;
    }
    return settings.seedHex;
  }, [settings.useSystemDynamicColor, systemDynamicColor, settings.seedHex]);

  const effectiveStyle: PaletteStyle = useMemo(() => {
    if (!isMaterialYou) {
      return 'editorial';
    }
    if (settings.useSystemDynamicColor && systemDynamicColor?.seedHex) {
      return settings.paletteStyle === 'editorial' ? 'tonalSpot' : settings.paletteStyle;
    }
    if (settings.presetId === EDITORIAL_PRESET_ID) {
      return 'editorial';
    }
    return settings.paletteStyle === 'editorial' ? 'expressive' : settings.paletteStyle;
  }, [
    isMaterialYou,
    settings.useSystemDynamicColor,
    systemDynamicColor?.seedHex,
    settings.presetId,
    settings.paletteStyle,
  ]);

  const tokens = useMemo(
    () =>
      generateM3ColorTokens(
        effectiveSeedHex,
        effectiveIsDark,
        effectiveIsAmoled,
        settings.contrastLevel,
        effectiveStyle
      ),
    [
      effectiveSeedHex,
      effectiveIsDark,
      effectiveIsAmoled,
      settings.contrastLevel,
      effectiveStyle,
    ]
  );

  // Inject CSS custom properties & design-system dataset on :root
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(tokens).forEach(([key, val]) => {
      const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      root.style.setProperty(`--m3-${kebab}`, val);
    });
    root.dataset.theme = effectiveIsDark ? (effectiveIsAmoled ? 'amoled' : 'dark') : 'light';
    root.dataset.style = effectiveStyle;
    root.dataset.designSystem = settings.designSystem;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', tokens.background);
    }
    try {
      const androidTheme = (window as unknown as {
        NsacAndroidTheme?: {
          setLightSystemBars?: (isLight: boolean) => void;
          setAppThemeIcon?: (themeKey: string) => void;
        };
      }).NsacAndroidTheme;
      androidTheme?.setLightSystemBars?.(!effectiveIsDark);
      const hasUserCustomized = localStorage.getItem(CUSTOMIZED_THEME_KEY) === '1';
      const launcherKey = resolveLauncherThemeKey(settings, effectiveSeedHex, hasUserCustomized);
      androidTheme?.setAppThemeIcon?.(launcherKey);
    } catch {
      // ignore non-Android environments
    }
  }, [
    tokens,
    effectiveIsDark,
    effectiveIsAmoled,
    effectiveStyle,
    effectiveSeedHex,
    settings,
  ]);

  const updateSettings = useCallback((patch: Partial<AdaptiveThemeSettings>) => {
    if (
      patch.designSystem !== undefined ||
      patch.presetId !== undefined ||
      patch.seedHex !== undefined ||
      patch.useSystemDynamicColor !== undefined
    ) {
      try {
        localStorage.setItem(CUSTOMIZED_THEME_KEY, '1');
      } catch {
        // ignore storage errors
      }
    }
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * Choreographed full-screen transition when switching between:
   * - `default -> material-you` (AOSP Material You morphing animation)
   * - `material-you -> default` (OpenAI Editorial geometric animation)
   */
  const switchDesignSystemWithAnimation = useCallback(
    (target: DesignSystemMode, detectedClassCode?: string | null) => {
      if (target === settings.designSystem && !transitionTarget) return;

      transitionTimersRef.current.forEach((id) => window.clearTimeout(id));
      transitionTimersRef.current = [];

      setTransitionTarget(target);
      setTransitionPhase('entering');

      // Apply the new design system at the peak of the loading animation (640ms)
      const applyTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(CUSTOMIZED_THEME_KEY, '1');
        } catch {
          // ignore storage errors
        }
        setSettings((prev) => {
          if (target === 'material-you') {
            const fallbackPreset =
              prev.presetId === EDITORIAL_PRESET_ID
                ? detectCoursePresetFromClassCode(detectedClassCode) ??
                  APERTURE_PALETTE_PRESETS.find((p) => p.id === 'aperture-purple')!
                : APERTURE_PALETTE_PRESETS.find((p) => p.id === prev.presetId) ??
                  APERTURE_PALETTE_PRESETS[1]!;

            return {
              ...prev,
              designSystem: 'material-you',
              presetId: fallbackPreset.id,
              seedHex: fallbackPreset.seedHex,
              paletteStyle: 'expressive',
            };
          } else {
            return {
              ...prev,
              designSystem: 'default',
              presetId: EDITORIAL_PRESET_ID,
              seedHex: EDITORIAL_SEED_HEX,
              useSystemDynamicColor: false,
              autoCourseSeed: false,
              paletteStyle: 'editorial',
            };
          }
        });
      }, 640);

      const exitTimer = window.setTimeout(() => {
        setTransitionPhase('exiting');
      }, 1150);

      const doneTimer = window.setTimeout(() => {
        setTransitionTarget(null);
        setTransitionPhase(null);
      }, 1450);

      transitionTimersRef.current = [applyTimer, exitTimer, doneTimer];
    },
    [settings.designSystem, transitionTarget]
  );

  const applyCourseClassCode = useCallback((classCode?: string | null) => {
    if (!classCode) return;
    setSettings((prev) => {
      if (!prev.autoCourseSeed) return prev;
      const preset = detectCoursePresetFromClassCode(classCode);
      if (prev.seedHex === preset.seedHex && prev.presetId === preset.id) return prev;
      return {
        ...prev,
        presetId: preset.id,
        seedHex: preset.seedHex,
        paletteStyle: prev.designSystem === 'material-you' ? 'expressive' : 'editorial',
      };
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        isMaterialYou,
        isTransitioningDesignSystem: transitionTarget !== null,
        tokens,
        effectiveSeedHex,
        systemDynamicColor,
        effectiveIsDark,
        effectiveIsAmoled,
        effectiveThresholdLux,
        currentLux,
        hasHardwareLightSensor,
        isWithinNightWindow,
        updateSettings,
        switchDesignSystemWithAnimation,
        applyCourseClassCode,
        refreshSystemDynamicColor,
      }}
    >
      {children}
      <DesignSystemTransitionOverlay
        targetMode={transitionTarget}
        phase={transitionPhase}
        tokens={tokens}
        seedHex={effectiveSeedHex}
      />
    </ThemeContext.Provider>
  );
};

export function useM3Theme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useM3Theme must be used inside ThemeProvider');
  }
  return ctx;
}
