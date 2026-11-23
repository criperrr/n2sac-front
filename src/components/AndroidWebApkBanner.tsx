import React, { useEffect, useState } from 'react';
import { Bell, Download, ShieldCheck, Smartphone, Sparkles, X } from 'lucide-react';
import { formatVersionLabel } from '../appVersion';
import { useM3Theme } from '../theme/ThemeContext';
import { fetchAndroidWebApkOffer, type AndroidWebApkOffer } from '../updater/autoUpdater';
import { ExpressiveModal, ModalHeader } from './expressive/ExpressiveModal';
import { EnhancedMorphButton } from './expressive/ExpressivePrimitives';

const MODAL_DISMISSED_KEY = 'n2sac_android_web_apk_modal_dismissed_v1';
const PILL_DISMISSED_KEY = 'n2sac_android_web_apk_pill_dismissed_v1';

/**
 * Shown only when an Android user accesses the web version in a mobile browser (Chrome, Firefox,
 * Samsung Internet, Brave, etc.). Suggests downloading the latest official APK from GitHub Releases,
 * and collapses to a discrete floating pill if the user chooses to continue in the browser.
 */
export const AndroidWebApkPrompt: React.FC = () => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [offer, setOffer] = useState<AndroidWebApkOffer | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(MODAL_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [pillDismissed, setPillDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(PILL_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    void fetchAndroidWebApkOffer().then((res) => {
      if (!cancelled && res) setOffer(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!offer) return null;

  const dismissModal = () => {
    setModalOpen(false);
    try {
      sessionStorage.setItem(MODAL_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const dismissPill = () => {
    setPillDismissed(true);
    try {
      sessionStorage.setItem(PILL_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const triggerDownload = () => {
    const a = document.createElement('a');
    a.href = offer.apkUrl;
    a.download = `n2sac-${offer.version}.apk`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      {modalOpen && (
        <ExpressiveModal
          ariaLabel="Baixar aplicativo Android do n²sac"
          onClose={dismissModal}
          maxWidth={440}
          zIndex={10020}
        >
          {(close) => (
            <>
              <ModalHeader
                icon={<Smartphone size={21} />}
                eyebrow="Você está no Android"
                title={`Baixe o app ${formatVersionLabel(offer.version)}`}
                onClose={() => close()}
              />

              <div
                style={{
                  marginTop: 16,
                  padding: '14px 16px',
                  borderRadius: isMaterialYou ? 22 : 12,
                  backgroundColor: tokens.surfaceContainer,
                  border: `1px solid ${tokens.outlineVariant}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: '0.84rem',
                  color: tokens.onSurfaceVariant,
                  lineHeight: 1.45,
                }}
              >
                <div style={{ color: tokens.onSurface, fontWeight: 700 }}>
                  Instale o APK oficial pelo GitHub Releases para ter a experiência completa:
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Bell size={15} color={tokens.primary} style={{ flexShrink: 0 }} />
                  <span>Notificações push instantâneas de notas, mensagens e seguidores</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Sparkles size={15} color={tokens.primary} style={{ flexShrink: 0 }} />
                  <span>Cores dinâmicas Material You do seu Android e gesto voltar nativo</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <ShieldCheck size={15} color={tokens.primary} style={{ flexShrink: 0 }} />
                  <span>Atualizações automáticas em 1 toque direto pelo aplicativo</span>
                </div>

                <div
                  style={{
                    marginTop: 2,
                    padding: '8px 10px',
                    borderRadius: isMaterialYou ? 14 : 8,
                    backgroundColor: tokens.surfaceContainerHigh,
                    fontSize: '0.75rem',
                    color: tokens.onSurfaceVariant,
                  }}
                >
                  <strong style={{ color: tokens.onSurface }}>Dica ao instalar:</strong> se o Play Protect exibir um aviso de app fora da loja, toque em{' '}
                  <strong style={{ color: tokens.onSurface }}>Mais detalhes → Instalar assim mesmo</strong>.
                </div>

                {offer.notes && (
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 8,
                      borderTop: `1px solid ${tokens.outlineVariant}`,
                      fontSize: '0.78rem',
                      color: tokens.onSurfaceVariant,
                    }}
                  >
                    <strong style={{ color: tokens.onSurface }}>Novidades da v{offer.version}:</strong>{' '}
                    {offer.notes}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 18,
                  flexWrap: 'wrap',
                }}
              >
                <EnhancedMorphButton variant="outlined" size="sm" onClick={() => close()}>
                  Continuar no navegador
                </EnhancedMorphButton>
                <EnhancedMorphButton
                  size="sm"
                  icon={<Download size={15} />}
                  onClick={() => {
                    triggerDownload();
                    close();
                  }}
                >
                  Baixar APK (v{offer.version})
                </EnhancedMorphButton>
              </div>
            </>
          )}
        </ExpressiveModal>
      )}

      {!modalOpen && !pillDismissed && (
        <div
          role="region"
          aria-label="Download do aplicativo Android"
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            top: 'calc(10px + env(safe-area-inset-top, 0px))',
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '8px 10px 8px 14px',
            borderRadius: 999,
            backgroundColor: tokens.primaryContainer,
            color: tokens.onPrimaryContainer,
            border: `1px solid ${tokens.outlineVariant}`,
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.32)',
          }}
        >
          <div
            onClick={() => setModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
              flex: 1,
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            <Smartphone size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              App Android disponível ({formatVersionLabel(offer.version)})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={triggerDownload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                backgroundColor: tokens.primary,
                color: tokens.onPrimary,
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Download size={13} />
              Baixar APK
            </button>
            <button
              type="button"
              aria-label="Fechar sugestão de app"
              onClick={dismissPill}
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                border: 'none',
                backgroundColor: 'transparent',
                color: tokens.onPrimaryContainer,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
