import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { GlassCard } from './GlassCard';
import './AppErrorBoundary.css';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

function reportToMain(error: unknown, info?: ErrorInfo) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[AppErrorBoundary]', message, error instanceof Error ? error.stack : undefined, info?.componentStack);
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportToMain(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-boundary">
          <GlassCard className="app-error-boundary__card">
            <AlertTriangle size={40} className="app-error-boundary__icon" aria-hidden />
            <h1 className="app-error-boundary__title">Сбой интерфейса</h1>
            <p className="app-error-boundary__text">
              Произошла непредвиденная ошибка. Сведения сохранены в журнал системных ошибок.
              Перезагрузите приложение или обратитесь к администратору.
            </p>
            {this.state.message ? (
              <p className="app-error-boundary__detail" role="alert">
                {this.state.message}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn--primary app-error-boundary__reload"
              onClick={() => window.location.reload()}
            >
              Перезагрузить
            </button>
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}
