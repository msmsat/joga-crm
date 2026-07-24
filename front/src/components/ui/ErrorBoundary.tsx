import { Component } from 'react';
import type { ReactNode } from 'react';
import { withTranslation } from 'react-i18next';
import type { WithTranslation } from 'react-i18next';
import { Button } from './Button';
import { Card } from './Card';

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Классовый компонент — единственный способ поймать ошибку рендера в React
// (getDerivedStateFromError/componentDidCatch недоступны хукам). Ошибки в
// обработчиках событий и промисах сюда не долетают — это зона тостов onError.
class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { t } = this.props;
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', minHeight: '100%',
      }}>
        <Card padding={40} style={{ maxWidth: '420px', textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px' }}>
            <circle cx="12" cy="12" r="10" stroke="#D88C9A" strokeWidth="1.5" />
            <path d="M12 7v6" stroke="#D88C9A" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="0.9" fill="#D88C9A" />
          </svg>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text, #1A1A1A)', margin: '0 0 8px' }}>
            {t('common:errorBoundary.title')}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text2, #666666)', margin: '0 0 24px' }}>
            {t('common:errorBoundary.description')}
          </p>
          <Button onClick={() => window.location.reload()}>
            {t('common:errorBoundary.reload')}
          </Button>
        </Card>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
