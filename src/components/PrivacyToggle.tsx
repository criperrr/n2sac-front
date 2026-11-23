import React from 'react';
import { useM3Theme } from '../theme/ThemeContext';
import { ExpressiveSwitch } from './expressive/ExpressivePrimitives';

/** Ranking privacy switch card (the whole card toggles). */
export const PrivacyToggle: React.FC<{
  icon: React.ReactElement<{ color?: string }>;
  title: string;
  caption: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  activeColor?: string;
}> = ({ icon, title, caption, checked, disabled, onChange, activeColor }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: isMaterialYou ? 20 : 12,
        backgroundColor: tokens.surfaceContainer,
        border: `1px solid ${checked ? tokens.primary : tokens.outlineVariant}`,
        opacity: disabled && !checked ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {React.cloneElement(icon, {
          color: checked ? (activeColor ?? tokens.primary) : tokens.onSurfaceVariant,
        })}
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{title}</div>
          <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant }}>{caption}</div>
        </div>
      </div>
      <ExpressiveSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
};
