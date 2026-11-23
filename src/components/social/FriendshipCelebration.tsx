import React from 'react';
import { Handshake, MessageCircle, Sparkles } from 'lucide-react';
import { useM3Theme } from '../../theme/ThemeContext';
import { ExpressiveModal } from '../expressive/ExpressiveModal';
import { EnhancedMorphButton } from '../expressive/ExpressivePrimitives';
import { shapePaths } from '../expressive/ShapeMorph';
import { ProfileAvatar } from '../profile/ProfileAvatar';

export interface FriendshipCelebrationTarget {
  accountId: number;
  label: string;
  avatarUrl: string | null;
  classCode: string;
}

const HALO_PATH = shapePaths(49)[0]!;

const CONFETTI_SPECS = [
  { tx: '-110px', ty: '-86px', rot: '-42deg', shape: 'circle', size: 11, tone: 'primary' },
  { tx: '108px', ty: '-92px', rot: '38deg', shape: 'pill', size: 14, tone: 'tertiary' },
  { tx: '-132px', ty: '-14px', rot: '60deg', shape: 'diamond', size: 10, tone: 'secondary' },
  { tx: '134px', ty: '-18px', rot: '-55deg', shape: 'circle', size: 12, tone: 'success' },
  { tx: '-96px', ty: '68px', rot: '32deg', shape: 'pill', size: 13, tone: 'tertiary' },
  { tx: '98px', ty: '72px', rot: '-36deg', shape: 'diamond', size: 10, tone: 'primary' },
  { tx: '-46px', ty: '-112px', rot: '22deg', shape: 'diamond', size: 9, tone: 'success' },
  { tx: '50px', ty: '-108px', rot: '-28deg', shape: 'circle', size: 10, tone: 'primary' },
  { tx: '-64px', ty: '96px', rot: '-64deg', shape: 'circle', size: 9, tone: 'secondary' },
  { tx: '64px', ty: '94px', rot: '50deg', shape: 'pill', size: 12, tone: 'primary' },
  { tx: '0px', ty: '-122px', rot: '45deg', shape: 'pill', size: 11, tone: 'tertiary' },
  { tx: '4px', ty: '104px', rot: '-20deg', shape: 'diamond', size: 9, tone: 'success' },
] as const;

/**
 * Google / M3 Expressive celebration shown when two students mutually follow each other and
 * become friends: dynamic-color expanding ripples, rotating soft-burst halo, avatars springing
 * together, geometric confetti particles, and a direct shortcut to start chatting.
 */
export const FriendshipCelebrationModal: React.FC<{
  meLabel: string;
  meAvatarUrl: string | null;
  friend: FriendshipCelebrationTarget;
  onClose: () => void;
  onMessage: (friend: FriendshipCelebrationTarget) => void;
}> = ({ meLabel, meAvatarUrl, friend, onClose, onMessage }) => {
  const { tokens, isMaterialYou } = useM3Theme();

  const toneColor = (tone: (typeof CONFETTI_SPECS)[number]['tone']) => {
    switch (tone) {
      case 'primary':
        return tokens.primary;
      case 'secondary':
        return tokens.secondary;
      case 'tertiary':
        return tokens.tertiary;
      case 'success':
        return tokens.gradeSuccess;
    }
  };

  return (
    <ExpressiveModal
      ariaLabel={`Nova amizade com ${friend.label}`}
      onClose={onClose}
      maxWidth={430}
      zIndex={10120}
    >
      {(close) => (
        <div
          data-no-size-morph
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '18px 6px 6px',
            overflow: 'hidden',
          }}
        >
          {/* Stage: ripples + M3 soft-burst halo + radial confetti + dual avatars */}
          <div
            style={{
              position: 'relative',
              width: 240,
              height: 156,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Expanding Material You ripple rings */}
            {[0, 240, 480].map((delay, idx) => (
              <span
                key={delay}
                aria-hidden="true"
                className="n2sac-friend-ripple"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 112,
                  height: 112,
                  borderRadius: '50%',
                  border: `2px solid ${idx === 0 ? tokens.primary : idx === 1 ? tokens.tertiary : tokens.secondary}`,
                  animationDelay: `${delay}ms`,
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Rotating M3 soft-burst shape */}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              className="n2sac-crown-halo"
              style={{
                position: 'absolute',
                width: 146,
                height: 146,
                opacity: 0.22,
                pointerEvents: 'none',
              }}
            >
              <path d={HALO_PATH} fill={tokens.primary} />
            </svg>

            {/* Geometric M3 confetti burst */}
            {CONFETTI_SPECS.map((c, idx) => (
              <span
                key={idx}
                aria-hidden="true"
                className="n2sac-friend-confetti"
                style={
                  {
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: c.shape === 'pill' ? c.size * 1.45 : c.size,
                    height: c.shape === 'pill' ? c.size * 0.55 : c.size,
                    borderRadius: c.shape === 'circle' || c.shape === 'pill' ? 999 : 3,
                    backgroundColor: toneColor(c.tone),
                    pointerEvents: 'none',
                    '--tx': c.tx,
                    '--ty': c.ty,
                    '--rot': c.rot,
                  } as React.CSSProperties
                }
              />
            ))}

            {/* Two avatars springing together */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: 2 }}>
              <div
                className="n2sac-friend-avatar-l"
                style={{
                  padding: 4,
                  borderRadius: isMaterialYou ? '50%' : 24,
                  backgroundColor: tokens.surfaceContainerLow,
                  marginRight: -12,
                }}
              >
                <ProfileAvatar name={meLabel} image={meAvatarUrl} size={74} highlight />
              </div>

              <div
                className="n2sac-friend-badge"
                style={{
                  position: 'relative',
                  zIndex: 4,
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  backgroundColor: tokens.primary,
                  color: tokens.onPrimary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 0 4px ${tokens.surfaceContainerLow}`,
                }}
              >
                <Handshake size={19} />
              </div>

              <div
                className="n2sac-friend-avatar-r"
                style={{
                  padding: 4,
                  borderRadius: isMaterialYou ? '50%' : 24,
                  backgroundColor: tokens.surfaceContainerLow,
                  marginLeft: -12,
                }}
              >
                <ProfileAvatar name={friend.label} image={friend.avatarUrl} size={74} />
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 999,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: 4,
            }}
          >
            <Sparkles size={13} />
            Nova amizade
          </div>

          <h2
            style={{
              margin: '10px 0 4px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            Você e {friend.label.split(' ')[0]} são amigos!
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: 320,
              fontSize: '0.86rem',
              lineHeight: 1.5,
              color: tokens.onSurfaceVariant,
            }}
          >
            Como vocês dois se seguem, o chat direto entre vocês foi liberado.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 20 }}>
            <EnhancedMorphButton
              variant="filled"
              fullWidth
              icon={<MessageCircle size={16} />}
              onClick={() => close(() => { onClose(); onMessage(friend); })}
            >
              Enviar mensagem
            </EnhancedMorphButton>
            <EnhancedMorphButton variant="tonal" fullWidth onClick={() => close()}>
              Continuar
            </EnhancedMorphButton>
          </div>
        </div>
      )}
    </ExpressiveModal>
  );
};
