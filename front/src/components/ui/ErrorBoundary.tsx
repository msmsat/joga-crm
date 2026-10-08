import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorFallback } from './errorScreen/ErrorFallback';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** Сколько повторов не помогло — экран меняет главное действие на перезагрузку. */
  attempt: number;
}

// Классовый компонент — единственный способ поймать ошибку рендера в React
// (getDerivedStateFromError/componentDidCatch недоступны хукам). Ошибки в
// обработчиках событий и промисах сюда не долетают — это зона тостов onError.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  // Повтор = отрисовать детей заново. Если ошибка постоянная, она вернёт сюда
  // же, и экран покажется уже с attempt > 0.
  retry = () => this.setState(s => ({ hasError: false, attempt: s.attempt + 1 }));

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback attempt={this.state.attempt} onRetry={this.retry} />;
  }
}
