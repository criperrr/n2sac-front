import React, { useEffect, useRef, useState } from 'react';
import {
  GraduationCap,
  CalendarClock,
  Trophy,
  Bell,
  Megaphone,
  User,
  RefreshCw,
  LogOut,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { M3_SPRINGS, useSpringValue } from '../theme/springPhysics';
import { useM3Theme } from '../theme/ThemeContext';
import { IconShapeContainer } from './expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from './expressive/ShapeMorph';
import { MobilePullToRefreshContainer } from './expressive/WavyProgressIndicator';
import { useMinimumBusy } from '../theme/motion';
import { RefreshCooldownLabel } from './PollCountdown';

const RAIL_COLLAPSED_KEY = 'nsac_rail_collapsed';

export type AppTabId = 'boletim' | 'turma' | 'ranking' | 'frequencia' | 'sentinela' | 'profile' | 'settings';

interface NavTabItem {
  id: AppTabId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  /** Mobile bottom bar shows only primary destinations; Settings & Sentinela open from top bar. */
  inBottomBar: boolean;
}

export const NAV_TABS: NavTabItem[] = [
  {
    id: 'boletim',
    label: 'Boletim',
    shortLabel: 'Boletim',
    icon: <GraduationCap size={20} />,
    inBottomBar: true,
  },
  {
    id: 'turma',
    label: 'Canais da Turma',
    shortLabel: 'Turma',
    icon: <Megaphone size={20} />,
    inBottomBar: true,
  },
  {
    id: 'ranking',
    label: 'Ranking',
    shortLabel: 'Ranking',
    icon: <Trophy size={20} />,
    inBottomBar: true,
  },
  {
    id: 'frequencia',
    label: 'Fichas & Frequência',
    shortLabel: 'Frequência',
    icon: <CalendarClock size={20} />,
    inBottomBar: true,
  },
  {
    id: 'profile',
    label: 'Perfil',
    shortLabel: 'Perfil',
    icon: <User size={20} />,
    inBottomBar: true,
  },
  {
    id: 'sentinela',
    label: 'Alertas & Sentinela',
    shortLabel: 'Alertas',
    icon: <Bell size={20} />,
    inBottomBar: false,
  },
  {
    id: 'settings',
    label: 'Configurações',
    shortLabel: 'Config.',
    icon: <Settings size={20} />,
    inBottomBar: false,
  },
];

const ExpressiveNavItem: React.FC<{
  item: NavTabItem;
  selected: boolean;
  onClick: () => void;
  vertical?: boolean;
}> = ({ item, selected, onClick, vertical = true }) => {
  const { tokens } = useM3Theme();
  const [pressed, setPressed] = useState(false);

  const indicatorProgress = useSpringValue(selected ? 1 : 0, M3_SPRINGS.fastSpatial);
  const indicatorRadius = useSpringValue(pressed ? 8 : 16, M3_SPRINGS.lessSpringy);
  const scale = useSpringValue(pressed ? 0.93 : 1, M3_SPRINGS.springy);

  const targetWidth = vertical ? 46 : 188;
  const animatedIndicatorWidth = Math.max(0, targetWidth * indicatorProgress);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={item.label}
      title={vertical ? undefined : item.label}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        flex: vertical ? undefined : undefined,
        minWidth: 0,
        width: '100%',
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: vertical ? 'center' : 'flex-start',
        textAlign: vertical ? 'center' : 'left',
        gap: vertical ? 3 : 12,
        padding: vertical ? '6px 0' : '2px 0',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transform: `scale(${scale})`,
        color: selected ? tokens.onSecondaryContainer : tokens.onSurfaceVariant,
        fontFamily: 'Outfit, sans-serif',
        userSelect: 'none',
      }}
    >
      {vertical ? (
        <>
          <div
            style={{
              position: 'relative',
              width: 48,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: `${animatedIndicatorWidth.toFixed(1)}px`,
                height: 28,
                borderRadius: `${indicatorRadius.toFixed(1)}px`,
                backgroundColor: tokens.secondaryContainer,
                opacity: Math.min(1, Math.max(0, indicatorProgress)),
              }}
            />
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                color: selected ? tokens.onSecondaryContainer : tokens.onSurfaceVariant,
              }}
            >
              {item.icon}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: selected ? 700 : 500,
              color: selected ? tokens.onSurface : tokens.onSurfaceVariant,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.1,
            }}
          >
            {item.shortLabel}
          </span>
        </>
      ) : (
        <div
          className="nsac-rail-item"
          style={{
            borderRadius: `${indicatorRadius.toFixed(1)}px`,
            backgroundColor: selected ? tokens.secondaryContainer : 'transparent',
            border: `1px solid ${selected ? tokens.primary : 'transparent'}`,
          }}
        >
          <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
          <span className="nsac-rail-fade" style={{ fontSize: '0.92rem', fontWeight: selected ? 700 : 500 }}>
            {item.label}
          </span>
        </div>
      )}
    </button>
  );
};

export const ExpressiveNavigationShell: React.FC<{
  activeTab: AppTabId;
  onSelectTab: (tab: AppTabId) => void;
  classCode: string | null;
  nsacEmail: string;
  refreshCooldownUntil: number | null;
  isRefreshing: boolean;
  lastHttpStatus?: 200 | 304 | null;
  onManualRefresh: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}> = ({
  activeTab,
  onSelectTab,
  classCode,
  nsacEmail,
  refreshCooldownUntil,
  isRefreshing,
  onManualRefresh,
  onLogout,
  children,
}) => {
  const { tokens } = useM3Theme();
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // storage unavailable: keep in-memory state only
      }
      return next;
    });
  };
  const refreshDisabled = refreshCooldownUntil !== null || isRefreshing;
  // Visual busy state lasts at least one full morph cycle so the indicator never just flashes.
  const showRefreshing = useMinimumBusy(isRefreshing);

  const topBarRef = useRef<HTMLElement>(null);

  // Overlay pages read --nsac-rail-offset and --nsac-top-bar-height from :root, so mirror them there.
  useEffect(() => {
    document.documentElement.classList.toggle('nsac-rail-collapsed', railCollapsed);
  }, [railCollapsed]);

  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const sync = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty('--nsac-top-bar-height', `${height}px`);
      } else {
        document.documentElement.style.removeProperty('--nsac-top-bar-height');
      }
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--nsac-top-bar-height');
    };
  }, []);

  return (
    <div className="nsac-shell-layout" style={{ backgroundColor: tokens.background, color: tokens.onBackground }}>
      {/* Desktop / Tablet Navigation Rail (collapsible) */}
      <aside
        className={`nsac-desktop-rail${railCollapsed ? ' is-collapsed' : ''}`}
        style={{
          backgroundColor: tokens.surfaceContainerLow,
          borderRight: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div className="nsac-rail-header">
          <div className="nsac-rail-fade nsac-rail-brand">
            <IconShapeContainer size={46} active={showRefreshing} morphing={showRefreshing}>
              <GraduationCap size={22} />
            </IconShapeContainer>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  letterSpacing: '-0.02em',
                  color: tokens.primary,
                }}
              >
                n²sac
              </div>
              <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>CTI • UNESP Bauru</div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            aria-expanded={!railCollapsed}
            title={railCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 999,
              border: `1px solid ${tokens.outlineVariant}`,
              backgroundColor: tokens.surfaceContainerHigh,
              color: tokens.onSurface,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Student Account Badge */}
        <div
          className="nsac-rail-badge"
          title={railCollapsed ? `${classCode ?? 'CTI'} • ${nsacEmail}` : undefined}
          style={{
            backgroundColor: tokens.surfaceContainerHigh,
            border: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          <div className="nsac-rail-badge-row">
            <span
              className="nsac-rail-fade"
              style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.primary, textTransform: 'uppercase' }}
            >
              Sua Turma
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
              }}
            >
              {classCode ?? 'CTI'}
            </span>
          </div>
          <div className="nsac-rail-fade-block" style={{ fontSize: '0.8rem', fontWeight: 600 }} title={nsacEmail}>
            {nsacEmail}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV_TABS.map((item) => (
            <ExpressiveNavItem
              key={item.id}
              item={item}
              selected={activeTab === item.id}
              onClick={() => onSelectTab(item.id)}
              vertical={false}
            />
          ))}
        </nav>

        {/* Actions in Rail Footer */}
        <div
          className="nsac-rail-footer"
          style={{
            backgroundColor: tokens.surfaceContainer,
            border: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          <button
            type="button"
            className="nsac-rail-refresh"
            disabled={refreshDisabled}
            onClick={onManualRefresh}
            title="Atualizar notas"
            style={{
              height: 36,
              borderRadius: 999,
              border: `1px solid ${tokens.outlineVariant}`,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              fontWeight: 700,
              fontSize: '0.76rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: refreshDisabled ? 'not-allowed' : 'pointer',
              opacity: refreshDisabled ? 0.5 : 1,
            }}
          >
            {showRefreshing ? <MorphingShapeIndicator size={15} label="Atualizando" /> : <RefreshCw size={14} style={{ flexShrink: 0 }} />}
            <RefreshCooldownLabel cooldownUntil={refreshCooldownUntil} className="nsac-rail-fade" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            aria-label="Sair da conta"
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 999,
              border: `1px solid ${tokens.outlineVariant}`,
              backgroundColor: tokens.surfaceContainerHighest,
              color: tokens.onSurface,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="nsac-main-viewport">
        {/* Mobile Top Bar (hidden on Desktop via CSS) */}
        <header
          ref={topBarRef}
          className="nsac-top-bar"
          style={
            {
              '--nsac-bar-bg-glass': `${tokens.surface}99`,
              '--nsac-bar-bg-opaque': `${tokens.surface}F2`,
              borderBottom: `1px solid ${tokens.outlineVariant}`,
            } as React.CSSProperties
          }
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 14px 5px 8px',
              borderRadius: 999,
              backgroundColor: tokens.surfaceContainerHigh,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <IconShapeContainer size={32} active={showRefreshing} morphing={showRefreshing}>
              <GraduationCap size={16} />
            </IconShapeContainer>
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 800,
                fontSize: '1.02rem',
                color: tokens.primary,
              }}
            >
              n²sac
            </span>
            {classCode && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: '0.73rem',
                  fontWeight: 800,
                  backgroundColor: tokens.primaryContainer,
                  color: tokens.onPrimaryContainer,
                }}
              >
                {classCode}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => onSelectTab('sentinela')}
              title="Alertas & Sentinela"
              aria-label="Alertas & Sentinela"
              aria-pressed={activeTab === 'sentinela'}
              className="mobile-only-btn"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: `1px solid ${activeTab === 'sentinela' ? tokens.primary : tokens.outlineVariant}`,
                backgroundColor: activeTab === 'sentinela' ? tokens.secondaryContainer : tokens.surfaceContainerHigh,
                color: activeTab === 'sentinela' ? tokens.onSecondaryContainer : tokens.onSurface,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Bell size={16} />
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('settings')}
              title="Configurações"
              aria-label="Configurações"
              aria-pressed={activeTab === 'settings'}
              className="mobile-only-btn"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: `1px solid ${activeTab === 'settings' ? tokens.primary : tokens.outlineVariant}`,
                backgroundColor: activeTab === 'settings' ? tokens.secondaryContainer : tokens.surfaceContainerHigh,
                color: activeTab === 'settings' ? tokens.onSecondaryContainer : tokens.onSurface,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        <MobilePullToRefreshContainer refreshing={showRefreshing} onRefresh={onManualRefresh}>
          <main className="nsac-page-content">{children}</main>
        </MobilePullToRefreshContainer>

        {/* Mobile Floating Pill Bottom Navigation Bar */}
        <nav
          className="nsac-floating-bottom-pill"
          style={
            {
              '--nsac-pill-bg-glass': `${tokens.surfaceContainerHigh}A8`,
              '--nsac-pill-bg-opaque': `${tokens.surfaceContainerHigh}F2`,
              border: `1px solid ${tokens.outlineVariant}`,
            } as React.CSSProperties
          }
        >
          {NAV_TABS.filter((item) => item.inBottomBar).map((item) => (
            <ExpressiveNavItem
              key={item.id}
              item={item}
              selected={activeTab === item.id}
              onClick={() => onSelectTab(item.id)}
              vertical={true}
            />
          ))}
        </nav>
      </div>
    </div>
  );
};
