import React from 'react';
import { Bell } from 'lucide-react';
import type { AccountProfileResponse } from '../api/types';
import { NotificationQuickToggle } from '../components/settings/NotificationSettings';
import { M3_SPRINGS, useSpringValue } from '../theme/springPhysics';
import { useM3Theme } from '../theme/ThemeContext';
import { AnimatedNumber, IconShapeContainer } from '../components/expressive/ExpressivePrimitives';
import { PollCountdownLabel } from '../components/PollCountdown';

export const SentinelaScreen: React.FC<{
  token: string;
  accountProfile: AccountProfileResponse | null;
  onProfileUpdated: (profile: AccountProfileResponse) => void;
  etag: string | null;
  lastStatus: 200 | 304 | null;
  cachedAt: number | null;
  nextPollHintSecs: number;
  nextPollAt: number | null;
  isPageVisible: boolean;
  refreshCooldownUntil: number | null;
  isRefreshing: boolean;
  onManualRefresh: (forceBackendRefresh: boolean) => void;
  onOpenSettings: () => void;
}> = ({
  token,
  accountProfile,
  onProfileUpdated,
  cachedAt,
  nextPollHintSecs,
  nextPollAt,
  isPageVisible,
  isRefreshing,
  onOpenSettings,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const activityState =
    nextPollHintSecs <= 60
      ? {
          mode: 'Verificação Intensa',
          certainty: 94,
          description:
            'Lançamento recente de notas detectado na sua turma. As verificações estão mais frequentes.',
          bg: tokens.gradeWarningContainer,
          fg: tokens.onGradeWarningContainer,
        }
      : nextPollHintSecs <= 180
        ? {
            mode: 'Período de Lançamento',
            certainty: 76,
            description:
              'Período típico de publicação de notas no CTI.',
            bg: tokens.primaryContainer,
            fg: tokens.onPrimaryContainer,
          }
        : {
            mode: 'Monitoramento Automático',
            certainty: 34,
            description:
              'Monitoramento automático ativo para avisar quando saírem novas notas na sua turma.',
            bg: tokens.gradeSuccessContainer,
            fg: tokens.onGradeSuccessContainer,
          };

  const animatedCertainty = useSpringValue(activityState.certainty, M3_SPRINGS.numberGauge);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 18 : 14 }}>
      {/* 1. MONITORING HERO CARD */}
      <section
        style={{
          borderRadius: isMaterialYou ? 32 : 12,
          padding: isMaterialYou ? '24px 22px' : '18px 20px',
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconShapeContainer size={isMaterialYou ? 52 : 42} active={isRefreshing}>
              <Bell size={isMaterialYou ? 25 : 20} />
            </IconShapeContainer>
            <div>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: tokens.primary, textTransform: 'uppercase' }}>
                Turma {accountProfile?.class_code ?? 'CTI'}
              </div>
              <h1 style={{ margin: 0, fontSize: isMaterialYou ? '1.55rem' : '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                Alertas & Conta
              </h1>
            </div>
          </div>

          <span
            style={{
              padding: isMaterialYou ? '6px 14px' : '4px 10px',
              borderRadius: isMaterialYou ? 999 : 6,
              fontSize: '0.74rem',
              fontWeight: 700,
              backgroundColor: activityState.bg,
              color: activityState.fg,
            }}
          >
            {activityState.mode}
          </span>
        </div>

        <p style={{ margin: '0 0 18px', fontSize: '0.88rem', color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
          {activityState.description}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 24,
              backgroundColor: tokens.surfaceContainerHigh,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: 700 }}>
              <span>PROBABILIDADE DE LANÇAMENTO</span>
              <span style={{ color: tokens.primary }}>
                <AnimatedNumber value={activityState.certainty} decimals={0} suffix="%" />
              </span>
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                backgroundColor: tokens.surfaceContainerLowest,
                marginTop: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${animatedCertainty.toFixed(1)}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: tokens.primary,
                }}
              />
            </div>
            <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant, marginTop: 8 }}>
              Estimativa baseada no histórico de lançamentos da turma
            </div>
          </div>

          <div
            style={{
              padding: '16px 18px',
              borderRadius: 24,
              backgroundColor: tokens.surfaceContainerHigh,
              border: `1px solid ${tokens.outlineVariant}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: 700 }}>
              <span>PRÓXIMA VERIFICAÇÃO</span>
              <span style={{ color: tokens.gradeSuccess }}>
                <PollCountdownLabel
                  nextPollAt={nextPollAt}
                  paused={!isPageVisible}
                  fallbackSecs={nextPollHintSecs}
                />
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant, marginTop: 10 }}>
              {cachedAt
                ? `Última atualização às ${new Date(cachedAt).toLocaleTimeString('pt-BR')}`
                : 'Sincronizado com o portal'}
            </div>
          </div>
        </div>
      </section>

      {/* 2. NOTIFICATIONS: one switch here; device + Discord details live in Configurações. */}
      <NotificationQuickToggle
        token={token}
        accountProfile={accountProfile}
        onProfileUpdated={onProfileUpdated}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
};
