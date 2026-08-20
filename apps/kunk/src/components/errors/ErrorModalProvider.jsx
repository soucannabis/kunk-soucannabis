import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  payloadFromError,
  reportSystemError,
  shouldReportApiError,
} from '@kunk/api-client';
import GlobalErrorModal from './GlobalErrorModal.jsx';
import { formatApiErrorMessage } from '../../lib/formatApiError.js';

const ErrorModalContext = createContext(null);

/**
 * Provider global para exibir erros do sistema em modal.
 * Uso: const { showError } = useErrorModal(); showError(err); // ou string
 */
export function ErrorModalProvider({ children, app = 'kunk', baseUrl }) {
  const [state, setState] = useState({
    open: false,
    title: 'Erro',
    message: '',
  });

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const showError = useCallback((message, options = {}) => {
    const text = formatApiErrorMessage(message, 'Ocorreu um erro inesperado');
    if (!text.trim()) return;

    if (shouldReportApiError(message)) {
      void reportSystemError(payloadFromError(message, { app, source: 'frontend' }), {
        baseUrl,
      });
    }

    setState({
      open: true,
      title: options.title || 'Erro',
      message: text.trim(),
    });
  }, [app, baseUrl]);

  const value = useMemo(() => ({ showError, clearError }), [showError, clearError]);

  return (
    <ErrorModalContext.Provider value={value}>
      {children}
      <GlobalErrorModal
        open={state.open}
        title={state.title}
        message={state.message}
        onClose={clearError}
      />
    </ErrorModalContext.Provider>
  );
}

export function useErrorModal() {
  const ctx = useContext(ErrorModalContext);
  if (!ctx) {
    throw new Error('useErrorModal deve ser usado dentro de ErrorModalProvider');
  }
  return ctx;
}
