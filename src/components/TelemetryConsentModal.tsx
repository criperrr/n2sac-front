import React from 'react';
import { usePageScrollLock } from '../theme/scrollLock';
import { Activity, ShieldCheck } from 'lucide-react';
import { useM3Theme } from '../theme/ThemeContext';
import { EnhancedMorphButton } from './expressive/ExpressivePrimitives';
import { useBackLayer } from '../navigation/backStack';

export const TelemetryConsentModal: React.FC<{
  onDecide: (granted: boolean) => void;
}> = ({ onDecide }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  // Mandatory choice: back is consumed so nothing underneath closes.
  useBackLayer(true, () => {}, { kind: 'blocking' });
  usePageScrollLock();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Telemetria de desempenho e diagnósticos"
      className="m3-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.76)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="m3-modal-dialog-enter"
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: isMaterialYou ? 28 : 16,
          padding: '22px 24px',
          backgroundColor: tokens.surfaceContainerLow,
          color: tokens.onSurface,
          border: `1px solid ${tokens.outlineVariant}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              Telemetria de Desempenho
            </h2>
            <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant }}>
              Ajude a deixar o n²sac mais rápido no seu aparelho
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.55, color: tokens.onSurfaceVariant }}>
          Podemos coletar periodicamente dados técnicos de desempenho (FPS, memória, travamentos,
          GPU/CPU do aparelho e relatórios de crash) para otimizar o app em cada hardware?
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: tokens.surfaceContainer,
            border: `1px solid ${tokens.outlineVariant}`,
            fontSize: '0.76rem',
            color: tokens.onSurfaceVariant,
          }}
        >
          <ShieldCheck size={16} color={tokens.primary} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Privacidade garantida:</strong> nenhuma nota, senha, e-mail ou dado pessoal é
            enviado na telemetria.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <EnhancedMorphButton variant="outlined" size="md" onClick={() => onDecide(false)}>
            Recusar
          </EnhancedMorphButton>
          <EnhancedMorphButton variant="filled" size="md" onClick={() => onDecide(true)}>
            Permitir coleta
          </EnhancedMorphButton>
        </div>
      </div>
    </div>
  );
};
