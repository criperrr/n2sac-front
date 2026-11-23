import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackLayer } from '../../navigation/backStack';
import { EASING, prefersReducedMotion } from '../../theme/motion';
import { AuthMediaImage } from './AuthMediaImage';

/**
 * Animated fullscreen image viewer with proper Android predictive-back support:
 * pressing Back or swiping closes ONLY the image with a smooth zoom+fade animation,
 * never dismissing the chat or screen underneath.
 */
export const AnimatedImageLightbox: React.FC<{
  token: string;
  src: string;
  alt: string;
  onClose: () => void;
}> = ({ token, src, alt, onClose }) => {
  const scrimRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 210,
      easing: EASING.standardDecelerate,
      fill: 'backwards',
    });
    cardRef.current?.animate(
      [
        { transform: 'scale(0.84)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: EASING.emphasizedDecelerate, fill: 'backwards' }
    );
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const scrim = scrimRef.current;
    const card = cardRef.current;
    if (!scrim || !card || prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    scrim.style.pointerEvents = 'none';
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 190,
      easing: EASING.standardAccelerate,
      fill: 'forwards',
    });
    const anim = card.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.84)', opacity: 0 },
      ],
      { duration: 190, easing: EASING.emphasizedAccelerate, fill: 'forwards' }
    );
    anim.finished.then(() => onCloseRef.current());
  }, []);

  useBackLayer(
    true,
    (source) => {
      if (source === 'gesture') {
        closingRef.current = true;
        onCloseRef.current();
      } else {
        close();
      }
    },
    { kind: 'modal', surfaceRef: cardRef, scrimRef }
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return createPortal(
    <div
      ref={scrimRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10200,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <button
        type="button"
        aria-label="Fechar imagem"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          right: 14,
          zIndex: 10205,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.16)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={20} />
      </button>

      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '88dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AuthMediaImage
          token={token}
          src={src}
          alt={alt}
          style={{
            maxWidth: '100%',
            maxHeight: '88dvh',
            borderRadius: 16,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>
    </div>,
    document.body
  );
};
