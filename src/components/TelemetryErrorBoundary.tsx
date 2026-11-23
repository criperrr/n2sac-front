import React from 'react';
import { reportUiCrash } from '../telemetry/telemetryEngine';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class TelemetryErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Erro inesperado na interface' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportUiCrash(error, info.componentStack ?? undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            backgroundColor: '#0D0D0D',
            color: '#F5F5F5',
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Opa! A interface encontrou um erro.</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.75, maxWidth: 420 }}>
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              backgroundColor: '#10A37F',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recarregar aplicativo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
