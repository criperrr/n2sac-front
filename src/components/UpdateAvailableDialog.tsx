import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, PackageCheck, Sparkles, Zap } from 'lucide-react';
import { useM3Theme } from '../theme/ThemeContext';
import { formatVersionLabel } from '../appVersion';
import {
  applyOtaUpdate,
  hasNativeApkUpdater,
  installNativeDownloadedApk,
  startNativeApkDownload,
  type NativeUpdateInfo,
} from '../updater/autoUpdater';
import { EnhancedMorphButton } from './expressive/ExpressivePrimitives';
import { ExpressiveModal, ModalHeader } from './expressive/ExpressiveModal';
import { MorphingShapeIndicator } from './expressive/ShapeMorph';
import { openExternalUrl } from '../platform/openExternal';

type ApkDownloadState = 'idle' | 'downloading' | 'ready' | 'error';

/** Themed "update available" popup shown on app open/resume (OTA reload or native APK download). */
export const UpdateAvailableDialog: React.FC<{
  update: NativeUpdateInfo;
  onDismiss: () => void;
}> = ({ update, onDismiss }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [applying, setApplying] = useState(false);
  const [apkState, setApkState] = useState<ApkDownloadState>(update.cachedReady ? 'ready' : 'idle');
  const [apkProgress, setApkProgress] = useState(update.cachedReady ? 100 : 0);
  const [apkError, setApkError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const isOta = update.source === 'server-ota';
  const isNativeApk = !isOta && hasNativeApkUpdater();
  const notes = update.notes.trim();

  useEffect(() => {
    const onNativeProgress = (ev: Event) => {
      const detail = (ev as CustomEvent<{ state: string; progress: number; error: string | null }>).detail;
      if (!detail) return;
      if (detail.state === 'downloading') {
        setApkState('downloading');
        setApkProgress(Math.max(0, Math.min(100, detail.progress ?? 0)));
      } else if (detail.state === 'done') {
        setApkProgress(100);
        setApkState('ready');
      } else if (detail.state === 'error') {
        setApkState('error');
        setApkError(detail.error || 'Falha ao baixar o APK.');
      }
    };
    window.addEventListener('nsac:apk-download', onNativeProgress);
    return () => {
      window.removeEventListener('nsac:apk-download', onNativeProgress);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleDownloadApk = async () => {
    setApkError(null);
    setApkProgress(0);
    setApkState('downloading');

    if (hasNativeApkUpdater() && startNativeApkDownload(update.downloadUrl, update.apkSha256 ?? '', update.version)) {
      return;
    }

    // Fallback for APKs prior to 1.1.0: stream download in WebView with live progress bar.
    try {
      const res = await fetch(update.downloadUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const total = Number(res.headers.get('content-length') || 0);
      const reader = res.body?.getReader();
      if (!reader) {
        const blob = await res.blob();
        blobUrlRef.current = URL.createObjectURL(blob);
        setApkProgress(100);
        setApkState('ready');
        return;
      }

      const chunks: BlobPart[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) {
            setApkProgress(Math.min(99, Math.round((received / total) * 100)));
          }
        }
      }
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(blob);
      setApkProgress(100);
      setApkState('ready');
    } catch {
      setApkState('error');
      setApkError('Não foi possível baixar o APK. Tente novamente.');
    }
  };

  const handleInstallApk = () => {
    if (hasNativeApkUpdater() && installNativeDownloadedApk()) {
      return;
    }
    // Android WebView ignores `blob:` downloads; open the HTTPS APK URL directly so the system
    // browser/DownloadManager downloads and launches the Android package installer.
    window.open(update.downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const busy = applying || apkState === 'downloading';

  return (
    <ExpressiveModal ariaLabel="Atualização disponível" onClose={onDismiss} maxWidth={440} zIndex={10000}>
      {(close) => (
        <>
          <ModalHeader
            icon={<Sparkles size={21} />}
            eyebrow={
              isOta
                ? 'Atualização rápida'
                : update.important
                  ? 'Atualização importante'
                  : 'Nova versão do app'
            }
            title={formatVersionLabel(update.version)}
            onClose={() => {
              if (!busy) close();
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginTop: 18,
              padding: '12px 14px',
              borderRadius: isMaterialYou ? 20 : 12,
              backgroundColor: tokens.surfaceContainer,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            {isOta ? (
              <Zap size={18} color={tokens.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : apkState === 'ready' ? (
              <CheckCircle2 size={18} color={tokens.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <Download size={18} color={tokens.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <div style={{ fontSize: '0.84rem', lineHeight: 1.5, color: tokens.onSurfaceVariant, flex: 1 }}>
              {isOta
                ? 'Leva só alguns segundos: o app recarrega já atualizado, sem reinstalar.'
                : apkState === 'ready'
                  ? 'Download verificado (SHA-256) e pronto! Toque em Instalar para atualizar o aplicativo.'
                  : 'Baixe e instale a nova versão do aplicativo em segundo plano (com verificação SHA-256).'}
              {notes && !isOta && (
                <div style={{ marginTop: 6, color: tokens.onSurface, whiteSpace: 'pre-line' }}>{notes}</div>
              )}
              {apkError && (
                <div style={{ marginTop: 6, color: tokens.error, fontWeight: 600 }}>{apkError}</div>
              )}
            </div>
          </div>

          {isNativeApk && (apkState === 'downloading' || apkState === 'ready') && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: tokens.onSurfaceVariant,
                  marginBottom: 6,
                }}
              >
                <span>{apkState === 'ready' ? 'Pronto para instalar' : 'Baixando atualização…'}</span>
                <span>{apkProgress}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: tokens.surfaceContainerHighest,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${apkProgress}%`,
                    height: '100%',
                    borderRadius: 999,
                    backgroundColor: tokens.primary,
                    transition: 'width 160ms cubic-bezier(0.2, 0, 0, 1)',
                  }}
                />
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
              flexWrap: 'wrap',
            }}
          >
            <EnhancedMorphButton variant="outlined" size="sm" onClick={() => close()} disabled={busy}>
              Depois
            </EnhancedMorphButton>

            {isOta ? (
              <EnhancedMorphButton
                size="sm"
                icon={applying ? <MorphingShapeIndicator size={16} label="Atualizando" /> : <Zap size={15} />}
                disabled={applying}
                onClick={() => {
                  setApplying(true);
                  void applyOtaUpdate(update.buildId, update.version).catch(() => setApplying(false));
                }}
              >
                {applying ? 'Atualizando…' : 'Atualizar agora'}
              </EnhancedMorphButton>
            ) : isNativeApk ? (
              apkState === 'ready' ? (
                <EnhancedMorphButton
                  size="sm"
                  icon={<PackageCheck size={15} />}
                  onClick={handleInstallApk}
                >
                  Instalar
                </EnhancedMorphButton>
              ) : (
                <EnhancedMorphButton
                  size="sm"
                  icon={
                    apkState === 'downloading' ? (
                      <MorphingShapeIndicator size={18} color={tokens.onPrimary} label="Baixando" />
                    ) : (
                      <Download size={15} />
                    )
                  }
                  disabled={apkState === 'downloading'}
                  onClick={() => void handleDownloadApk()}
                >
                  {apkState === 'downloading' ? `Baixando (${apkProgress}%)` : 'Baixar atualização'}
                </EnhancedMorphButton>
              )
            ) : (
              <EnhancedMorphButton
                size="sm"
                icon={<Download size={15} />}
                onClick={() => {
                  const target = update.downloadUrl || update.releaseUrl;
                  if (!target) return;
                  openExternalUrl(target);
                  window.setTimeout(() => close(), 250);
                }}
              >
                Baixar atualização
              </EnhancedMorphButton>
            )}
          </div>
        </>
      )}
    </ExpressiveModal>
  );
};
