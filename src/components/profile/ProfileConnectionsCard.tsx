import React, { useCallback, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  BadgeCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  deleteAccountConnection,
  fetchAccountConnections,
  NsacApiClientError,
  startConnectionOAuth,
  upsertAccountConnection,
} from '../../api/nsacClient';
import type { AccountConnection } from '../../api/types';
import { openExternalUrl, preopenTabForWeb } from '../../platform/openExternal';
import { useM3Theme } from '../../theme/ThemeContext';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../expressive/ExpressivePrimitives';
import { DiscordIcon, SpotifyIcon } from './BrandIcons';

interface OAuthCardDef {
  id: 'spotify' | 'discord';
  label: string;
  tagline: string;
  accent: string;
  icon: React.ReactNode;
}

const PROVIDERS: OAuthCardDef[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    tagline: 'Mostre seu perfil verificado do Spotify',
    accent: '#1DB954',
    icon: <SpotifyIcon size={20} />,
  },
  {
    id: 'discord',
    label: 'Discord',
    tagline: 'Vincule seu Discord para perfil e notificações',
    accent: '#5865F2',
    icon: <DiscordIcon size={20} />,
  },
];

export const ProfileConnectionsCard: React.FC<{
  token: string;
  refreshSignal?: number;
}> = ({ token, refreshSignal = 0 }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [connections, setConnections] = useState<AccountConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAccountConnections(token);
      setConnections(
        data.connections.filter((c) => c.provider === 'spotify' || c.provider === 'discord')
      );
    } catch {
      // ignore offline
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // Automatically reload when returning from the system browser after OAuth
  useEffect(() => {
    let disposed = false;
    let appListener: { remove: () => Promise<void> } | null = null;
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void load();
      }).then((h) => {
        if (disposed) void h.remove();
        else appListener = h;
      });
    }
    return () => {
      disposed = true;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      if (appListener) void appListener.remove();
    };
  }, [load]);

  const handleConnectOAuth = async (provider: OAuthCardDef) => {
    setConnectingId(provider.id);
    setErrorMsg(null);
    setNotice(null);
    const preopened = preopenTabForWeb();
    try {
      const platform = Capacitor.isNativePlatform() ? 'android' : 'web';
      const { authorize_url } = await startConnectionOAuth(token, provider.id, platform);
      const outcome = openExternalUrl(authorize_url, preopened);
      if (outcome === 'needs-apk-update') {
        setErrorMsg('Atualize o aplicativo Android para abrir o login no navegador.');
        return;
      }
      setNotice(`Autorize o ${provider.label} no navegador — sua conta aparece aqui assim que você voltar.`);
    } catch (err) {
      if (preopened && !preopened.closed) preopened.close();
      setErrorMsg(
        err instanceof NsacApiClientError
          ? err.message
          : `Não foi possível iniciar o login com ${provider.label}.`
      );
    } finally {
      setConnectingId(null);
    }
  };

  const handleToggleVisibility = async (conn: AccountConnection) => {
    setBusyId(conn.provider);
    try {
      const updated = await upsertAccountConnection(token, conn.provider, {
        is_visible: !conn.is_visible,
      });
      setConnections((prev) => prev.map((c) => (c.provider === updated.provider ? updated : c)));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setBusyId(provider);
    setErrorMsg(null);
    try {
      await deleteAccountConnection(token, provider);
      setConnections((prev) => prev.filter((c) => c.provider !== provider));
      setNotice(null);
    } catch {
      setErrorMsg('Não foi possível desconectar agora.');
    } finally {
      setBusyId(null);
    }
  };

  const connectedMap = new Map(connections.map((c) => [c.provider, c]));
  const cardRadius = isMaterialYou ? 18 : 12;

  return (
    <ExpressiveSegmentedCard
      index={0}
      total={1}
      style={{
        padding: '16px 16px',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: isMaterialYou ? 13 : 9,
            backgroundColor: tokens.secondaryContainer,
            color: tokens.onSecondaryContainer,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Link2 size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.96rem', color: tokens.onSurface }}>
            Contas conectadas
          </div>
          <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant }}>
            Conecte seu Spotify e Discord com 1 toque via login oficial
          </div>
        </div>
      </div>

      {notice && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: tokens.primaryContainer,
            color: tokens.onPrimaryContainer,
            fontSize: '0.78rem',
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {notice}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: tokens.errorContainer,
            color: tokens.onErrorContainer,
            fontSize: '0.78rem',
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginTop: 14 }}>
        {PROVIDERS.map((prov) => {
          const conn = connectedMap.get(prov.id);
          const isConnecting = connectingId === prov.id;
          const isBusy = busyId === prov.id;

          return (
            <div
              key={prov.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 12px',
                borderRadius: cardRadius,
                backgroundColor: tokens.surfaceContainerHigh,
                border: `1px solid ${conn ? `${prov.accent}66` : tokens.outlineVariant}`,
                opacity: conn && !conn.is_visible ? 0.68 : 1,
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 0%' }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: isMaterialYou ? 13 : 10,
                    backgroundColor: `${prov.accent}24`,
                    color: prov.accent,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {prov.icon}
                </span>

                <div style={{ minWidth: 0, flex: '1 1 0%', overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: tokens.onSurface,
                    }}
                  >
                    <span>{prov.label}</span>
                    {conn?.is_verified && <BadgeCheck size={15} color={prov.accent} />}
                  </div>
                  <div
                    style={{
                      fontSize: '0.73rem',
                      color: tokens.onSurfaceVariant,
                      lineHeight: 1.3,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {loading
                      ? 'Carregando…'
                      : conn
                        ? `${conn.display_name || conn.handle}${!conn.is_visible ? ' · Oculto no perfil' : ''}`
                        : prov.tagline}
                  </div>
                </div>
              </div>

              {conn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggleVisibility(conn)}
                    title={conn.is_visible ? 'Ocultar do perfil' : 'Mostrar no perfil'}
                    aria-label={conn.is_visible ? 'Ocultar do perfil' : 'Mostrar no perfil'}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: 'none',
                      background: tokens.surfaceContainerHighest,
                      color: tokens.onSurfaceVariant,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {conn.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDisconnect(conn.provider)}
                    title={`Desconectar ${prov.label}`}
                    aria-label={`Desconectar ${prov.label}`}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: 'none',
                      background: `${tokens.error}18`,
                      color: tokens.error,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div style={{ flexShrink: 0 }}>
                  <EnhancedMorphButton
                    size="sm"
                    variant="filled"
                    disabled={loading || isConnecting}
                    icon={
                      isConnecting ? (
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <ExternalLink size={14} />
                      )
                    }
                    onClick={() => void handleConnectOAuth(prov)}
                  >
                    {isConnecting ? 'Abrindo…' : 'Conectar'}
                  </EnhancedMorphButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ExpressiveSegmentedCard>
  );
};
