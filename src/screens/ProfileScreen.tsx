import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, Check, LogOut, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import {
  fetchUserProfile,
  loadCachedUserProfile,
  updateUserProfile,
  verifyGoogleOfficialName,
  type UserProfileData,
} from '../api/nsacClient';
import type { AccountProfileResponse } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../components/expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../components/expressive/ShapeMorph';
import { useMinimumBusy } from '../theme/motion';
import { PrivacySettingsCard } from '../components/PrivacySettingsCard';
import { ProfileConnectionsCard } from '../components/profile/ProfileConnectionsCard';
import { SocialHubCard } from '../components/social/SocialHubCard';
import { compressImageToDataUrl } from '../utils/imageCompress';

export function extractFirstNameFromEmail(email?: string | null): string {
  if (!email) return 'Aluno';
  const local = email.split('@')[0]?.trim() ?? '';
  const parts = local
    .split(/[._-]/)
    .map((p) => p.replace(/\d+$/, '').trim())
    .filter(Boolean);
  if (parts.length === 0) return 'Aluno';
  const fmt = (s: string) =>
    s.length === 1 ? `${s.toUpperCase()}.` : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (parts[0]!.length <= 2 && parts.length > 1) {
    return parts.map(fmt).join(' ');
  }
  return parts.map(fmt).join(' ');
}

export const ProfileScreen: React.FC<{
  token: string;
  accountId: number;
  accountProfile: AccountProfileResponse | null;
  detectedClassCode: string | null;
  onLogout: () => void;
  refreshSignal?: number;
  onRefreshingChange?: (busy: boolean) => void;
}> = ({
  token,
  accountId,
  accountProfile,
  detectedClassCode,
  onLogout,
  refreshSignal = 0,
  onRefreshingChange,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const initialCached = loadCachedUserProfile(accountId);
  const [profile, setProfile] = useState<UserProfileData | null>(initialCached);
  const [displayName, setDisplayName] = useState(initialCached?.display_name ?? '');
  const [bio, setBio] = useState(initialCached?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialCached?.avatar_data_url ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialCached?.banner_data_url ?? null);
  const [saving, setSaving] = useState(false);
  const showSaving = useMinimumBusy(saving);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const fallbackFirstName = extractFirstNameFromEmail(accountProfile?.nsac_email);
  const mediaRestriction = profile?.restrictions?.find((r) => r.kind === 'media') ?? null;
  const textRestriction = profile?.restrictions?.find((r) => r.kind === 'text') ?? null;
  const restrictionText = (r: { until: string | null; permanent: boolean }, what: string) =>
    r.permanent || !r.until
      ? `Por denúncias repetidas da comunidade, você não pode mais alterar ${what}.`
      : `Por denúncias da comunidade, ${what} foi removido e só pode ser alterado depois de ${new Date(r.until).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;

  useEffect(() => {
    let cancelled = false;
    onRefreshingChangeRef.current?.(true);
    void (async () => {
      try {
        const data = await fetchUserProfile(token);
        if (cancelled) return;
        setProfile((prev) =>
          prev &&
          JSON.stringify(prev.restrictions ?? []) === JSON.stringify(data.restrictions ?? []) &&
          prev.display_name === data.display_name &&
          prev.bio === data.bio &&
          prev.avatar_data_url === data.avatar_data_url &&
          prev.banner_data_url === data.banner_data_url
            ? prev
            : data
        );
        setDisplayName((prev) => (prev === (data.display_name ?? '') ? prev : (data.display_name ?? '')));
        setBio((prev) => (prev === (data.bio ?? '') ? prev : (data.bio ?? '')));
        setAvatarUrl((prev) => (prev === data.avatar_data_url ? prev : data.avatar_data_url));
        setBannerUrl((prev) => (prev === data.banner_data_url ? prev : data.banner_data_url));
      } catch {
        // fallback gracefully if server is updating
      } finally {
        if (!cancelled) {
          onRefreshingChangeRef.current?.(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      onRefreshingChangeRef.current?.(false);
    };
  }, [token, refreshSignal]);

  const handlePickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 256, 0.82);
      setAvatarUrl(dataUrl);
      setStatusMsg(null);
    } catch {
      setStatusMsg('Não foi possível processar a foto de perfil.');
    }
  };

  const handlePickBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 1080, 360, 0.8);
      setBannerUrl(dataUrl);
      setStatusMsg(null);
    } catch {
      setStatusMsg('Não foi possível processar o banner.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const updated = await updateUserProfile(token, {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_data_url: avatarUrl,
        banner_data_url: bannerUrl,
      });
      setProfile(updated);
      // The server re-encodes new images: keep its version so the next save sends it unchanged.
      setAvatarUrl(updated.avatar_data_url);
      setBannerUrl(updated.banner_data_url);
      setStatusMsg('Perfil salvo com sucesso!');
    } catch (err) {
      setStatusMsg(err instanceof Error && err.message ? err.message : 'Erro ao salvar perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const shownName =
    displayName.trim() || profile?.first_name || fallbackFirstName;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hidden file inputs */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => void handlePickAvatar(e)}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => void handlePickBanner(e)}
          />

          {(mediaRestriction || textRestriction) && (
            <div
              role="alert"
              style={{
                padding: '14px 16px',
                borderRadius: isMaterialYou ? 20 : 12,
                backgroundColor: tokens.errorContainer,
                color: tokens.onErrorContainer,
                fontSize: '0.84rem',
                fontWeight: 600,
                lineHeight: 1.45,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {mediaRestriction && <span>{restrictionText(mediaRestriction, 'sua foto e banner')}</span>}
              {textRestriction && <span>{restrictionText(textRestriction, 'seu nome de exibição e bio')}</span>}
            </div>
          )}

          {/* Banner + Avatar Hero Card */}
          <div
            style={{
              borderRadius: isMaterialYou ? 28 : 16,
              overflow: 'hidden',
              backgroundColor: tokens.surfaceContainerLow,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            {/* Banner */}
            <div
              onClick={() => (mediaRestriction ? setStatusMsg(restrictionText(mediaRestriction, 'sua foto e banner')) : bannerInputRef.current?.click())}
              style={{
                position: 'relative',
                height: 140,
                cursor: 'pointer',
                background: bannerUrl
                  ? `url(${bannerUrl}) center/cover no-repeat`
                  : `linear-gradient(135deg, ${tokens.primaryContainer}, ${tokens.surfaceContainerHighest})`,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (mediaRestriction) setStatusMsg(restrictionText(mediaRestriction, 'sua foto e banner'));
                  else bannerInputRef.current?.click();
                }}
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(0,0,0,0.58)',
                  color: '#FFFFFF',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ImageIcon size={13} />
                <span>Alterar banner</span>
              </button>
            </div>

            {/* Avatar + Name */}
            <div style={{ padding: '0 20px 20px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -42, marginBottom: 12 }}>
                <div
                  onClick={() => (mediaRestriction ? setStatusMsg(restrictionText(mediaRestriction, 'sua foto e banner')) : avatarInputRef.current?.click())}
                  style={{
                    position: 'relative',
                    width: 84,
                    height: 84,
                    borderRadius: 999,
                    border: `4px solid ${tokens.surfaceContainerLow}`,
                    backgroundColor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    fontSize: '1.8rem',
                    fontWeight: 800,
                  }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={shownName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    shownName.charAt(0).toUpperCase()
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(0,0,0,0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0.85,
                    }}
                  >
                    <Camera size={18} color="#FFFFFF" />
                  </div>
                </div>

                {detectedClassCode && (
                  <span
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      backgroundColor: tokens.primaryContainer,
                      color: tokens.onPrimaryContainer,
                      fontSize: '0.76rem',
                      fontWeight: 800,
                    }}
                  >
                    {detectedClassCode} • CTI UNESP
                  </span>
                )}
              </div>

              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>
                {shownName}
              </h1>
              <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                {accountProfile?.nsac_email ?? ''}
              </div>
              {bio.trim() && (
                <p style={{ margin: '10px 0 0', fontSize: '0.86rem', lineHeight: 1.5, color: tokens.onSurface }}>
                  {bio}
                </p>
              )}
            </div>
          </div>

          {/* Official Institutional Name Verification via Google (@unesp.br) */}
          <GoogleOfficialNameCard
            token={token}
            nsacEmail={accountProfile?.nsac_email ?? null}
            profile={profile}
            onVerified={(updated) => {
              setProfile(updated);
              setStatusMsg(`Nome oficial confirmado via Google: ${updated.verified_official_name ?? updated.first_name}`);
            }}
          />

          {/* Edit Profile Form */}
          <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '20px 22px' }}>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 6, textTransform: 'uppercase' }}>
                  Nome de Exibição (padrão: {profile?.first_name ?? fallbackFirstName})
                </label>
                <input
                  type="text"
                  maxLength={48}
                  placeholder={profile?.first_name ?? fallbackFirstName}
                  value={displayName}
                  disabled={Boolean(textRestriction)}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '0 14px',
                    borderRadius: 12,
                    border: `1px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerLowest,
                    color: tokens.onSurface,
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 6, textTransform: 'uppercase' }}>
                  Bio
                </label>
                <textarea
                  rows={3}
                  maxLength={240}
                  placeholder="Conte um pouco sobre você, seu curso ou metas no CTI..."
                  value={bio}
                  disabled={Boolean(textRestriction)}
                  onChange={(e) => setBio(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: `1px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerLowest,
                    color: tokens.onSurface,
                    fontSize: '0.88rem',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {statusMsg && (
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: tokens.primary }}>
                  {statusMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <EnhancedMorphButton
                  type="submit"
                  variant="filled"
                  size="md"
                  disabled={showSaving}
                  icon={showSaving ? <MorphingShapeIndicator size={16} label="Salvando perfil" /> : <Check size={15} />}
                >
                  {showSaving ? 'Salvando...' : 'Salvar Perfil'}
                </EnhancedMorphButton>
              </div>
            </form>
          </ExpressiveSegmentedCard>
      </div>

      <ProfileConnectionsCard token={token} refreshSignal={refreshSignal} />

      <SocialHubCard token={token} />

      <PrivacySettingsCard token={token} refreshSignal={refreshSignal} />

      {/* Mobile: logout lives at the end of the profile (desktop keeps it in the rail footer). */}
      <div className="mobile-only-btn" style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <EnhancedMorphButton variant="error" size="md" fullWidth icon={<LogOut size={16} />} onClick={onLogout}>
          Sair da conta
        </EnhancedMorphButton>
      </div>
    </div>
  );
};

interface GoogleIdClient {
  initialize: (cfg: {
    client_id: string;
    callback: (resp: { credential?: string }) => void;
    hosted_domain?: string;
    login_hint?: string;
    ux_mode?: 'popup' | 'redirect';
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: { theme?: string; size?: string; shape?: string; text?: string; locale?: string; width?: number }
  ) => void;
  prompt: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdClient;
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;
function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google Identity Services')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

const GoogleOfficialNameCard: React.FC<{
  token: string;
  nsacEmail: string | null;
  profile: UserProfileData | null;
  onVerified: (updated: UserProfileData) => void;
}> = ({ token, nsacEmail, profile, onVerified }) => {
  const { tokens, isMaterialYou, effectiveIsDark } = useM3Theme();
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const buttonHostRef = useRef<HTMLDivElement | null>(null);

  const clientId =
    profile?.google_oauth_client_id?.trim() ||
    ((import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim() || '');
  const verifiedName = profile?.verified_official_name?.trim() || null;
  const needsVerification = Boolean(profile?.official_name_needs_verification) && !verifiedName;

  useEffect(() => {
    if (verifiedName || !clientId) return;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled) return;
        const gsi = window.google?.accounts?.id;
        if (!gsi || !buttonHostRef.current) return;
        gsi.initialize({
          client_id: clientId,
          hosted_domain: 'unesp.br',
          login_hint: nsacEmail ?? undefined,
          ux_mode: 'popup',
          callback: (resp) => {
            if (!resp.credential) {
              setErrorMsg('Não recebemos a credencial do Google. Tente novamente.');
              return;
            }
            setVerifying(true);
            setErrorMsg(null);
            void verifyGoogleOfficialName(token, resp.credential)
              .then((updated) => {
                onVerified(updated);
              })
              .catch((err) => {
                setErrorMsg(
                  err instanceof Error
                    ? err.message
                    : 'Não foi possível confirmar o nome oficial com o Google.'
                );
              })
              .finally(() => {
                setVerifying(false);
              });
          },
        });
        buttonHostRef.current.innerHTML = '';
        gsi.renderButton(buttonHostRef.current, {
          theme: effectiveIsDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: isMaterialYou ? 'pill' : 'rectangular',
          text: 'continue_with',
          locale: 'pt-BR',
        });
        setGsiReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar login do Google.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [verifiedName, clientId, nsacEmail, token, onVerified, effectiveIsDark, isMaterialYou]);

  if (verifiedName) {
    return (
      <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: isMaterialYou ? 12 : 8,
              backgroundColor: tokens.gradeSuccessContainer,
              color: tokens.onGradeSuccessContainer,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <BadgeCheck size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.gradeSuccess, textTransform: 'uppercase' }}>
              Nome oficial confirmado via Google (@unesp.br)
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: tokens.onSurface, marginTop: 1 }}>
              {verifiedName}
            </div>
          </div>
        </div>
      </ExpressiveSegmentedCard>
    );
  }

  return (
    <ExpressiveSegmentedCard
      index={0}
      total={1}
      style={{
        padding: '16px 18px',
        border: needsVerification ? `1px solid ${tokens.primary}` : undefined,
        backgroundColor: needsVerification ? tokens.primaryContainer + '28' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: isMaterialYou ? 12 : 8,
            backgroundColor: tokens.primaryContainer,
            color: tokens.onPrimaryContainer,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: tokens.onSurface }}>
            {needsVerification
              ? 'Seu e-mail institucional abrevia seu nome'
              : 'Confirmar nome oficial com Google (@unesp.br)'}
          </div>
          <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant, lineHeight: 1.45, marginTop: 2 }}>
            {needsVerification
              ? 'Confirme em 1 toque com sua conta Google da UNESP para puxar seu nome completo oficial automaticamente — sem precisar pedir aprovação manual.'
              : 'Use sua conta Google institucional (@unesp.br) para sincronizar seu nome oficial completo e acentuado no ranking e nas eleições da turma.'}
          </div>
        </div>
      </div>

      {clientId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div ref={buttonHostRef} style={{ minHeight: 40 }} />
          {!gsiReady && !errorMsg && (
            <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant }}>
              Carregando verificação do Google...
            </div>
          )}
          {verifying && (
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: tokens.primary }}>
              Validando conta @unesp.br com o Google...
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant }}>
          Aguardando configuração de <code>GOOGLE_OAUTH_CLIENT_ID</code> no servidor para ativar a confirmação via Google.
        </div>
      )}

      {errorMsg && (
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: tokens.error, marginTop: 8 }}>
          {errorMsg}
        </div>
      )}
    </ExpressiveSegmentedCard>
  );
};
