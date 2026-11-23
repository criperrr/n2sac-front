import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { loginNsacZeroTrust, NsacApiClientError } from '../api/nsacClient';
import type { LoginResponse } from '../api/types';
import { M3_SPRINGS, useSpringValue } from '../theme/springPhysics';
import { useM3Theme } from '../theme/ThemeContext';
import {
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  IconShapeContainer,
} from '../components/expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../components/expressive/ShapeMorph';

export const LoginScreen: React.FC<{
  onLoginSuccess: (session: LoginResponse) => void;
  serverHealthy?: boolean | null;
}> = ({ onLoginSuccess }) => {
  const { tokens, isMaterialYou, applyCourseClassCode } = useM3Theme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const heroRotation = useSpringValue(loading ? 180 : 0, M3_SPRINGS.slowSpatial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Informe seu e-mail institucional e senha do NSAC.');
      return;
    }

    setLoading(true);
    try {
      const session = await loginNsacZeroTrust(email, password);
      if (session.class_code) {
        applyCourseClassCode(session.class_code);
      }
      onLoginSuccess(session);
    } catch (err) {
      if (err instanceof NsacApiClientError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Não foi possível conectar ao servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: tokens.background,
        color: tokens.onBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 16 : 12 }}>
        {/* Header Card: Only Icon on the Left, n²sac + CTI subtitle on the Right */}
        <div
          style={{
            borderRadius: isMaterialYou ? 32 : 12,
            padding: isMaterialYou ? '22px 24px' : '18px 20px',
            backgroundColor: tokens.surfaceContainerLow,
            border: `1px solid ${tokens.outlineVariant}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {isMaterialYou && (
            <div
              style={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 180,
                height: 180,
                borderRadius: 999,
                background: `radial-gradient(circle, ${tokens.primaryContainer} 0%, transparent 72%)`,
                opacity: 0.5,
                pointerEvents: 'none',
              }}
            />
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={{ transform: isMaterialYou ? `rotate(${heroRotation}deg)` : undefined, flexShrink: 0 }}>
              <IconShapeContainer size={isMaterialYou ? 56 : 44} active={loading} morphing={loading}>
                <GraduationCap size={isMaterialYou ? 27 : 21} />
              </IconShapeContainer>
            </div>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: isMaterialYou ? '1.9rem' : '1.65rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                }}
              >
                n²sac
              </h1>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  color: tokens.onSurfaceVariant,
                  marginTop: 4,
                }}
              >
                CTI • Colégio Técnico Industrial UNESP Bauru
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert Card if any */}
        {errorMsg && (
          <div
            style={{
              borderRadius: 22,
              padding: '14px 18px',
              backgroundColor: tokens.errorContainer,
              color: tokens.onErrorContainer,
              border: `1px solid ${tokens.error}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                Não foi possível entrar
              </div>
              <div style={{ fontSize: '0.83rem', marginTop: 2 }}>{errorMsg}</div>
            </div>
          </div>
        )}

        {/* Segmented Login Form (28px outer / 6px inner) */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ExpressiveSegmentedCard index={0} total={3} variant="default" style={{ padding: '18px 20px' }}>
            <label
              htmlFor="nsac-email-input"
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: tokens.primary,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              E-mail Institucional
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 16,
                backgroundColor: tokens.surfaceContainerLowest,
                border: `1.5px solid ${tokens.outlineVariant}`,
              }}
            >
              <Mail size={18} color={tokens.primary} />
              <input
                id="nsac-email-input"
                type="email"
                required
                autoComplete="email"
                placeholder="nome.sobrenome@unesp.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: tokens.onSurface,
                  fontSize: '0.96rem',
                  fontFamily: 'Outfit, sans-serif',
                }}
              />
            </div>
          </ExpressiveSegmentedCard>

          <ExpressiveSegmentedCard index={1} total={3} variant="default" style={{ padding: '18px 20px' }}>
            <label
              htmlFor="nsac-password-input"
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: tokens.primary,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Senha
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 16,
                backgroundColor: tokens.surfaceContainerLowest,
                border: `1.5px solid ${tokens.outlineVariant}`,
              }}
            >
              <Lock size={18} color={tokens.primary} />
              <input
                id="nsac-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Sua senha do NSAC"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: tokens.onSurface,
                  fontSize: '0.96rem',
                  fontFamily: 'Outfit, sans-serif',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: tokens.onSurfaceVariant,
                  cursor: 'pointer',
                  display: 'flex',
                  padding: 4,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </ExpressiveSegmentedCard>

          <ExpressiveSegmentedCard index={2} total={3} variant="default" style={{ padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 14,
                fontSize: '0.8rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              <ShieldCheck size={16} color={tokens.gradeSuccess} style={{ flexShrink: 0 }} />
              <span>Sua senha é criptografada.</span>
            </div>

            <EnhancedMorphButton
              type="submit"
              variant="filled"
              size="lg"
              fullWidth
              disabled={loading}
              icon={loading ? <MorphingShapeIndicator size={20} label="Entrando" /> : <Sparkles size={18} />}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </EnhancedMorphButton>
          </ExpressiveSegmentedCard>
        </form>
      </div>
    </div>
  );
};
