import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { ExpressiveModal, ModalHeader } from './expressive/ExpressiveModal';
import { EnhancedMorphButton } from './expressive/ExpressivePrimitives';
import { useM3Theme } from '../theme/ThemeContext';

const SEEN_KEY_PREFIX = 'n2sac.google_name_prompt_seen.v1:';

export function hasSeenGoogleNamePrompt(accountId: number): boolean {
  try {
    return localStorage.getItem(`${SEEN_KEY_PREFIX}${accountId}`) === '1';
  } catch {
    return false;
  }
}

export function markGoogleNamePromptSeen(accountId: number): void {
  try {
    localStorage.setItem(`${SEEN_KEY_PREFIX}${accountId}`, '1');
  } catch {
    // ignore storage errors
  }
}

export const GoogleNamePromptModal: React.FC<{
  open: boolean;
  currentName: string;
  nsacEmail: string;
  needsVerification: boolean;
  onGoToProfile: () => void;
  onDismiss: () => void;
}> = ({ open, currentName, nsacEmail, needsVerification, onGoToProfile, onDismiss }) => {
  const { tokens, isMaterialYou } = useM3Theme();

  if (!open) return null;

  return (
    <ExpressiveModal onClose={onDismiss} maxWidth={440} ariaLabel="Confirmar nome oficial">
      {(close) => (
        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalHeader
            icon={<ShieldCheck size={18} />}
            eyebrow={needsVerification ? 'Nome abreviado detectado' : 'Primeiro acesso'}
            title="Quer confirmar seu nome oficial?"
            onClose={() => close()}
          />

        <div
          style={{
            padding: '12px 14px',
            borderRadius: isMaterialYou ? 18 : 10,
            backgroundColor: tokens.surfaceContainerLow,
            border: `1px solid ${tokens.outlineVariant}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: isMaterialYou ? 12 : 8,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Como aparece hoje
            </div>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: tokens.onSurface, marginTop: 1 }}>
              {currentName}
            </div>
            <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant }}>{nsacEmail}</div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: tokens.onSurfaceVariant }}>
          O portal NSAC não informa seu nome completo — apenas o e-mail <strong>@unesp.br</strong>, por isso alguns
          nomes acabam ficando abreviados ou sem acento.
        </p>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: isMaterialYou ? 16 : 10,
            backgroundColor: tokens.primaryContainer + '30',
            border: `1px solid ${tokens.primary}35`,
            fontSize: '0.8rem',
            lineHeight: 1.48,
            color: tokens.onSurface,
          }}
        >
          <strong>Como arrumar em 1 toque:</strong> vá em <strong>Perfil</strong> e clique no botão{' '}
          <strong>Continuar com o Google</strong> usando sua conta institucional (<code>@unesp.br</code>). O n²sac lê
          apenas seu nome e e-mail verificados pela UNESP para preencher automaticamente — sem depender de aprovação
          manual.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          <EnhancedMorphButton
            variant="filled"
            size="md"
            fullWidth
            icon={<ShieldCheck size={16} />}
            onClick={() => close(onGoToProfile)}
          >
            Confirmar com Google no Perfil
          </EnhancedMorphButton>
          <EnhancedMorphButton variant="tonal" size="sm" fullWidth onClick={() => close()}>
            Deixar como está por enquanto
          </EnhancedMorphButton>
        </div>
        </div>
      )}
    </ExpressiveModal>
  );
};
