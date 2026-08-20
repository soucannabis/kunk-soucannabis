import React from 'react';
import { Link } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';

export function ForbiddenPage() {
  const { user, logout } = useOperatorAuth();

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Sem permissão</h1>
        <p className="muted">
          {user?.email
            ? `A conta ${user.email} não tem a role Administrador.`
            : 'É necessário a role Administrador para acessar o admin.'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn" onClick={() => logout()}>Sair</button>
          <Link className="btn" to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}
