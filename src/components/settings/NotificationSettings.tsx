import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Check, ExternalLink, MessageSquare, RefreshCw, Settings } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  deleteAccountFcmToken,
  fetchAccountConnections,
  fetchNotificationPreferences,
  NsacApiClientError,
  startConnectionOAuth,
  updateAccountDiscordLink,
  updateAccountFcmToken,
  updateNotificationPreferences,
} from '../../api/nsacClient';
import type {
  AccountConnection,
  AccountProfileResponse,
  NotificationPreferences,
  RoomChatNotificationMode,
} from '../../api/types';
import { registerNativeFcmPush } from '../../notifications/pushService';
import { openExternalUrl, preopenTabForWeb } from '../../platform/openExternal';
import { useM3Theme } from '../../theme/ThemeContext';
import { useMinimumBusy } from '../../theme/motion';
import { EnhancedMorphButton, ExpressiveSegmentedCard, IconShapeContainer, MainSwitchPillCard } from '../expressive/ExpressivePrimitives';
import { Expandable } from '../expressive/Expandable';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';

type Feedback = { type: 'success' | 'error'; message: string } | null;

export interface NotificationProps {
  token: string;
  accountProfile: AccountProfileResponse | null;
  onProfileUpdated: (profile: AccountProfileResponse) => void;
}

/** Device push (FCM) on/off/refresh, shared by Configurações and the Alertas quick toggle. */
export function useDeviceNotifications({ token, accountProfile, onProfileUpdated }: NotificationProps) {
  const enabled = Boolean(accountProfile?.has_fcm_token);
  const [saving, setSaving] = useState(false);
  const busy = useMinimumBusy(saving);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(t);
  }, [feedback]);

  const enable = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('Abra o app Android para ativar as notificações neste aparelho.');
      }
      const fcmToken = await registerNativeFcmPush(token);
      if (!fcmToken) throw new Error('O Android não liberou as notificações para o n²sac.');
      onProfileUpdated(await updateAccountFcmToken(token, fcmToken));
      setFeedback({ type: 'success', message: enabled ? 'Notificações atualizadas.' : 'Notificações ativadas.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Não foi possível ativar as notificações.' });
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await deleteAccountFcmToken(token);
      if (res.profile) onProfileUpdated(res.profile);
      else if (accountProfile) onProfileUpdated({ ...accountProfile, has_fcm_token: false });
      setFeedback({ type: 'success', message: 'Notificações desativadas neste aparelho.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Não foi possível desativar.' });
    } finally {
      setSaving(false);
    }
  };

  return { enabled, saving, busy, feedback, enable, disable };
}

const FeedbackLine: React.FC<{ feedback: Feedback }> = ({ feedback }) => {
  const { tokens } = useM3Theme();
  return (
    <Expandable open={Boolean(feedback)}>
      {feedback && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 16,
            fontSize: '0.82rem',
            fontWeight: 600,
            backgroundColor: feedback.type === 'success' ? tokens.gradeSuccessContainer : tokens.errorContainer,
            color: feedback.type === 'success' ? tokens.onGradeSuccessContainer : tokens.onErrorContainer,
          }}
        >
          {feedback.message}
        </div>
      )}
    </Expandable>
  );
};

/** Alertas: one main switch; the details live in Configurações. */
export const NotificationQuickToggle: React.FC<NotificationProps & { onOpenSettings: () => void }> = ({ onOpenSettings, ...props }) => {
  const { tokens } = useM3Theme();
  const device = useDeviceNotifications(props);
  // Optimistic: the switch moves right away, then settles on the server answer.
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    if (!device.saving) setPending(null);
  }, [device.saving]);
  const checked = pending ?? device.enabled;

  return (
    <section>
      <MainSwitchPillCard
        title={checked ? 'Avisos de notas ativados' : 'Avisos de notas desativados'}
        subtitle={
          device.busy
            ? 'Salvando…'
            : checked
              ? `Você recebe um aviso quando sair nota na turma ${props.accountProfile?.class_code ?? ''}`.trim()
              : 'Ative para ser avisado assim que sair nota nova'
        }
        checked={checked}
        icon={device.busy ? <MorphingShapeIndicator size={20} label="Salvando" /> : checked ? <Bell size={20} /> : <BellOff size={20} />}
        onChange={(next) => {
          if (device.saving) return;
          setPending(next);
          void (next ? device.enable() : device.disable());
        }}
      />
      <FeedbackLine feedback={device.feedback} />
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          marginTop: 8,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          border: 'none',
          borderRadius: 999,
          background: 'transparent',
          color: tokens.primary,
          fontFamily: 'inherit',
          fontSize: '0.82rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <Settings size={15} /> Notificações e Discord nas Configurações
      </button>
    </section>
  );
};

/** Configurações → Notificações: device push + Discord OAuth notifications. */
export const NotificationSettingsSection: React.FC<NotificationProps> = (props) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const { accountProfile, token, onProfileUpdated } = props;
  const device = useDeviceNotifications(props);

  const linkedId = accountProfile?.discord_id ?? null;
  const [discordConn, setDiscordConn] = useState<AccountConnection | null>(null);
  const [savingDiscord, setSavingDiscord] = useState(false);
  const busyDiscord = useMinimumBusy(savingDiscord);
  const [discordFeedback, setDiscordFeedback] = useState<Feedback>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadDiscordConnection = useCallback(async () => {
    try {
      const res = await fetchAccountConnections(token);
      const found = res.connections.find((c) => c.provider === 'discord') ?? null;
      setDiscordConn(found);
    } catch {
      // ignore if offline
    }
  }, [token]);

  useEffect(() => {
    void loadDiscordConnection();
    const onFocus = () => void loadDiscordConnection();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadDiscordConnection]);

  useEffect(() => {
    let cancelled = false;
    void fetchNotificationPreferences(token)
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const patchPrefs = async (
    patch: Partial<{
      grades_enabled: boolean;
      announcements_enabled: boolean;
      social_enabled: boolean;
      room_chat_mode: RoomChatNotificationMode;
      room_offtopic_mode: RoomChatNotificationMode;
    }>
  ) => {
    setSavingPrefs(true);
    try {
      const updated = await updateNotificationPreferences(token, patch);
      setPrefs(updated);
    } catch {
      // ignore
    } finally {
      setSavingPrefs(false);
    }
  };

  useEffect(() => {
    if (!discordFeedback) return;
    const t = window.setTimeout(() => setDiscordFeedback(null), 4500);
    return () => window.clearTimeout(t);
  }, [discordFeedback]);

  const connectDiscordOAuth = async () => {
    setSavingDiscord(true);
    setDiscordFeedback(null);
    const preopened = preopenTabForWeb();
    try {
      const { authorize_url } = await startConnectionOAuth(
        token,
        'discord',
        Capacitor.isNativePlatform() ? 'android' : 'web'
      );
      const outcome = openExternalUrl(authorize_url, preopened);
      if (outcome === 'needs-apk-update') {
        setDiscordFeedback({
          type: 'error',
          message: 'Atualize o app Android para abrir o login do Discord no navegador.',
        });
      }
    } catch (err) {
      if (preopened && !preopened.closed) preopened.close();
      setDiscordFeedback({
        type: 'error',
        message: err instanceof NsacApiClientError ? err.message : 'Não foi possível iniciar a conexão com o Discord.',
      });
    } finally {
      setSavingDiscord(false);
    }
  };

  const toggleDiscordNotifications = async (enable: boolean) => {
    const targetId = discordConn?.external_id ?? linkedId;
    if (enable && !targetId) {
      await connectDiscordOAuth();
      return;
    }
    setSavingDiscord(true);
    setDiscordFeedback(null);
    try {
      const updated = await updateAccountDiscordLink(token, enable && targetId ? targetId : '');
      onProfileUpdated(updated);
      setDiscordFeedback({
        type: 'success',
        message: enable
          ? 'Notificações no Discord ativadas.'
          : 'Notificações no Discord desativadas.',
      });
    } catch (err) {
      setDiscordFeedback({
        type: 'error',
        message: err instanceof NsacApiClientError ? err.message : 'Não foi possível atualizar as notificações do Discord.',
      });
    } finally {
      setSavingDiscord(false);
    }
  };

  const radius = isMaterialYou ? 20 : 12;
  const title: React.CSSProperties = { fontWeight: 800, fontSize: '1.02rem' };
  const sub: React.CSSProperties = { fontSize: '0.8rem', color: tokens.onSurfaceVariant, marginTop: 2, lineHeight: 1.4 };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: isMaterialYou ? 18 : 14 }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 4px 8px' }}>
        Notificações
      </div>

      {/* Device push */}
      <ExpressiveSegmentedCard index={0} total={2} style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <IconShapeContainer
            size={44}
            containerColor={device.enabled ? tokens.gradeSuccessContainer : tokens.surfaceContainerHighest}
            contentColor={device.enabled ? tokens.onGradeSuccessContainer : tokens.onSurfaceVariant}
          >
            {device.enabled ? <Bell size={19} /> : <BellOff size={19} />}
          </IconShapeContainer>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={title}>Neste aparelho</span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  backgroundColor: device.enabled ? tokens.gradeSuccessContainer : tokens.surfaceContainerHighest,
                  color: device.enabled ? tokens.onGradeSuccessContainer : tokens.onSurfaceVariant,
                }}
              >
                {device.enabled ? 'Ativo' : 'Desativado'}
              </span>
            </div>
            <div style={sub}>
              Avisos em alta prioridade quando sair nota nova ou anúncio na turma <strong>{accountProfile?.class_code ?? 'CTI'}</strong>, além de mensagens e pedidos de amizade.
            </div>
          </div>
        </div>

        {device.enabled && prefs && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: radius,
              backgroundColor: tokens.surfaceContainerHigh,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: '0.82rem',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontWeight: 700 }}>Notas do NSAC (alta prioridade)</span>
              <input
                type="checkbox"
                disabled={savingPrefs}
                checked={prefs.grades_enabled}
                onChange={(e) => void patchPrefs({ grades_enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: tokens.primary }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontWeight: 700 }}>Anúncios da Turma (alta prioridade)</span>
              <input
                type="checkbox"
                disabled={savingPrefs}
                checked={prefs.announcements_enabled}
                onChange={(e) => void patchPrefs({ announcements_enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: tokens.primary }}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontWeight: 700 }}>Chat da Turma</span>
              <select
                disabled={savingPrefs}
                value={prefs.room_chat_mode}
                onChange={(e) => void patchPrefs({ room_chat_mode: e.target.value as RoomChatNotificationMode })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 10,
                  border: `1px solid ${tokens.outlineVariant}`,
                  backgroundColor: tokens.surface,
                  color: tokens.onSurface,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <option value="mentions">Só respostas</option>
                <option value="all">Todas</option>
                <option value="muted">Silenciado</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontWeight: 700 }}>Chat Off-Topic</span>
              <select
                disabled={savingPrefs}
                value={prefs.room_offtopic_mode}
                onChange={(e) => void patchPrefs({ room_offtopic_mode: e.target.value as RoomChatNotificationMode })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 10,
                  border: `1px solid ${tokens.outlineVariant}`,
                  backgroundColor: tokens.surface,
                  color: tokens.onSurface,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <option value="muted">Silenciado</option>
                <option value="mentions">Só respostas</option>
                <option value="all">Todas</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: device.enabled ? '1fr 1fr' : '1fr', gap: 8, marginTop: 14 }}>
          <EnhancedMorphButton
            size="md"
            variant={device.enabled ? 'tonal' : 'filled'}
            fullWidth
            disabled={device.busy}
            icon={device.busy ? <MorphingShapeIndicator size={16} label="Salvando" /> : device.enabled ? <RefreshCw size={15} /> : <Bell size={15} />}
            onClick={() => void device.enable()}
          >
            {device.busy ? 'Salvando…' : device.enabled ? 'Atualizar' : 'Ativar notificações'}
          </EnhancedMorphButton>
          {device.enabled && (
            <EnhancedMorphButton size="md" variant="error" fullWidth disabled={device.busy} icon={<BellOff size={15} />} onClick={() => void device.disable()}>
              Desativar
            </EnhancedMorphButton>
          )}
        </div>
        <FeedbackLine feedback={device.feedback} />
      </ExpressiveSegmentedCard>

      {/* Discord */}
      <ExpressiveSegmentedCard index={1} total={2} style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <IconShapeContainer size={44} containerColor="#5865F2" contentColor="#FFFFFF">
            <MessageSquare size={19} />
          </IconShapeContainer>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={title}>Discord</div>
            <div style={sub}>Conecte sua conta do Discord para receber avisos de notas por mensagem direta pelo n²sac.</div>
          </div>
        </div>

        {discordConn || linkedId ? (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: radius,
                backgroundColor: tokens.surfaceContainerHigh,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tokens.gradeSuccessContainer,
                  color: tokens.onGradeSuccessContainer,
                }}
              >
                <Check size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>Discord conectado</div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: tokens.onSurfaceVariant,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {discordConn?.display_name || (discordConn?.handle ? `@${discordConn.handle}` : `ID ${linkedId}`)}
                </div>
              </div>
            </div>
            <MainSwitchPillCard
              title="Receber notificações no Discord"
              subtitle={linkedId ? 'Avisos de novas notas enviados por DM' : 'Ative para receber avisos por DM'}
              checked={Boolean(linkedId)}
              onChange={(next) => {
                if (!busyDiscord) void toggleDiscordNotifications(next);
              }}
            />
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <EnhancedMorphButton
              size="md"
              variant="filled"
              fullWidth
              disabled={busyDiscord}
              icon={busyDiscord ? <MorphingShapeIndicator size={16} label="Conectando" /> : <MessageSquare size={16} />}
              onClick={() => void connectDiscordOAuth()}
            >
              {busyDiscord ? 'Abrindo Discord…' : 'Conectar conta do Discord'}
            </EnhancedMorphButton>
          </div>
        )}

        <FeedbackLine feedback={discordFeedback} />

        <a
          href="https://discord.com/oauth2/authorize?client_id=1391245623965126808"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: radius,
            border: `1px solid ${tokens.outlineVariant}`,
            color: tokens.onSurface,
            textDecoration: 'none',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800 }}>Adicionar o n²sac a um servidor</span>
            <span style={{ display: 'block', fontSize: '0.76rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>Avisos de nota direto no servidor da sua turma</span>
          </span>
          <ExternalLink size={18} color={tokens.onSurfaceVariant} />
        </a>
      </ExpressiveSegmentedCard>
    </section>
  );
};
