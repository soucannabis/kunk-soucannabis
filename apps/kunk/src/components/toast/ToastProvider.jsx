import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Slide } from '@mui/material';

const ToastContext = createContext(null);

let toastId = 0;

/**
 * Toasts empilhados (ToastContainer).
 * Uso: const { success, error } = useToast();
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, severity = 'success') => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, message: text, severity }]);
  }, []);

  const success = useCallback((message) => push(message, 'success'), [push]);
  const error = useCallback((message) => push(message, 'error'), [push]);
  const info = useCallback((message) => push(message, 'info'), [push]);

  const value = useMemo(() => ({ success, error, info, push }), [success, error, info, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Box
        className="toast-container"
        sx={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 20000,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          maxWidth: 420,
          width: 'min(420px, calc(100vw - 32px))',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </Box>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <Slide direction="left" in mountOnEnter unmountOnExit>
      <Alert severity={toast.severity} variant="filled" onClose={onClose} sx={{ boxShadow: 3 }}>
        {toast.message}
      </Alert>
    </Slide>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return ctx;
}
