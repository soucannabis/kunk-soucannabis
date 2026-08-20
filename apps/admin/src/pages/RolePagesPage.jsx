import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLoader } from '../components/AdminLoader.jsx';

/** Page ids aligned with apps/kunk menuConfig (for role_pages). */
export const KUNK_PAGE_OPTIONS = [
  { id: 'associados', label: 'Associados' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'triagem', label: 'Triagem' },
  { id: 'institutional-clients', label: 'Clientes Institucionais' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'profissionais', label: 'Profissionais' },
  { id: 'relatorios-servicos', label: 'Relatório de serviços' },
  { id: 'historico', label: 'Histórico do sistema' },
  { id: 'tags', label: 'Tags' },
];

const STAFF_ROLES = ['Administrador', 'Acolhimento', 'Produção', 'Financeiro'];
const ALL_ROLES = [...STAFF_ROLES, 'Profissional'];

function defaultRolePages() {
  return {
    ...Object.fromEntries(STAFF_ROLES.map((r) => [r, ['*']])),
    Profissional: ['relatorios-servicos'],
  };
}

function parseRolePages(raw) {
  if (!raw) return defaultRolePages();
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...defaultRolePages(), ...v };
  } catch {
    return defaultRolePages();
  }
}

function isAll(pages) {
  return !pages?.length || pages.includes('*');
}

function RoleCheck({ checked, disabled, onChange, label, accent }) {
  return (
    <label className={`role-check${disabled ? ' role-check--disabled' : ''}${accent ? ' role-check--accent' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="role-check-box" aria-hidden="true" />
      <span className="role-check-label">{label}</span>
    </label>
  );
}

export function RolePagesPage({ api }) {
  const [configRow, setConfigRow] = useState(null);
  const [rolePages, setRolePages] = useState(defaultRolePages());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.configBySystem('kunk');
        const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
        const row = list.find((c) => c.key === 'role_pages');
        if (!cancelled) {
          setConfigRow(row || null);
          setRolePages(parseRolePages(row?.value));
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function toggleAll(role, checked) {
    setRolePages((prev) => ({
      ...prev,
      [role]: checked ? ['*'] : [],
    }));
  }

  function togglePage(role, pageId, checked) {
    setRolePages((prev) => {
      const cur = prev[role] || [];
      if (isAll(cur)) {
        const next = checked
          ? ['*']
          : KUNK_PAGE_OPTIONS.map((p) => p.id).filter((id) => id !== pageId);
        return { ...prev, [role]: next };
      }
      const set = new Set(cur);
      if (checked) set.add(pageId);
      else set.delete(pageId);
      const arr = [...set];
      if (arr.length === KUNK_PAGE_OPTIONS.length) return { ...prev, [role]: ['*'] };
      return { ...prev, [role]: arr };
    });
  }

  async function onSave() {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const value = JSON.stringify(rolePages);
      if (configRow?.id) {
        await api.updateConfig(configRow.id, { value });
      } else {
        const created = await api.createConfig({
          system: 'kunk',
          key: 'role_pages',
          value,
          value_type: 'json',
          is_sensitive: false,
          description: 'Páginas do menu Kunk por role (* = todas)',
        });
        setConfigRow(created.data);
      }
      setMsg('Permissões salvas.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AdminLoader label="Carregando permissões…" />;
  }

  return (
    <div className="role-pages">
      <div className="admin-top">
        <div>
          <h2 style={{ margin: 0 }}>Permissões de acesso</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Quais páginas cada role vê no Kunk. Default: todas as páginas para roles staff.
          </p>
        </div>
        <div className="admin-top-actions">
          <Link className="btn" to="/usuarios/novo">
            Convidar usuário
          </Link>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {msg ? <p style={{ color: 'var(--admin-success, #2e7d32)', margin: '0 0 1rem' }}>{msg}</p> : null}

      <div className="role-pages-grid">
        {ALL_ROLES.map((role) => {
          const pages = rolePages[role] || [];
          const all = isAll(pages);
          const selectedCount = all
            ? KUNK_PAGE_OPTIONS.length
            : KUNK_PAGE_OPTIONS.filter((p) => pages.includes(p.id)).length;

          return (
            <section className="card role-pages-card" key={role}>
              <header className="role-pages-card-head">
                <div>
                  <h3 className="role-pages-card-title">{role}</h3>
                  <p className="muted role-pages-card-meta">
                    {all ? 'Acesso total' : `${selectedCount} de ${KUNK_PAGE_OPTIONS.length} páginas`}
                  </p>
                </div>
                <RoleCheck
                  accent
                  checked={all}
                  onChange={(checked) => toggleAll(role, checked)}
                  label="Todas as páginas"
                />
              </header>

              <div className="role-pages-checklist" role="group" aria-label={`Páginas de ${role}`}>
                {KUNK_PAGE_OPTIONS.map((p) => (
                  <RoleCheck
                    key={p.id}
                    checked={all || pages.includes(p.id)}
                    disabled={all}
                    onChange={(checked) => togglePage(role, p.id, checked)}
                    label={p.label}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
