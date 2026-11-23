import React, { useState } from 'react';
import { Flag, ImageOff, MessageSquareWarning } from 'lucide-react';
import { reportProfile, type ReportKind } from '../../api/nsacClient';
import { useM3Theme } from '../../theme/ThemeContext';
import { useMinimumBusy } from '../../theme/motion';
import { ExpressiveModal, ModalHeader } from '../expressive/ExpressiveModal';
import { EnhancedMorphButton } from '../expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';

const OPTIONS: { kind: ReportKind; title: string; detail: string; icon: React.ReactNode }[] = [
  {
    kind: 'media',
    title: 'Foto ou banner impróprio',
    detail: 'Nudez, conteúdo sexual ou imagem chocante.',
    icon: <ImageOff size={20} />,
  },
  {
    kind: 'text',
    title: 'Nome ou bio ofensivo',
    detail: 'Xingamento, discurso de ódio ou assédio.',
    icon: <MessageSquareWarning size={20} />,
  },
];

/**
 * Anonymous report of someone's profile content. The server acts on its own once enough
 * different people report the same thing; one report alone changes nothing.
 */
export const ReportSheet: React.FC<{
  token: string;
  accountId: number;
  label: string;
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ token, accountId, label, onClose, onDone }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useMinimumBusy(sending, 700);
  const [error, setError] = useState<string | null>(null);

  const submit = async (close: (after?: () => void) => void) => {
    if (!kind) return;
    setSending(true);
    setError(null);
    try {
      const outcome = await reportProfile(token, accountId, kind);
      close(() =>
        onDone(outcome === 'already_reported' ? 'Você já denunciou isso. Obrigado!' : 'Denúncia enviada. Obrigado por ajudar!')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a denúncia.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ExpressiveModal ariaLabel={`Denunciar ${label}`} onClose={onClose} maxWidth={420} zIndex={10140}>
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalHeader icon={<Flag size={20} />} eyebrow="Denúncia anônima" title={`Denunciar ${label}`} onClose={() => close()} />
          <p style={{ margin: 0, fontSize: '0.84rem', color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
            {label} não fica sabendo quem denunciou. Quando várias pessoas diferentes denunciam a mesma coisa, o conteúdo é
            removido automaticamente.
          </p>
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OPTIONS.map((o) => {
              const selected = kind === o.kind;
              return (
                <button
                  key={o.kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setKind(o.kind)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    borderRadius: isMaterialYou ? 20 : 12,
                    border: `1.5px solid ${selected ? tokens.error : tokens.outlineVariant}`,
                    backgroundColor: selected ? tokens.errorContainer : tokens.surfaceContainer,
                    color: selected ? tokens.onErrorContainer : tokens.onSurface,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background-color 200ms, border-color 200ms',
                  }}
                >
                  <span style={{ display: 'inline-flex', color: selected ? tokens.onErrorContainer : tokens.error }}>{o.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem' }}>{o.title}</span>
                    <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.8, marginTop: 2 }}>{o.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {error && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: tokens.error }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <EnhancedMorphButton variant="outlined" fullWidth onClick={() => close()}>
              Cancelar
            </EnhancedMorphButton>
            <EnhancedMorphButton
              variant="error"
              fullWidth
              disabled={!kind || busy}
              icon={busy ? <MorphingShapeIndicator size={16} label="Enviando" /> : <Flag size={15} />}
              onClick={() => void submit(close)}
            >
              {busy ? 'Enviando…' : 'Denunciar'}
            </EnhancedMorphButton>
          </div>
        </div>
      )}
    </ExpressiveModal>
  );
};
