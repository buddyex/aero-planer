import { useEffect } from 'react';
import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';

export function RendererErrorReporter() {
  const api = useApi();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;

    const report = (payload: {
      message: string;
      stack?: string;
      type: 'error' | 'unhandledrejection';
      location?: string;
    }) => {
      console.error('[RendererError]', payload.type, payload.message, payload.stack, payload.location);
      void api.reportRendererError({
        message: payload.message,
        stack: payload.stack,
        type: payload.type,
        location: payload.location,
        url: window.location.href,
      });
    };

    const onError = (event: ErrorEvent) => {
      report({
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        type: 'error',
        location: event.filename ? `${event.filename}:${event.lineno}` : 'window.onerror',
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled rejection';
      report({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        type: 'unhandledrejection',
        location: 'unhandledrejection',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [api, user]);

  return null;
}
