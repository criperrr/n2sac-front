import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, LogOut, Image as ImageIcon } from 'lucide-react';
import {
  fetchUserProfile,
  loadCachedUserProfile,
  updateUserProfile,
  type UserProfileData,
} from '../api/nsacClient';
import type { AccountProfileResponse } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../components/expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../components/expressive/ShapeMorph';
import { useMinimumBusy } from '../theme/motion';
import { PrivacySettingsCard } from '../components/PrivacySettingsCard';
import { SocialHubCard } from '../components/social/SocialHubCard';
import { compressImageToDataUrl } from '../utils/imageCompress';

export function extractFirstNameFromEmail(email?: string | null): string {
  if (!email) return 'Aluno';
  const local = email.split('@')[0]?.trim() ?? '';
  const first = local.split(/[._-]/)[0]?.trim() ?? '';
  if (!first) return 'Aluno';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
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
