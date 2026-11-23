import { useEffect } from 'react';

/**
 * Locks page scrolling while a dialog/overlay is open. The page scroller here is `<html>` (it has
 * `overflow-x: hidden`, so `overflow` on `<body>` never reaches the viewport): the lock goes on
 * `<html>`, with `overscroll-behavior: none` so a dialog scrolled to its end never chains the
 * scroll to the page behind it. Reference-counted, so stacked dialogs (a profile over a
 * comparison) release the page only when the last one closes. On desktop the scrollbar width is
 * kept as padding, so the page doesn't shift sideways.
 */
let locks = 0;
let saved: { overflow: string; overscroll: string; paddingRight: string } | null = null;

function lock(): void {
  const root = document.documentElement;
  if (locks++ > 0) return;
  saved = {
    overflow: root.style.overflow,
    overscroll: root.style.overscrollBehavior,
    paddingRight: root.style.paddingRight,
  };
  const scrollbar = window.innerWidth - root.clientWidth;
  root.style.overflow = 'hidden';
  root.style.overscrollBehavior = 'none';
  // Lets CSS pause decorative loops that would keep repainting under the dialog.
  root.classList.add('n2sac-scroll-locked');
  if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
}

function unlock(): void {
  if (locks === 0 || --locks > 0) return;
  const root = document.documentElement;
  root.style.overflow = saved?.overflow ?? '';
  root.style.overscrollBehavior = saved?.overscroll ?? '';
  root.style.paddingRight = saved?.paddingRight ?? '';
  root.classList.remove('n2sac-scroll-locked');
  saved = null;
}

export function usePageScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
