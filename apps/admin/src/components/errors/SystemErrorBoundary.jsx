import React from 'react';
import { payloadFromError, reportSystemError } from '@kunk/api-client';

export class SystemErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Erro inesperado' };
  }

  componentDidCatch(error, info) {
    const { app = 'admin', baseUrl } = this.props;
    const payload = payloadFromError(error, { app, source: 'frontend' });
    payload.code = 'REACT_ERROR_BOUNDARY';
    if (info?.componentStack) {
      payload.metadata = { componentStack: String(info.componentStack).slice(0, 2000) };
    }
    void reportSystemError(payload, { baseUrl });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: 24 }}>
          <h1>Algo deu errado</h1>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
