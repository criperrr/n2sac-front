import { Capacitor } from '@capacitor/core';
import { formatVersionLabel } from '../appVersion';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sun,
  Moon,
  Sparkles,
  Palette,
  Shapes,
  Smartphone,
  Feather,
  Layers,
  Check,
  RefreshCw,
  Settings,
} from 'lucide-react';
import {
  applyOtaUpdate,
  checkAllUpdates,
  fetchLatestServerVersion,
  getEffectiveAppVersion,
  getInstalledNativeVersion,
  type NativeUpdateInfo,
  type ServerVersionSnapshot,
} from '../updater/autoUpdater';
import {
  APERTURE_PALETTE_PRESETS,
  detectCoursePresetFromClassCode,
  EDITORIAL_PRESET_ID,
  EDITORIAL_SEED_HEX,
  type AvatarShapeVariant,
  type IconShapeVariant,
  type ThemeMode,
  resolveAvatarRadius,
} from '../theme/materialYou';
import { useM3Theme } from '../theme/ThemeContext';
import {
  ApertureThemeSwatch,
  EnhancedConnectedButtonGroup,
  ExpressiveSegmentedCard,
  ExpressiveSwitch,
  IconShapeContainer,
  MainSwitchPillCard,
} from '../components/expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../components/expressive/ShapeMorph';
import { useMinimumBusy } from '../theme/motion';

export const AdaptiveStudioScreen: React.FC<{
  detectedClassCode: string | null;
}> = ({ detectedClassCode }) => {
  const {
    settings,
    isMaterialYou,
    isTransitioningDesignSystem,
    tokens,
    effectiveSeedHex,
    systemDynamicColor,
    updateSettings,
    switchDesignSystemWithAnimation,
    refreshSystemDynamicColor,
  } = useM3Theme();

  // Only show Android Dynamic Color toggle when running on an Android device or inside the Android bridge
  const isAndroid = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return (
      /Android/i.test(navigator.userAgent) ||
      Boolean(window.__NSAC_ANDROID_DYNAMIC_COLOR__)
    );
  }, []);

  const displayMode: ThemeMode =
    settings.mode === 'adaptive' ? 'system' : settings.mode;

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const showChecking = useMinimumBusy(checkingUpdate);
  const [updateResult, setUpdateResult] = useState<NativeUpdateInfo | null>(null);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [latestServer, setLatestServer] = useState<ServerVersionSnapshot>({ version: null, apkVersion: null });
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    let cancelled = false;
    void fetchLatestServerVersion().then((snap) => {
      if (!cancelled) setLatestServer(snap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateStatusMsg(null);
    try {
      const [found, latest] = await Promise.all([checkAllUpdates(), fetchLatestServerVersion()]);
      setLatestServer(latest);
      setUpdateResult(found);
      if (found) {
        setUpdateStatusMsg(`Nova versão ${formatVersionLabel(found.version)} disponível.`);
      } else {
        setUpdateStatusMsg(`Você já está na versão mais recente (${formatVersionLabel(getEffectiveAppVersion())}).`);
      }
    } catch {
      setUpdateStatusMsg('Não foi possível verificar atualizações agora.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const formatShortV = (v: string | null) => (v ? `v${v.replace(/^v/i, '')}` : '—');
  const installedWebV = formatShortV(getEffectiveAppVersion());
  const installedApkV = formatShortV(getInstalledNativeVersion());
  const latestWebV = formatShortV(latestServer.version);
  const latestApkV = latestServer.apkVersion ? formatShortV(latestServer.apkVersion) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 18 : 20 }}>
      {/* 0. APP UPDATES SECTION (TOP OF CONFIGURAÇÕES) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ExpressiveSegmentedCard index={0} total={1} style={{ padding: isMaterialYou ? '18px 20px' : '20px 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconShapeContainer size={42} active>
                <RefreshCw size={18} />
              </IconShapeContainer>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                  Atualizações do App
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: 10,
                    rowGap: 2,
                    fontSize: '0.8rem',
                    color: tokens.onSurfaceVariant,
                    lineHeight: 1.4,
                    marginTop: 2,
                  }}
                >
                  <span>Versão instalada:</span>
                  <strong style={{ color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {installedWebV}
                    {isNative ? ` (apk ${installedApkV})` : ''}
                  </strong>
                  <span>Última versão:</span>
                  <strong style={{ color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {latestWebV}
                    {isNative && latestApkV ? ` (apk ${latestApkV})` : ''}
                  </strong>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={checkingUpdate}
              onClick={() => void handleCheckUpdates()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: checkingUpdate ? 'wait' : 'pointer',
              }}
            >
              {showChecking ? <MorphingShapeIndicator size={15} label="Verificando" /> : <RefreshCw size={14} />}
              <span>{showChecking ? 'Verificando...' : 'Verificar atualizações'}</span>
            </button>
          </div>

          {updateStatusMsg && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: tokens.surfaceContainerHigh,
                border: `1px solid ${tokens.outlineVariant}`,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: '0.8rem',
              }}
            >
              <span>{updateStatusMsg}</span>
              {updateResult &&
                (updateResult.source === 'server-ota' ? (
                  <button
                    type="button"
                    onClick={() => void applyOtaUpdate(updateResult.buildId, updateResult.version)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: 'none',
                      backgroundColor: tokens.primary,
                      color: tokens.onPrimary,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Atualizar agora
                  </button>
                ) : (
                  <a
                    href={updateResult.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      backgroundColor: tokens.primary,
                      color: tokens.onPrimary,
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Baixar APK
                  </a>
                ))}
            </div>
          )}
        </ExpressiveSegmentedCard>
      </section>

      {/* 1. HERO HEADER & DESIGN SYSTEM SWITCHER (Design Padrão OpenAI vs Redesign Material You) */}
      <section
        style={{
          borderRadius: isMaterialYou ? 32 : 16,
          padding: isMaterialYou ? '24px 22px' : '28px 28px',
          backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <IconShapeContainer size={isMaterialYou ? 52 : 42} active>
            <Settings size={isMaterialYou ? 22 : 20} />
          </IconShapeContainer>
          <div>
            <div
              style={{
                fontSize: '0.73rem',
                fontWeight: 500,
                color: tokens.onSurfaceVariant,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}
            >
              Personalização • n²sac
            </div>
            <h1
              className={!isMaterialYou ? 'openai-serif-display' : undefined}
              style={{
                margin: 0,
                fontSize: isMaterialYou ? '1.7rem' : '2.35rem',
                fontWeight: isMaterialYou ? 800 : 400,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              Configurações
            </h1>
          </div>
        </div>

        {/* DESIGN SYSTEM ARCHITECTURE SELECTOR CARDS */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 10,
            }}
          >
            Arquitetura Visual
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 12,
            }}
          >
            {/* Card 1: Design Padrão (OpenAI Editorial Reference) */}
            <button
              type="button"
              disabled={isTransitioningDesignSystem}
              onClick={() => switchDesignSystemWithAnimation('default', detectedClassCode)}
              style={{
                textAlign: 'left',
                padding: '18px 20px',
                borderRadius: isMaterialYou ? 22 : 14,
                backgroundColor: !isMaterialYou
                  ? tokens.surfaceContainerLow
                  : tokens.surfaceContainer,
                color: tokens.onSurface,
                border: `1.5px solid ${!isMaterialYou ? tokens.primary : tokens.outlineVariant}`,
                cursor: isTransitioningDesignSystem ? 'wait' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 10,
                transition: 'all 180ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      flexShrink: 0,
                      backgroundColor: '#0D0D0D',
                      color: '#FFFFFF',
                      border: '1px solid #262626',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather size={16} />
                  </div>
                  <div>
                    <div
                      className="openai-serif-display"
                      style={{ fontWeight: 500, fontSize: '1.1rem' }}
                    >
                      Design Padrão (Editorial)
                    </div>
                    <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant }}>
                      Tipografia serifa & sans, linhas hairline e calma visual
                    </div>
                  </div>
                </div>
                {!isMaterialYou && (
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: tokens.primary,
                      color: tokens.onPrimary,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={14} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.79rem', color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
                Títulos editoriais em serifa, espaço em branco generoso, divisores hairline de 1px e leitura tabular limpa.
              </div>
            </button>

            {/* Card 2: Redesign Material You */}
            <button
              type="button"
              disabled={isTransitioningDesignSystem}
              onClick={() => switchDesignSystemWithAnimation('material-you', detectedClassCode)}
              style={{
                textAlign: 'left',
                padding: '18px 20px',
                borderRadius: isMaterialYou ? 22 : 14,
                backgroundColor: isMaterialYou
                  ? tokens.primaryContainer
                  : tokens.surfaceContainer,
                color: isMaterialYou ? tokens.onPrimaryContainer : tokens.onSurface,
                border: `1.5px solid ${isMaterialYou ? tokens.primary : tokens.outlineVariant}`,
                cursor: isTransitioningDesignSystem ? 'wait' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 10,
                transition: 'all 180ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      flexShrink: 0,
                      backgroundColor: isMaterialYou ? tokens.primary : '#7C4DFF',
                      color: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Layers size={16} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.02rem' }}>
                      Redesign Material You
                    </div>
                    <div
                      style={{
                        fontSize: '0.73rem',
                        color: isMaterialYou ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                        opacity: 0.85,
                      }}
                    >
                      Formas dinâmicas AOSP, cartões tonais e física de mola
                    </div>
                  </div>
                </div>
                {isMaterialYou && (
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: tokens.primary,
                      color: tokens.onPrimary,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={14} />
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: '0.79rem',
                  color: isMaterialYou ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                  opacity: 0.9,
                  lineHeight: 1.5,
                }}
              >
                Cards agrupados com morphing de cantos (28px/6px), molduras geométricas AOSP e superfícies tonais vibrantes.
              </div>
            </button>
          </div>
        </div>

        {/* Display Mode Selector (Available in BOTH design systems!) */}
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
            }}
          >
            Modo de Exibição
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 6,
            }}
          >
            {(
              [
                { value: 'system', label: 'Sistema', icon: <Smartphone size={15} /> },
                { value: 'light', label: 'Claro', icon: <Sun size={15} /> },
                { value: 'dark', label: 'Escuro', icon: <Moon size={15} /> },
                { value: 'amoled', label: 'OLED', icon: <Sparkles size={15} /> },
              ] as const
            ).map((opt) => {
              const active = displayMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ mode: opt.value })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    padding: '10px 6px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    border: `1.5px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                    backgroundColor: active ? tokens.primary : tokens.surfaceContainerHigh,
                    color: active ? tokens.onPrimary : tokens.onSurface,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 180ms ease',
                  }}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. COLOR PALETTES & COURSE THEME (Always available in BOTH design systems!) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 4 : 12 }}>
        {isAndroid && (
          <div style={{ marginBottom: 6 }}>
            <MainSwitchPillCard
              title="Usar cores do sistema"
              subtitle={
                settings.useSystemDynamicColor
                  ? systemDynamicColor
                    ? `Sincronizado com o papel de parede (${systemDynamicColor.seedHex})`
                    : `Ativo (${effectiveSeedHex})`
                  : 'Desativado • Usando tema selecionado abaixo'
              }
              checked={settings.useSystemDynamicColor}
              onChange={(checked) => {
                refreshSystemDynamicColor();
                updateSettings({
                  useSystemDynamicColor: checked,
                  autoCourseSeed: false,
                  paletteStyle: isMaterialYou ? 'tonalSpot' : 'editorial',
                });
              }}
              icon={<Smartphone size={20} />}
            />
          </div>
        )}

        <ExpressiveSegmentedCard
          index={0}
          total={isMaterialYou ? 2 : 1}
          style={{ padding: isMaterialYou ? '18px 20px' : '22px 24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconShapeContainer size={42}>
                <Palette size={18} />
              </IconShapeContainer>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                  Cor Automática do Curso ({detectedClassCode ?? 'CTI'})
                </div>
                <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant }}>
                  Adapta a cor de destaque automaticamente ao seu curso (Informática, Eletrônica ou Mecânica).
                </div>
              </div>
            </div>
            <ExpressiveSwitch
              checked={settings.autoCourseSeed}
              onChange={(val) => {
                if (val) {
                  const preset = detectCoursePresetFromClassCode(detectedClassCode);
                  updateSettings({
                    autoCourseSeed: true,
                    useSystemDynamicColor: false,
                    presetId: preset.id,
                    seedHex: preset.seedHex,
                    paletteStyle: isMaterialYou ? 'expressive' : 'editorial',
                  });
                } else {
                  updateSettings({
                    autoCourseSeed: false,
                    presetId: EDITORIAL_PRESET_ID,
                    seedHex: EDITORIAL_SEED_HEX,
                    paletteStyle: isMaterialYou ? 'expressive' : 'editorial',
                  });
                }
              }}
            />
          </div>

          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Temas e Cores de Destaque Predefinidos
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {APERTURE_PALETTE_PRESETS.map((preset) => {
              const isSelected =
                !settings.useSystemDynamicColor && settings.presetId === preset.id;

              return (
                <ApertureThemeSwatch
                  key={preset.id}
                  primary={preset.primaryPreview}
                  secondary={preset.secondaryPreview}
                  tertiary={preset.tertiaryPreview}
                  selected={isSelected}
                  label={preset.label}
                  sublabel={preset.courseTag}
                  onClick={() =>
                    updateSettings({
                      presetId: preset.id,
                      seedHex: preset.seedHex,
                      autoCourseSeed: false,
                      useSystemDynamicColor: false,
                      paletteStyle: isMaterialYou
                        ? preset.isEditorial
                          ? 'editorial'
                          : 'expressive'
                        : 'editorial',
                    })
                  }
                />
              );
            })}
          </div>
        </ExpressiveSegmentedCard>

        {/* Profile Photo Shape Selector (available in all design systems; defaults to circle) */}
        <ExpressiveSegmentedCard index={1} total={isMaterialYou ? 3 : 2} style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span
              aria-hidden="true"
              style={{
                width: 44,
                height: 44,
                borderRadius: resolveAvatarRadius(settings.avatarShape, 44),
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.92rem',
                flexShrink: 0,
                transition: 'border-radius 220ms cubic-bezier(0.2, 0, 0, 1)',
              }}
            >
              NS
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                Formato das Fotos de Perfil
              </div>
              <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant }}>
                Escolha o formato dos avatares nos chats, ranking e canal da turma.
              </div>
            </div>
          </div>

          <EnhancedConnectedButtonGroup<AvatarShapeVariant>
            wrap={true}
            value={settings.avatarShape}
            onChange={(avatarShape) => updateSettings({ avatarShape })}
            options={[
              { value: 'circle', label: 'Redondo' },
              { value: 'squircle', label: 'Squircle' },
              { value: 'rounded', label: 'Arredondado' },
              { value: 'square', label: 'Quadrado' },
            ]}
          />
        </ExpressiveSegmentedCard>

        {/* Icon Shape Selector (Only applicable in Material You Redesign mode) */}
        {isMaterialYou && (
          <ExpressiveSegmentedCard index={2} total={3} style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <IconShapeContainer size={44} active>
                <Shapes size={19} />
              </IconShapeContainer>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                  Formato dos Ícones
                </div>
                <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant }}>
                  Escolha a moldura geométrica exibida nos cartões do modo Material You.
                </div>
              </div>
            </div>

            <EnhancedConnectedButtonGroup<IconShapeVariant>
              wrap={true}
              value={settings.iconShape}
              onChange={(iconShape) => updateSettings({ iconShape })}
              options={[
                { value: 'random', label: 'Aleatório' },
                { value: 'cookie6', label: 'Estrela Suave' },
                { value: 'squircle', label: 'Quadrado Suave' },
                { value: 'clover', label: 'Trevo' },
                { value: 'pentagon', label: 'Pentágono' },
                { value: 'pill', label: 'Círculo' },
              ]}
            />
          </ExpressiveSegmentedCard>
        )}
      </section>
    </div>
  );
};
