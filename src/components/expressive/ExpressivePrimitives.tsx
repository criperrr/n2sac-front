import React, { useEffect, useState, useRef } from 'react';
import {
  computeSegmentedCorners,
  M3_SPRINGS,
  useAnimatedCorners,
  useSpringValue,
} from '../../theme/springPhysics';
import { useShapeMorph } from './ShapeMorph';
import { useM3Theme } from '../../theme/ThemeContext';
import type { IconShapeVariant } from '../../theme/materialYou';

/**
 * 1. AnimatedNumber (`T8RIN/ImageToolbox` + `Aperture` spring counter)
 * Smoothly interpolates numeric values with Hooke's law spring physics.
 */
export const AnimatedNumber: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  showPlusSign?: boolean;
  className?: string;
}> = ({
  value,
  decimals = 1,
  prefix = '',
  suffix = '',
  showPlusSign = false,
  className = '',
}) => {
  const animated = useSpringValue(value, M3_SPRINGS.numberGauge);
  const formatted = animated.toFixed(decimals);
  const sign = showPlusSign && animated > 0.01 ? '+' : '';
  return (
    <span className={className} data-no-size-morph style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {sign}
      {formatted}
      {suffix}
    </span>
  );
};

/**
 * Number that starts at 0 and springs to its value the first time it scrolls into view
 * (same `numberGauge` spring as the year switch on the home screen). Mutates `textContent`
 * directly in rAF (only when the formatted string changes) so dozens of numbers animating
 * simultaneously cause zero React re-renders.
 */
export const RevealNumber: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  showPlusSign?: boolean;
  delayMs?: number;
  /** Fires once, when the number starts revealing (e.g. to grow a bar alongside it). */
  onReveal?: () => void;
}> = ({ value, decimals = 1, prefix = '', suffix = '', showPlusSign = false, delayMs = 0, onReveal }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [revealed, setRevealed] = useState(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const springRef = useRef({ position: 0, velocity: 0, lastText: '' });

  const format = (num: number) => {
    const sign = showPlusSign && num > 0.01 ? '+' : '';
    return `${prefix}${sign}${num.toFixed(decimals)}${suffix}`;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          setRevealed(true);
          onRevealRef.current?.();
        }, delayMs);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [revealed, delayMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = revealed ? value : 0;
    const { stiffness, dampingRatio } = M3_SPRINGS.numberGauge;
    const damping = dampingRatio * 2 * Math.sqrt(stiffness);
    const precision = 0.005;

    const write = (num: number) => {
      const text = format(num);
      if (text !== springRef.current.lastText) {
        springRef.current.lastText = text;
        el.textContent = text;
      }
    };

    if (
      Math.abs(springRef.current.velocity) < precision &&
      Math.abs(target - springRef.current.position) < precision
    ) {
      springRef.current.position = target;
      springRef.current.velocity = 0;
      write(target);
      return;
    }

    let active = true;
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      if (!active) return;
      const dt = Math.min((now - lastTime) / 1000, 0.032);
      lastTime = now;

      const displacement = springRef.current.position - target;
      const acceleration = -stiffness * displacement - damping * springRef.current.velocity;
      springRef.current.velocity += acceleration * dt;
      springRef.current.position += springRef.current.velocity * dt;

      if (
        Math.abs(springRef.current.velocity) < precision &&
        Math.abs(target - springRef.current.position) < precision
      ) {
        springRef.current.position = target;
        springRef.current.velocity = 0;
        write(target);
        return;
      }

      write(springRef.current.position);
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [revealed, value, decimals, prefix, suffix, showPlusSign]);

  return (
    <span ref={ref} data-no-size-morph style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(revealed ? springRef.current.position : 0)}
    </span>
  );
};

/**
 * 2. IconShapeContainer (`T8RIN/ImageToolbox` `IconShapeContainer.kt` + `ApertureBrandArtwork.kt`)
 * Renders an expressive geometric container (6-point M3 Cookie, Squircle, Clover, Pentagon, Pill)
 * around vector SVG icons, morphing rotation/scale with spring physics on active state.
 */
const CONCRETE_ICON_SHAPES: Exclude<IconShapeVariant, 'random'>[] = [
  'cookie6',
  'squircle',
  'clover',
  'pentagon',
  'pill',
];

export const IconShapeContainer: React.FC<{
  children: React.ReactNode;
  shapeVariant?: IconShapeVariant;
  containerColor?: string;
  contentColor?: string;
  size?: number;
  active?: boolean;
  /** Continuously morphs the container through the M3 Expressive shape sequence (busy state). */
  morphing?: boolean;
}> = ({
  children,
  shapeVariant,
  containerColor,
  contentColor,
  size = 44,
  active = false,
  morphing = false,
}) => {
  const { settings, isMaterialYou, tokens } = useM3Theme();
  const [randomShape] = useState<Exclude<IconShapeVariant, 'random'>>(
    () => CONCRETE_ICON_SHAPES[Math.floor(Math.random() * CONCRETE_ICON_SHAPES.length)] ?? 'cookie6'
  );
  const requestedVariant = shapeVariant ?? settings.iconShape;
  const variant: Exclude<IconShapeVariant, 'random'> =
    requestedVariant === 'random' ? randomShape : requestedVariant;
  const bg = containerColor ?? (isMaterialYou ? tokens.primaryContainer : tokens.surfaceContainer);
  const fg = contentColor ?? (isMaterialYou ? tokens.onPrimaryContainer : tokens.onSurface);
  const rotation = useSpringValue(isMaterialYou && active ? 30 : 0, M3_SPRINGS.lessSpringy);
  const scale = useSpringValue(isMaterialYou && active ? 1.08 : 1, M3_SPRINGS.springy);
  const morphPathRef = useRef<SVGPathElement>(null);
  const morphGroupRef = useRef<SVGGElement>(null);
  useShapeMorph(morphPathRef, morphGroupRef, morphing && isMaterialYou, 44);

  if (!isMaterialYou) {
    const editorialRadius = size >= 48 ? 12 : 10;
    return (
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: editorialRadius,
          backgroundColor: containerColor ?? (active ? tokens.primaryContainer : tokens.surfaceContainer),
          color: contentColor ?? (active ? tokens.onPrimaryContainer : tokens.onSurface),
          border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 150ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex' }}>{children}</div>
      </div>
    );
  }

  // Exact 6-point cookie path ported from XDanfr/Aperture `ApertureBrandArtwork.kt` (`CookiePoints`)
  const renderShapeSvg = () => {
    switch (variant) {
      case 'cookie6':
        return (
          <path
            d="M50 4 C58 4, 62 12, 70 14 C78 16, 86 14, 90 22 C94 30, 88 38, 88 50 C88 62, 94 70, 90 78 C86 86, 78 84, 70 86 C62 88, 58 96, 50 96 C42 96, 38 88, 30 86 C22 84, 14 86, 10 78 C6 70, 12 62, 12 50 C12 38, 6 30, 10 22 C14 14, 22 16, 30 14 C38 12, 42 4, 50 4 Z"
            fill={bg}
          />
        );
      case 'clover':
        return (
          <path
            d="M50 10 C64 4, 78 14, 82 28 C96 32, 96 68, 82 72 C78 86, 64 96, 50 90 C36 96, 22 86, 18 72 C4 68, 4 32, 18 28 C22 14, 36 4, 50 10 Z"
            fill={bg}
          />
        );
      case 'pentagon':
        return (
          <path
            d="M44 8 Q50 3 56 8 L88 33 Q94 38 91 46 L79 84 Q76 92 68 92 L32 92 Q24 92 21 84 L9 46 Q6 38 12 33 Z"
            fill={bg}
          />
        );
      case 'pill':
        return <rect x="6" y="6" width="88" height="88" rx="44" fill={bg} />;
      case 'squircle':
      default:
        return (
          <path
            d="M50 6 C80 6, 94 20, 94 50 C94 80, 80 94, 50 94 C20 94, 6 80, 6 50 C6 20, 20 6, 50 6 Z"
            fill={bg}
          />
        );
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: fg,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: `rotate(${rotation}deg) scale(${scale})`,
        }}
      >
        {morphing ? (
          <g ref={morphGroupRef}>
            <path ref={morphPathRef} fill={bg} />
          </g>
        ) : (
          renderShapeSvg()
        )}
      </svg>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex' }}>{children}</div>
    </div>
  );
};

/**
 * 3. ExpressiveSegmentedCard (`T8RIN/ImageToolbox` `ShapeDefaults.byIndex` + `shapeByInteraction` + `ScaleOnTap`
 *    + `XDanfr/Aperture` + `xLexip/Adaptive-Theme` `DetailPreferenceCard.kt`)
 *
 * - First card in group: 28px top corners, 6px bottom corners
 * - Middle cards: 6px all corners
 * - Last card in group: 6px top corners, 28px bottom corners
 * - When pressed (`isPressed`): corners morph via spring to 12px and card scales to 0.982
 * - When selected/expanded (`isSelected`): corners morph via spring to 24px all around
 */
export const ExpressiveSegmentedCard: React.FC<{
  index: number;
  total: number;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'bright' | 'primary' | 'secondary' | 'tertiary' | 'error';
  outerRadius?: number;
  innerRadius?: number;
  staggerIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({
  index,
  total,
  onClick,
  selected = false,
  disabled = false,
  variant = 'default',
  outerRadius = 28,
  innerRadius = 6,
  staggerIndex = 0,
  className = '',
  style,
  children,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const targetCorners = isMaterialYou
    ? computeSegmentedCorners(index, total, {
        outerRadius,
        innerRadius,
        pressedRadius: 12,
        selectedRadius: 24,
        isPressed: isPressed && !disabled && Boolean(onClick),
        isSelected: selected,
      })
    : {
        topStart: 14,
        topEnd: 14,
        bottomEnd: 14,
        bottomStart: 14,
      };

  const animatedBorderRadius = useAnimatedCorners(targetCorners, M3_SPRINGS.lessSpringy);
  const scale = useSpringValue(
    isMaterialYou
      ? isPressed && !disabled && onClick
        ? 0.982
        : isHovered && !disabled && onClick
          ? 1.006
          : 1
      : 1,
    M3_SPRINGS.apertureFocus
  );

  const bgMap: Record<typeof variant, string> = {
    default: selected
      ? tokens.surfaceContainerHighest
      : isMaterialYou
        ? tokens.surfaceContainerHigh
        : tokens.surfaceContainerLow,
    bright: tokens.surfaceBright,
    primary: tokens.primaryContainer,
    secondary: tokens.secondaryContainer,
    tertiary: tokens.tertiaryContainer,
    error: tokens.errorContainer,
  };

  const fgMap: Record<typeof variant, string> = {
    default: tokens.onSurface,
    bright: tokens.onSurface,
    primary: tokens.onPrimaryContainer,
    secondary: tokens.onSecondaryContainer,
    tertiary: tokens.onTertiaryContainer,
    error: tokens.onErrorContainer,
  };

  const borderColor = selected
    ? tokens.primary
    : isHovered && onClick
      ? tokens.outline
      : tokens.outlineVariant;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onClick={() => {
        if (!disabled && onClick) onClick();
      }}
      onKeyDown={(e) => {
        if (!disabled && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      onPointerDown={() => !disabled && onClick && setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => {
        setIsPressed(false);
        setIsHovered(false);
      }}
      onPointerEnter={() => !disabled && setIsHovered(true)}
      className={`m3-segmented-card ${className}`}
      style={{
        borderRadius: isMaterialYou ? animatedBorderRadius : '14px',
        backgroundColor: bgMap[variant],
        color: fgMap[variant],
        border: `1px solid ${borderColor}`,
        transform: isMaterialYou ? `scale(${scale})` : undefined,
        opacity: disabled ? 0.45 : 1,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        animationDelay: `${Math.min(staggerIndex * 24, 240)}ms`,
        transition:
          'background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * 4. EnhancedMorphButton (`T8RIN/ImageToolbox` `EnhancedButton.kt`)
 * Morphs from Pill (28px radius) to Squircle (10px radius) on press with spring physics
 * and elastic bounce scale.
 */
export const EnhancedMorphButton: React.FC<{
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: 'filled' | 'tonal' | 'outlined' | 'error';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  onClick,
  type = 'button',
  disabled = false,
  variant = 'filled',
  size = 'md',
  fullWidth = false,
  icon,
  children,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [pressed, setPressed] = useState(false);

  const restRadius = isMaterialYou
    ? size === 'lg'
      ? 28
      : size === 'md'
        ? 24
        : 18
    : 12;
  const pressedRadius = isMaterialYou ? (size === 'lg' ? 12 : 8) : 12;
  const radius = useSpringValue(pressed && !disabled ? pressedRadius : restRadius, M3_SPRINGS.lessSpringy);
  const scale = useSpringValue(
    pressed && !disabled ? (isMaterialYou ? 0.96 : 0.988) : 1,
    M3_SPRINGS.springy
  );

  const height = isMaterialYou
    ? size === 'lg'
      ? 54
      : size === 'md'
        ? 44
        : 36
    : size === 'lg'
      ? 44
      : size === 'md'
        ? 38
        : 34;
  const paddingX = isMaterialYou
    ? size === 'lg'
      ? 24
      : size === 'md'
        ? 18
        : 14
    : size === 'lg'
      ? 20
      : size === 'md'
        ? 16
        : 13;

  const getColors = () => {
    switch (variant) {
      case 'filled':
        return {
          bg: tokens.primary,
          fg: tokens.onPrimary,
          border: 'transparent',
        };
      case 'tonal':
        return {
          bg: isMaterialYou ? tokens.secondaryContainer : tokens.surfaceContainer,
          fg: isMaterialYou ? tokens.onSecondaryContainer : tokens.onSurface,
          border: tokens.outlineVariant,
        };
      case 'error':
        return {
          bg: tokens.errorContainer,
          fg: tokens.onErrorContainer,
          border: tokens.error,
        };
      case 'outlined':
      default:
        return {
          bg: 'transparent',
          fg: isMaterialYou ? tokens.primary : tokens.onSurface,
          border: tokens.outlineVariant,
        };
    }
  };

  const c = getColors();

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: fullWidth ? '100%' : undefined,
        height,
        padding: `0 ${paddingX}px`,
        borderRadius: isMaterialYou ? `${Math.max(4, radius).toFixed(1)}px` : '12px',
        backgroundColor: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        transform: `scale(${scale})`,
        fontFamily: isMaterialYou
          ? 'Outfit, sans-serif'
          : 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontWeight: isMaterialYou ? 600 : 500,
        fontSize: size === 'lg' ? '0.96rem' : size === 'md' ? '0.88rem' : '0.8rem',
        letterSpacing: isMaterialYou ? '0.01em' : 'normal',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.42 : 1,
        userSelect: 'none',
        transition: 'background-color 150ms cubic-bezier(0.16, 1, 0.3, 1), color 150ms ease, opacity 150ms ease',
      }}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export interface ButtonGroupOption<T extends string | number> {
  value: T;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export function EnhancedConnectedButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
  scrollable = true,
  wrap = false,
}: {
  options: ButtonGroupOption<T>[];
  value: T;
  onChange: (val: T) => void;
  scrollable?: boolean;
  wrap?: boolean;
}) {
  const { isMaterialYou, tokens } = useM3Theme();

  if (wrap || !isMaterialYou) {
    return (
      <div
        className="m3-connected-button-group"
        style={{
          display: 'flex',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          alignItems: 'center',
          gap: 6,
          overflowX: !wrap && scrollable ? 'auto' : 'visible',
          padding: '2px 0',
          scrollbarWidth: 'none',
          maxWidth: '100%',
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: wrap ? '0 1 auto' : scrollable ? '0 0 auto' : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: isMaterialYou ? 36 : 34,
                padding: '0 13px',
                borderRadius: isMaterialYou ? 999 : 12,
                backgroundColor: selected
                  ? tokens.primary
                  : isMaterialYou
                    ? tokens.surfaceContainerHigh
                    : tokens.surfaceContainer,
                color: selected ? tokens.onPrimary : tokens.onSurface,
                border: `1px solid ${selected ? tokens.primary : tokens.outlineVariant}`,
                fontFamily: isMaterialYou
                  ? 'Outfit, sans-serif'
                  : 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                fontWeight: selected ? 600 : 500,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {opt.icon && <span style={{ display: 'inline-flex' }}>{opt.icon}</span>}
              <span>{opt.label}</span>
              {opt.badge !== undefined && (
                <span
                  style={{
                    padding: '1px 7px',
                    borderRadius: 999,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    backgroundColor: selected ? tokens.onPrimary : tokens.surfaceContainerHighest,
                    color: selected ? tokens.primary : tokens.onSurface,
                  }}
                >
                  {opt.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="m3-connected-button-group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        overflowX: scrollable ? 'auto' : 'visible',
        padding: '4px 2px',
        scrollbarWidth: 'none',
      }}
    >
      {options.map((opt, idx) => (
        <ConnectedSegmentButton
          key={String(opt.value)}
          index={idx}
          total={options.length}
          selected={opt.value === value}
          label={opt.label}
          badge={opt.badge}
          icon={opt.icon}
          scrollable={scrollable}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}

const ConnectedSegmentButton: React.FC<{
  index: number;
  total: number;
  selected: boolean;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
  scrollable: boolean;
  onClick: () => void;
}> = ({ index, total, selected, label, badge, icon, scrollable, onClick }) => {
  const { tokens } = useM3Theme();
  const [pressed, setPressed] = useState(false);

  const isFirst = index === 0;
  const isLast = index === total - 1;

  const targetCorners = pressed
    ? { topStart: 10, topEnd: 10, bottomEnd: 10, bottomStart: 10 }
    : selected
      ? { topStart: 22, topEnd: 22, bottomEnd: 22, bottomStart: 22 }
      : {
          topStart: isFirst ? 22 : 6,
          bottomStart: isFirst ? 22 : 6,
          topEnd: isLast ? 22 : 6,
          bottomEnd: isLast ? 22 : 6,
        };

  const borderRadius = useAnimatedCorners(targetCorners, M3_SPRINGS.lessSpringy);
  const scaleX = useSpringValue(pressed ? 1.04 : selected ? 1.01 : 1, M3_SPRINGS.springy);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        flex: scrollable ? '0 0 auto' : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 40,
        padding: '0 15px',
        borderRadius,
        backgroundColor: selected ? tokens.primary : tokens.surfaceContainerHigh,
        color: selected ? tokens.onPrimary : tokens.onSurfaceVariant,
        border: `1px solid ${selected ? tokens.primary : tokens.outlineVariant}`,
        transform: `scaleX(${scaleX})`,
        fontFamily: 'Outfit, sans-serif',
        fontWeight: selected ? 700 : 500,
        fontSize: '0.86rem',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        zIndex: selected ? 2 : 1,
        transition: 'background-color 240ms ease, color 240ms ease, border-color 240ms ease',
      }}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      <span>{label}</span>
      {badge !== undefined && (
        <span
          style={{
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: '0.74rem',
            fontWeight: 700,
            backgroundColor: selected ? tokens.onPrimary : tokens.surfaceContainerHighest,
            color: selected ? tokens.primary : tokens.onSurface,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

/**
 * 6. ExpressiveSwitch (`XDanfr/Aperture` `ExpressiveToggle.kt` + `xLexip/Adaptive-Theme` `PreferenceSwitch`)
 * Deselected thumb is 16px; selected thumb grows to 24px with spring physics and displays vector check/close icon.
 */
export const ExpressiveSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => {
  const { tokens } = useM3Theme();
  const [pressed, setPressed] = useState(false);

  const thumbSize = useSpringValue(pressed ? 26 : checked ? 24 : 16, M3_SPRINGS.apertureFocus);
  const thumbX = useSpringValue(checked ? 22 : 4, M3_SPRINGS.apertureFocus);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        position: 'relative',
        width: 52,
        height: 32,
        borderRadius: 999,
        backgroundColor: checked ? tokens.primary : tokens.surfaceContainerHighest,
        border: `2px solid ${checked ? tokens.primary : tokens.outline}`,
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        flexShrink: 0,
        transition: 'background-color 220ms ease, border-color 220ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: thumbX,
          width: thumbSize,
          height: thumbSize,
          transform: 'translateY(-50%)',
          borderRadius: 999,
          backgroundColor: checked ? tokens.onPrimary : tokens.outline,
          color: checked ? tokens.primary : tokens.surfaceContainerHighest,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 220ms ease',
        }}
      >
        {checked ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </span>
    </button>
  );
};

/**
 * 7. MainSwitchPillCard (`xLexip/Adaptive-Theme` `MainSwitchPreferenceCard.kt`)
 * 100% pill-rounded (`border-radius: 9999px`) hero toggle banner in `primaryContainer`.
 */
export const MainSwitchPillCard: React.FC<{
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon?: React.ReactNode;
}> = ({ title, subtitle, checked, onChange, icon }) => {
  const { tokens } = useM3Theme();
  const [pressed, setPressed] = useState(false);
  const scale = useSpringValue(pressed ? 0.98 : 1, M3_SPRINGS.apertureFocus);
  const radius = useSpringValue(pressed ? 24 : 48, M3_SPRINGS.lessSpringy);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px 24px 16px 28px',
        borderRadius: `${radius.toFixed(1)}px`,
        backgroundColor: checked ? tokens.primaryContainer : tokens.surfaceContainerHigh,
        color: checked ? tokens.onPrimaryContainer : tokens.onSurface,
        border: `1px solid ${checked ? tokens.primary : tokens.outlineVariant}`,
        transform: `scale(${scale})`,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background-color 280ms ease, color 280ms ease, border-color 280ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {icon && <div style={{ flexShrink: 0, display: 'flex' }}>{icon}</div>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.02rem', fontFamily: 'Outfit, sans-serif' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: '0.82rem', opacity: 0.82, marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      </div>
      <ExpressiveSwitch checked={checked} onChange={onChange} />
    </div>
  );
};

/**
 * 8. ApertureThemeSwatch (`XDanfr/Aperture` `ApertureThemeSwatch.kt`)
 * Circular 3-arc Material You swatch: top 180deg = primary, bottom-left 90deg = secondary, bottom-right 90deg = tertiary.
 */
export const ApertureThemeSwatch: React.FC<{
  primary: string;
  secondary: string;
  tertiary: string;
  selected?: boolean;
  label: string;
  sublabel?: string;
  onClick: () => void;
}> = ({ primary, secondary, tertiary, selected = false, label, sublabel, onClick }) => {
  const { tokens } = useM3Theme();
  const [pressed, setPressed] = useState(false);
  const scale = useSpringValue(pressed ? 0.94 : 1, M3_SPRINGS.springy);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 8px',
        borderRadius: 18,
        backgroundColor: selected ? tokens.secondaryContainer : 'transparent',
        color: selected ? tokens.onSecondaryContainer : tokens.onSurface,
        border: `1px solid ${selected ? tokens.primary : 'transparent'}`,
        transform: `scale(${scale})`,
        cursor: 'pointer',
        width: 96,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          padding: 3,
          borderRadius: 999,
          border: selected ? `2px solid ${tokens.onSurface}` : '2px solid transparent',
        }}
      >
        <svg width="52" height="52" viewBox="0 0 100 100" style={{ display: 'block', borderRadius: 999 }}>
          {/* Top 180deg arc: Primary */}
          <path d="M 0 50 A 50 50 0 0 1 100 50 L 50 50 Z" fill={primary} />
          {/* Bottom-left 90deg arc: Secondary */}
          <path d="M 50 100 A 50 50 0 0 1 0 50 L 50 50 Z" fill={secondary} />
          {/* Bottom-right 90deg arc: Tertiary */}
          <path d="M 100 50 A 50 50 0 0 1 50 100 L 50 50 Z" fill={tertiary} />
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke={tokens.onSurface}
            strokeOpacity="0.16"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div
        style={{
          fontSize: '0.76rem',
          fontWeight: selected ? 700 : 500,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: '0.66rem',
            opacity: 0.72,
            fontWeight: 600,
          }}
        >
          {sublabel}
        </div>
      )}
    </button>
  );
};

/**
 * 9. SegmentedProgressIndicator (`xLexip/Adaptive-Theme` `SegmentedProgressIndicator.kt`)
 * Discrete pill segments that illuminate smoothly up to activeIndex.
 */
export const SegmentedProgressIndicator: React.FC<{
  segments: number;
  activeIndex: number;
  enabled?: boolean;
}> = ({ segments, activeIndex, enabled = true }) => {
  const { tokens } = useM3Theme();
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = enabled && i <= activeIndex;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 16,
              borderRadius: 8,
              backgroundColor: isActive ? tokens.primary : tokens.surfaceContainerHighest,
              border: `1px solid ${isActive ? tokens.primary : tokens.outlineVariant}`,
              transition: 'background-color 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * 10. ExpressiveWavyBar (`XDanfr/Aperture` `ExpressiveWavyProgressIndicator.kt` + `T8RIN` spring gauge)
 * Comparative dual-bar or wavy progress bar with spring-animated width.
 */
export const ExpressiveGradeCompareBar: React.FC<{
  personalGrade: number | null;
  classAverage: number | null;
  isRecovered?: boolean;
  /** Row labels; defaults to the boletim's M.B. / M.T. */
  labels?: [string, string];
  /** Print each value at the end of its bar (used by the peer comparison). */
  showValues?: boolean;
}> = ({ personalGrade, classAverage, isRecovered = false, labels = ['M.B.', 'M.T.'], showValues = false }) => {
  const { tokens } = useM3Theme();
  const valueLabel = (v: number | null) =>
    showValues ? (
      <span
        style={{
          minWidth: 30,
          textAlign: 'right',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 800,
          fontSize: '0.86rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v !== null ? v.toFixed(1) : '—'}
      </span>
    ) : null;
  const pVal = personalGrade ?? 0;
  const cVal = classAverage ?? 0;

  const pPercent = useSpringValue(Math.max(0, Math.min(100, (pVal / 10) * 100)), M3_SPRINGS.numberGauge);
  const cPercent = useSpringValue(Math.max(0, Math.min(100, (cVal / 10) * 100)), M3_SPRINGS.numberGauge);

  const barColor =
    personalGrade === null
      ? tokens.outline
      : personalGrade >= 6
        ? isRecovered
          ? tokens.gradeWarning
          : tokens.gradeSuccess
        : tokens.error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {/* Personal Grade Bar (M.B.) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            minWidth: 34,
            fontSize: '0.72rem',
            fontWeight: 700,
            color: tokens.onSurfaceVariant,
          }}
        >
          {labels[0]}
        </span>
        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 10,
            borderRadius: 999,
            backgroundColor: tokens.surfaceContainerLowest,
            overflow: 'hidden',
          }}
        >
          {/* 6.0 Passing Threshold Marker */}
          <div
            style={{
              position: 'absolute',
              left: '60%',
              top: 0,
              bottom: 0,
              width: 1.5,
              backgroundColor: tokens.outline,
              opacity: 0.45,
              zIndex: 2,
            }}
          />
          <div
            style={{
              width: `${pPercent.toFixed(1)}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: barColor,
            }}
          />
        </div>
        {valueLabel(personalGrade)}
      </div>

      {/* Class Average Bar (M.T.) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            minWidth: 34,
            fontSize: '0.72rem',
            fontWeight: 600,
            color: tokens.onSurfaceVariant,
            opacity: 0.8,
          }}
        >
          {labels[1]}
        </span>
        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 6,
            borderRadius: 999,
            backgroundColor: tokens.surfaceContainerLowest,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${cPercent.toFixed(1)}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: tokens.secondary,
              opacity: 0.78,
            }}
          />
        </div>
        {valueLabel(classAverage)}
      </div>
    </div>
  );
};
