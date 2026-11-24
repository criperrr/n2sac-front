import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BadgeCheck,
  Eye,
  EyeOff,
  ExternalLink,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  deleteAccountConnection,
  fetchAccountConnections,
  NsacApiClientError,
  startConnectionOAuth,
  upsertAccountConnection,
} from '../../api/nsacClient';
import type {
  AccountConnection,
  ConnectionProviderDescriptor,
} from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { ExpressiveModal, ModalHeader } from '../expressive/ExpressiveModal';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../expressive/ExpressivePrimitives';
import { getConnectionProviderMeta } from './ProfileConnectionsStrip';

export const ProfileConnectionsCard: React.FC<{
  token: string;
  refreshSignal?: number;
}> = ({ token, refreshSignal = 0 }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [connections, setConnections] = useState<AccountConnection[]>([]);
  const [providers, setProviders] = useState<ConnectionProviderDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<ConnectionProviderDescriptor | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAccountConnections(token);
      setConnections(data.connections);
      setProviders(data.providers);
    } catch {
      // ignore if backend not updated yet
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // Reload when returning from OAuth callback (/connections/done)
  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const openEditor = (desc: ConnectionProviderDescriptor, existing?: AccountConnection) => {
    setPickerOpen(false);
    setEditingProvider(desc);
    setHandleInput(existing?.profile_url || existing?.handle || '');
    setDisplayNameInput(existing?.display_name ?? '');
    setErrorMsg(null);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const saved = await upsertAccountConnection(token, editingProvider.id, {
        handle: handleInput.trim(),
        display_name: displayNameInput.trim() || null,
        is_visible: true,
      });
      setConnections((prev) => {
        const idx = prev.findIndex((c) => c.provider === saved.provider);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setEditingProvider(null);
      setNotice(`${editingProvider.label} salvo no seu perfil.`);
    } catch (err) {
      setErrorMsg(
        err instanceof NsacApiClientError
          ? err.message
          : 'Não foi possível salvar a conexão.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStartOAuth = async (desc: ConnectionProviderDescriptor) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const platform = Capacitor.isNativePlatform() ? 'android' : 'web';
      const { authorize_url } = await startConnectionOAuth(token, desc.id, platform);
      window.open(authorize_url, '_blank', 'noopener,noreferrer');
      setEditingProvider(null);
      setNotice(`Finalize o login com ${desc.label} no navegador para verificar.`);
    } catch (err) {
      setErrorMsg(
        err instanceof NsacApiClientError
          ? err.message
          : `Não foi possível iniciar a verificação com ${desc.label}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVisibility = async (conn: AccountConnection) => {
    try {
      const updated = await upsertAccountConnection(token, conn.provider, {
        is_visible: !conn.is_visible,
      });
      setConnections((prev) => prev.map((c) => (c.provider === updated.provider ? updated : c)));
    } catch {
      // ignore
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await deleteAccountConnection(token, provider);
      setConnections((prev) => prev.filter((c) => c.provider !== provider));
    } catch {
      // ignore
    }
  };

  const connectedMap = new Map(connections.map((c) => [c.provider, c]));

  return (
    <>
      <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: isMaterialYou ? 12 : 8,
                backgroundColor: tokens.secondaryContainer,
                color: tokens.onSecondaryContainer,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Link2 size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '0.94rem', color: tokens.onSurface }}>
                Conexões do Perfil
              </div>
              <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant }}>
                Spotify, Discord, GitHub, Steam, Instagram e mais
              </div>
            </div>
          </div>

          <EnhancedMorphButton
            size="sm"
            variant="tonal"
            icon={<Plus size={14} />}
            onClick={() => {
              setNotice(null);
              setPickerOpen(true);
            }}
          >
            Adicionar
          </EnhancedMorphButton>
        </div>

        {notice && (
          <div style={{ marginTop: 10, fontSize: '0.78rem', fontWeight: 600, color: tokens.primary }}>
            {notice}
          </div>
        )}

        {!loading && connections.length === 0 && (
          <div style={{ marginTop: 12, fontSize: '0.8rem', color: tokens.onSurfaceVariant, lineHeight: 1.45 }}>
            Nenhuma conexão adicionada ainda. Toque em <strong>Adicionar</strong> para vincular suas redes e exibir no seu perfil público.
          </div>
        )}

        {connections.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {connections.map((conn) => {
              const meta = getConnectionProviderMeta(conn.provider);
              const desc = providers.find((p) => p.id === conn.provider);
              return (
                <div
                  key={conn.provider}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    backgroundColor: tokens.surfaceContainerHigh,
                    border: `1px solid ${tokens.outlineVariant}`,
                    opacity: conn.is_visible ? 1 : 0.62,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => desc && openEditor(desc, conn)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      minWidth: 0,
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: tokens.onSurface,
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        backgroundColor: `${meta.accent}22`,
                        color: meta.accent,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.84rem', fontWeight: 800 }}>
                        <span>{meta.label}</span>
                        {conn.is_verified && <BadgeCheck size={14} color={tokens.primary} />}
                      </div>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: tokens.onSurfaceVariant,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conn.display_name || conn.handle}
                        {!conn.is_visible ? ' · Oculto' : ''}
                      </div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => void handleToggleVisibility(conn)}
                      title={conn.is_visible ? 'Ocultar do perfil' : 'Mostrar no perfil'}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: tokens.onSurfaceVariant,
                        padding: 6,
                        cursor: 'pointer',
                      }}
                    >
                      {conn.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(conn.provider)}
                      title="Remover conexão"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: tokens.error,
                        padding: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ExpressiveSegmentedCard>

      {pickerOpen && (
        <ExpressiveModal ariaLabel="Adicionar conexão" onClose={() => setPickerOpen(false)} maxWidth={440}>
          {(close) => (
            <>
              <ModalHeader
                icon={<Link2 size={18} />}
                eyebrow="Conexões do Perfil"
                title="Adicionar conexão"
                onClose={() => close()}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                {providers.map((desc) => {
                  const meta = getConnectionProviderMeta(desc.id);
                  const existing = connectedMap.get(desc.id);
                  return (
                    <button
                      key={desc.id}
                      type="button"
                      onClick={() => openEditor(desc, existing)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '10px 12px',
                        borderRadius: isMaterialYou ? 16 : 10,
                        border: `1px solid ${existing ? tokens.primary : tokens.outlineVariant}`,
                        backgroundColor: existing ? `${tokens.primaryContainer}55` : tokens.surfaceContainerHigh,
                        color: tokens.onSurface,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: `${meta.accent}22`,
                          color: meta.accent,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {meta.icon}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>{desc.label}</span>
                          {desc.oauth_enabled && <ShieldCheck size={12} color={tokens.primary} />}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>
                          {existing ? 'Conectado' : desc.oauth_enabled ? 'Verificável' : 'Link / @user'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </ExpressiveModal>
      )}

      {editingProvider && (
        <ExpressiveModal
          ariaLabel={`Conectar ${editingProvider.label}`}
          onClose={() => setEditingProvider(null)}
          maxWidth={420}
        >
          {(close) => (
            <>
              <ModalHeader
                icon={getConnectionProviderMeta(editingProvider.id).icon}
                eyebrow={editingProvider.oauth_enabled ? 'Verificação ou link' : 'Link de perfil'}
                title={`Conectar ${editingProvider.label}`}
                onClose={() => close()}
              />

              {editingProvider.oauth_enabled && (
                <div style={{ marginTop: 12, marginBottom: 14 }}>
                  <EnhancedMorphButton
                    variant="filled"
                    size="md"
                    fullWidth
                    disabled={busy}
                    icon={<ExternalLink size={15} />}
                    onClick={() => void handleStartOAuth(editingProvider)}
                  >
                    Verificar com {editingProvider.label}
                  </EnhancedMorphButton>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '0.72rem',
                      color: tokens.onSurfaceVariant,
                      marginTop: 10,
                    }}
                  >
                    {editingProvider.id === 'discord'
                      ? 'Verifica seu Discord e importa Spotify, Steam e outras contas automaticamente — ou adicione manualmente abaixo'
                      : 'ou adicione manualmente (sem selo verificado)'}
                  </div>
                </div>
              )}

              <form onSubmit={(e) => void handleSaveManual(e)} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 4 }}>
                    Usuário ou link oficial
                  </label>
                  <input
                    type="text"
                    required
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder={editingProvider.placeholder}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.surfaceContainerLowest,
                      color: tokens.onSurface,
                      fontSize: '0.86rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 4 }}>
                    Nome exibido (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={48}
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder="Ex.: meu perfil"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.surfaceContainerLowest,
                      color: tokens.onSurface,
                      fontSize: '0.86rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {errorMsg && (
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: tokens.error }}>
                    {errorMsg}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <EnhancedMorphButton
                    type="button"
                    variant="outlined"
                    size="sm"
                    onClick={() => close()}
                  >
                    Cancelar
                  </EnhancedMorphButton>
                  <EnhancedMorphButton type="submit" variant="filled" size="sm" disabled={busy}>
                    {busy ? 'Salvando...' : 'Salvar'}
                  </EnhancedMorphButton>
                </div>
              </form>
            </>
          )}
        </ExpressiveModal>
      )}
    </>
  );
};
