import React, { useEffect, useRef, useState } from 'react';
import { Crown, UserRound } from 'lucide-react';
import { getCachedProfileImage, loadProfileImage } from '../../api/nsacClient';
import { resolveAvatarRadius } from '../../theme/materialYou';
import { useM3Theme } from '../../theme/ThemeContext';
import { useProfileViewer, type ProfilePreview } from './ProfileViewer';

/** Up to two initials ("Gabriel Camaforte" → "GC"); anonymous labels have none. */
function initialsOf(name: string): string {
  if (/^Aluno #/i.test(name)) return '';
  const parts = name.split(/\s+/).filter((p) => /\p{L}/u.test(p));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase();
}

/**
 * Server path (needs the token) → object URL; `data:`/`blob:` sources are used as they are.
 * Returns `undefined` while loading and `null` when there is no image (or it failed).
 * Pass `enabled = false` to defer network fetches until an avatar nears the viewport.
 */
function useProfileImage(path: string | null | undefined, enabled = true): string | null | undefined {
  const { token } = useProfileViewer();
  const direct = path && /^(data|blob):/.test(path) ? path : null;
  const cached = !direct && path ? getCachedProfileImage(path) : null;
  const immediate = direct ?? cached;
  const [url, setUrl] = useState<string | null | undefined>(immediate ?? (path ? undefined : null));
  useEffect(() => {
    if (immediate) {
      setUrl(immediate);
      return;
    }
    if (!path || !token) {
      setUrl(null);
      return;
    }
    if (!enabled) {
      return;
    }
    setUrl(undefined);
    let cancelled = false;
    void loadProfileImage(token, path).then((loaded) => {
      if (!cancelled) setUrl(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [path, token, immediate, enabled]);
  return url;
}

export { useProfileImage };

const avatarVisibilityCallbacks = new WeakMap<Element, () => void>();
let sharedAvatarObserver: IntersectionObserver | null = null;

function observeAvatarVisibility(el: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  if (!sharedAvatarObserver) {
    sharedAvatarObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = avatarVisibilityCallbacks.get(entry.target);
          if (cb) {
            avatarVisibilityCallbacks.delete(entry.target);
            sharedAvatarObserver?.unobserve(entry.target);
            cb();
          }
        }
      },
      { rootMargin: '220px 0px' }
    );
  }
  avatarVisibilityCallbacks.set(el, onVisible);
  sharedAvatarObserver.observe(el);
  return () => {
    avatarVisibilityCallbacks.delete(el);
    sharedAvatarObserver?.unobserve(el);
  };
}

/**
 * Profile photo (or initials) with an optional ranking badge: `#N` on the photo's corner, or a
 * crown for 1st place. When `profile` is given and that profile is open to the viewer, tapping
 * the avatar opens it — so the profile is reachable from every place a photo shows up.
 */
export const ProfileAvatar: React.FC<{
  name: string;
  /** Server path (`/api/v1/profiles/…`) or a `data:` URL. */
  image?: string | null;
  size?: number;
  rank?: number | null;
  highlight?: boolean;
  /** Opens this profile on tap (only when `profile.canOpen`). */
  profile?: ProfilePreview & { canOpen: boolean };
}> = ({ name, image, size = 44, rank = null, highlight = false, profile }) => {
  const { tokens, settings } = useM3Theme();
  const { openProfile } = useProfileViewer();
  const containerRef = useRef<HTMLSpanElement>(null);
  const needsLazyLoad = Boolean(
    image && !/^(data|blob):/.test(image) && !getCachedProfileImage(image)
  );
  const [inView, setInView] = useState<boolean>(
    () => !needsLazyLoad || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (!needsLazyLoad || inView) return;
    const el = containerRef.current;
    if (!el) return;
    return observeAvatarVisibility(el, () => setInView(true));
  }, [needsLazyLoad, inView]);

  const url = useProfileImage(image, inView);
  // Keyed by URL: an already-decoded image can fire onLoad before any effect would reset a flag.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loaded = Boolean(url) && loadedUrl === url;

  const initials = initialsOf(name);
  const radius = resolveAvatarRadius(settings.avatarShape, size);
  const isFirst = rank === 1;
  const badgeSize = Math.max(18, Math.round(size * 0.44));
  const clickable = Boolean(profile?.canOpen);

  const content = (
    <span
      ref={containerRef}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-block',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isFirst
            ? tokens.gradeWarningContainer
            : highlight
              ? tokens.primaryContainer
              : tokens.surfaceContainerHighest,
          color: isFirst ? tokens.onGradeWarningContainer : highlight ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
          fontWeight: 800,
          fontSize: Math.round(size * 0.36),
          letterSpacing: '-0.02em',
          boxShadow: isFirst ? `0 0 0 2px ${tokens.gradeWarning}` : undefined,
        }}
      >
        {initials || <UserRound size={Math.round(size * 0.5)} />}
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={() => setLoadedUrl(url)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 220ms cubic-bezier(0.2, 0, 0, 1)',
            }}
          />
        )}
      </span>
      {rank !== null && (
        <span
          aria-label={isFirst ? '1º lugar' : `${rank}º lugar`}
          style={{
            position: 'absolute',
            right: -Math.round(badgeSize * 0.28),
            bottom: -Math.round(badgeSize * 0.2),
            minWidth: badgeSize,
            height: badgeSize,
            padding: isFirst ? 0 : '0 4px',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(10, Math.round(badgeSize * 0.52)),
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            backgroundColor: isFirst ? tokens.gradeWarning : highlight ? tokens.primary : tokens.surfaceContainerHighest,
            color: isFirst ? tokens.onGradeWarningContainer : highlight ? tokens.onPrimary : tokens.onSurface,
            boxShadow: `0 0 0 2px ${tokens.surfaceContainerLow}`,
          }}
        >
          {isFirst ? <Crown size={Math.round(badgeSize * 0.62)} strokeWidth={2.6} /> : rank}
        </span>
      )}
    </span>
  );

  if (!clickable || !profile) return content;
  return (
    <button
      type="button"
      data-no-size-morph
      aria-label={`Ver perfil de ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        openProfile(profile, e.currentTarget);
      }}
      style={{
        padding: 0,
        border: 'none',
        background: 'none',
        borderRadius: radius,
        cursor: 'pointer',
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      {content}
    </button>
  );
};
