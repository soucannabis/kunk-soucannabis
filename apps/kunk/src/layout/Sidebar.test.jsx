import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

vi.mock('@kunk/auth-session', () => ({
  useOperatorAuth: () => ({
    user: { name: 'Admin', last_name: 'Test', email: 'admin@test.local' },
    roles: ['Administrador'],
    logout: vi.fn(),
  }),
}));

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter>
      <Sidebar collapsed={false} setCollapsed={() => {}} isAdmin {...props} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('renders brand and kept sections', () => {
    renderSidebar();
    expect(screen.getByText('Kunk')).toBeInTheDocument();
    expect(screen.getByText('Acolhimento')).toBeInTheDocument();
    expect(screen.getByText('Loja')).toBeInTheDocument();
    expect(screen.getAllByText('Profissionais').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('does not render removed section labels', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Serviço Social')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument();
    expect(screen.queryByText('Painel geral')).not.toBeInTheDocument();
    expect(screen.queryByText('Beeviral Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Webmaster')).not.toBeInTheDocument();
    expect(screen.queryByText('Nibo Dashboard')).not.toBeInTheDocument();
  });
});
