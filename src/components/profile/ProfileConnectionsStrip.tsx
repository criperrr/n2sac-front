import React, { useState } from 'react';
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Film,
  Gamepad2,
  Github,
  Globe,
  Instagram,
  Linkedin,
  MessageSquare,
  Music2,
  Tv,
  Youtube,
} from 'lucide-react';
import type { PublicConnection } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';

interface ProviderMeta {
  label: string;
  accent: string;
  icon: React.ReactNode;
}

export function getConnectionProviderMeta(provider: string): ProviderMeta {
  switch (provider) {
    case 'spotify':
      return { label: 'Spotify', accent: '#1DB954', icon: <Music2 size={14} /> };
    case 'discord':
      return { label: 'Discord', accent: '#5865F2', icon: <MessageSquare size={14} /> };
    case 'github':
      return { label: 'GitHub', accent: '#6E7681', icon: <Github size={14} /> };
    case 'steam':
      return { label: 'Steam', accent: '#1B75BB', icon: <Gamepad2 size={14} /> };
    case 'twitch':
      return { label: 'Twitch', accent: '#9146FF', icon: <Tv size={14} /> };
    case 'instagram':
      return { label: 'Instagram', accent: '#E1306C', icon: <Instagram size={14} /> };
    case 'tiktok':
      return { label: 'TikTok', accent: '#FE2C55', icon: <Music2 size={14} /> };
    case 'youtube':
      return { label: 'YouTube', accent: '#FF0000', icon: <Youtube size={14} /> };
    case 'x':
      return { label: 'X', accent: '#71767B', icon: <Globe size={14} /> };
    case 'roblox':
      return { label: 'Roblox', accent: '#00A2FF', icon: <Gamepad2 size={14} /> };
    case 'linkedin':
      return { label: 'LinkedIn', accent: '#0A66C2', icon: <Linkedin size={14} /> };
    case 'letterboxd':
      return { label: 'Letterboxd', accent: '#00E054', icon: <Film size={14} /> };
    default:
      return { label: provider, accent: '#6B7280', icon: <Globe size={14} /> };
  }
}

export const ProfileConnectionsStrip: React.FC<{
  connections: PublicConnection[];
}> = ({ connections }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);

  const visible = (connections ?? []).filter(
    (c) => c.provider === 'spotify' || c.provider === 'discord'
  );
  if (visible.length === 0) return null;

  const handleTap = (conn: PublicConnection) => {
    if (conn.profile_url) {
      window.open(conn.profile_url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(conn.handle).then(() => {
        setCopiedProvider(conn.provider);
        window.setTimeout(() => setCopiedProvider((cur) => (cur === conn.provider ? null : cur)), 1800);
      });
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: tokens.onSurfaceVariant,
          marginBottom: 8,
        }}
      >
        Conexões
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {visible.map((conn) => {
          const meta = getConnectionProviderMeta(conn.provider);
          const isCopied = copiedProvider === conn.provider;
          const displayLabel = conn.display_name?.trim() || conn.handle;
          return (
            <button
              key={conn.provider}
              type="button"
              onClick={() => handleTap(conn)}
              title={
                conn.is_verified
                  ? conn.verification_source === 'discord_import'
                    ? `${meta.label} — Verificado via Discord`
                    : `${meta.label} — Verificado`
                  : meta.label
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 11px',
                borderRadius: isMaterialYou ? 999 : 10,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerHigh,
                color: tokens.onSurface,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                maxWidth: '100%',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  backgroundColor: `${meta.accent}22`,
                  color: meta.accent,
                  flexShrink: 0,
                }}
              >
                {meta.icon}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 165,
                }}
              >
                {isCopied ? 'Copiado!' : displayLabel}
              </span>
              {conn.is_verified && (
                <BadgeCheck size={14} color={tokens.primary} style={{ flexShrink: 0 }} />
              )}
              {conn.profile_url ? (
                <ExternalLink size={12} color={tokens.onSurfaceVariant} style={{ flexShrink: 0 }} />
              ) : isCopied ? (
                <Check size={12} color={tokens.primary} style={{ flexShrink: 0 }} />
              ) : (
                <Copy size={12} color={tokens.onSurfaceVariant} style={{ flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
