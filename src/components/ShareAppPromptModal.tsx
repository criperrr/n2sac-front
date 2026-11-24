import React, { useState } from 'react';
import { Check, Copy, Heart, Share2 } from 'lucide-react';
import { ExpressiveModal, ModalHeader } from './expressive/ExpressiveModal';
import { EnhancedMorphButton } from './expressive/ExpressivePrimitives';
import { useM3Theme } from '../theme/ThemeContext';

const SHARE_SITE_URL = 'https://notebook-server.tailddd6bf.ts.net';
const SHARE_PROMPT_STORAGE_KEY = 'n2sac.share_prompt.v1';
const SHARE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SHARE_SHOW_PROBABILITY = 0.28; // Relatively rare (~28% after cooldown)

interface SharePromptState {
  dismissedForever?: boolean;
  sharedAt?: number;
  lastShownAt?: number;
}

function readSharePromptState(): SharePromptState {
  try {
    const raw = localStorage.getItem(SHARE_PROMPT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SharePromptState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSharePromptState(next: SharePromptState): void {
  try {
    localStorage.setItem(SHARE_PROMPT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Decides whether the rare post-grade-notification share prompt should appear.
 * Respects permanent dismissal, prior share, a 14-day cooldown, and a ~28% roll.
 */
export function shouldTriggerRareSharePrompt(): boolean {
  const st = readSharePromptState();
  if (st.dismissedForever || st.sharedAt) return false;
  const now = Date.now();
  if (st.lastShownAt && now - st.lastShownAt < SHARE_COOLDOWN_MS) {
    return false;
  }
  return Math.random() < SHARE_SHOW_PROBABILITY;
}

export function markSharePromptShown(): void {
  const st = readSharePromptState();
  writeSharePromptState({ ...st, lastShownAt: Date.now() });
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const ShareAppPromptModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [copied, setCopied] = useState(false);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = async () => {
    const ok = await copyTextSafe(SHARE_SITE_URL);
    if (ok) {
      setCopied(true);
      writeSharePromptState({ ...readSharePromptState(), sharedAt: Date.now(), lastShownAt: Date.now() });
      window.setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1100);
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: 'n²sac — Boletim & Alertas do CTI',
        text: 'Dá uma olhada no n²sac! Avisa na hora quando sai nota no NSAC e mostra o boletim completo.',
        url: SHARE_SITE_URL,
      });
      writeSharePromptState({ ...readSharePromptState(), sharedAt: Date.now(), lastShownAt: Date.now() });
      onClose();
    } catch {
      // user cancelled native share sheet
    }
  };

  const handleNeverShow = () => {
    writeSharePromptState({ ...readSharePromptState(), dismissedForever: true, lastShownAt: Date.now() });
    onClose();
  };

  if (!open) return null;

  return (
    <ExpressiveModal onClose={onClose} maxWidth={440} ariaLabel="Compartilhar o n²sac">
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalHeader
            eyebrow="Compartilhe com seus amigos do CTI!"
            title="Está gostando do app?"
            icon={<Heart size={18} color={tokens.primary} />}
            onClose={() => close()}
          />

          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: tokens.onSurfaceVariant }}>
            Quanto mais gente da turma usa o <strong>n²sac</strong>, mais rápido o Sentinela detecta novas notas e mais completo fica o canal da sala.
          </p>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: isMaterialYou ? 16 : 8,
              backgroundColor: tokens.surfaceContainerHigh,
              border: `1px solid ${tokens.outlineVariant}`,
              fontSize: '0.78rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: tokens.onSurface,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {SHARE_SITE_URL}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: '1 1 180px' }}>
              <EnhancedMorphButton
                variant="filled"
                fullWidth
                icon={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={handleCopy}
              >
                {copied ? 'Link copiado!' : 'Copiar link do site'}
              </EnhancedMorphButton>
            </div>

            {canNativeShare && (
              <EnhancedMorphButton
                variant="tonal"
                icon={<Share2 size={16} />}
                onClick={handleNativeShare}
              >
                Enviar
              </EnhancedMorphButton>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <button
              type="button"
              onClick={() => close(handleNeverShow)}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 2px',
                fontSize: '0.75rem',
                color: tokens.onSurfaceVariant,
                cursor: 'pointer',
                textDecoration: 'underline',
                opacity: 0.8,
              }}
            >
              Não mostrar novamente
            </button>
            <button
              type="button"
              onClick={() => close()}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: tokens.primary,
                cursor: 'pointer',
              }}
            >
              Agora não
            </button>
          </div>
        </div>
      )}
    </ExpressiveModal>
  );
};
