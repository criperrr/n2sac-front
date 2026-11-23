import React, { useEffect, useState } from 'react';

/**
 * Expand/collapse in place (M3 container growing within its parent): height animates through
 * `grid-template-rows: 0fr -> 1fr` on the default spatial spring, content fades on the effects
 * spring. Children stay mounted until the collapse finishes, so closing animates too.
 */
export const Expandable: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame, so the 0fr starting row is committed before it transitions to 1fr.
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && !open) setMounted(false);
      }}
      style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        opacity: expanded ? 1 : 0,
        transition: [
          'grid-template-rows var(--m3-spring-default-spatial-duration, 450ms) var(--m3-spring-default-spatial, cubic-bezier(0.05, 0.7, 0.1, 1))',
          'opacity var(--m3-spring-default-effects-duration, 200ms) var(--m3-spring-default-effects, linear)',
        ].join(', '),
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
};
