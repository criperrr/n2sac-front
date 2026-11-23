import React, { useState } from 'react';
import { usePageScrollLock } from '../theme/scrollLock';
import { createPortal } from 'react-dom';
import { Trophy, EyeOff, ShieldCheck, Check, X } from 'lucide-react';
import { useM3Theme } from '../theme/ThemeContext';
import {
  EnhancedMorphButton,
  ExpressiveSwitch,
  IconShapeContainer,
} from './expressive/ExpressivePrimitives';
import { useBackLayer } from '../navigation/backStack';
import { MorphingShapeIndicator } from './expressive/ShapeMorph';

export const RankingConsentModal: React.FC<{
  open: boolean;
  saving: boolean;
  onDecide: (optedIn: boolean, hideName: boolean) => Promise<void>;
}> = ({ open, saving, onDecide }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [hideName, setHideName] = useState(false);
  // Mandatory choice: back is consumed so nothing underneath closes.
  useBackLayer(open, () => {}, { kind: 'blocking' });
  usePageScrollLock(open);

  if (!open || typeof document === 'undefined') return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Participar do Ranking e Comparação"
      className="m3-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
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
          maxWidth: 480,
          borderRadius: isMaterialYou ? 32 : 16,
          padding: isMaterialYou ? '26px 24px' : '28px 28px',
          backgroundColor: tokens.surfaceContainerLow,
          color: tokens.onSurface,
          border: `1px solid ${tokens.outlineVariant}`,
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IconShapeContainer size={48} active>
            <Trophy size={22} />
          </IconShapeContainer>
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: tokens.primary,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Privacidade & Ranking • n²sac
            </div>
            <h2
              className={!isMaterialYou ? 'openai-serif-display' : undefined}
              style={{
                margin: '2px 0 0',
                fontSize: isMaterialYou ? '1.35rem' : '1.55rem',
                fontWeight: isMaterialYou ? 800 : 400,
              }}
            >
              Participar do Ranking?
            </h2>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.88rem', color: tokens.onSurfaceVariant, lineHeight: 1.55 }}>
          Você gostaria de participar do ranking e da comparação de médias com outros alunos do CTI
          que também aceitaram participar? Você pode mudar de ideia ou sair a qualquer momento na
          aba <strong>Ranking</strong>.
        </p>

        {/* Hide Name Toggle */}
        <div
          onClick={() => setHideName((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderRadius: isMaterialYou ? 18 : 12,
            backgroundColor: tokens.surfaceContainer,
            border: `1px solid ${hideName ? tokens.primary : tokens.outlineVariant}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <EyeOff size={18} color={hideName ? tokens.primary : tokens.onSurfaceVariant} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                Ocultar meu nome (Modo Anônimo)
              </div>
              <div style={{ fontSize: '0.75rem', color: tokens.onSurfaceVariant }}>
                Aparecer no ranking como &quot;Aluno #XXX&quot; em vez do seu nome.
              </div>
            </div>
          </div>
          <ExpressiveSwitch checked={hideName} onChange={setHideName} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.76rem',
            color: tokens.onSurfaceVariant,
          }}
        >
          <ShieldCheck size={15} color={tokens.gradeSuccess} style={{ flexShrink: 0 }} />
          <span>
            Participando com nome visível, seu perfil fica acessível para os colegas (e sua foto
            aparece no ranking — você pode ocultá-la a qualquer momento). Quem escolher &quot;Não
            participar&quot; nunca aparece no ranking nem em comparações.
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <EnhancedMorphButton
            variant="outlined"
            size="md"
            disabled={saving}
            icon={<X size={15} />}
            onClick={() => onDecide(false, hideName)}
          >
            Não participar
          </EnhancedMorphButton>
          <EnhancedMorphButton
            variant="filled"
            size="md"
            disabled={saving}
            icon={saving ? <MorphingShapeIndicator size={16} label="Salvando" /> : <Check size={15} />}
            onClick={() => onDecide(true, hideName)}
          >
            {saving ? 'Salvando...' : 'Sim, participar'}
          </EnhancedMorphButton>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
