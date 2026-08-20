import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { kindLabel, statusLabel } from '../labels.js';

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6.5 7l.7 12.2A1.5 1.5 0 0 0 8.7 20.5h6.6a1.5 1.5 0 0 0 1.5-1.3L17.5 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function associateLabel(u) {
  const name =
    (u.full_name || `${u.associate_name || ''} ${u.associate_last_name || ''}`).trim() ||
    u.fullname ||
    'Sem nome';
  const email = u.email_account || '';
  return { name, email, cpf: u.associate_cpf || '' };
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
    return true;
  } finally {
    document.body.removeChild(el);
  }
}

function NewTermModal({ api, onClose, onCreated }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);
  const [error, setError] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedKind, setSelectedKind] = useState('');
  const debounceRef = useRef(null);

  const publishedTemplates = useMemo(
    () => (templates || []).filter((t) => t.current_version_id),
    [templates]
  );

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: '40',
        sort: '-created_date',
        'filter[status][_neq]': 'patient',
      });
      const res = await api.listUsers(params.toString());
      setResults(res.data || []);
    } catch (err) {
      setError(err.message || 'Falha ao listar associados');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    api
      .get('/doc-sign/templates')
      .then((res) => {
        const list = res.data || [];
        setTemplates(list);
        const firstPublished = list.find((t) => t.current_version_id);
        setSelectedKind((prev) => prev || firstPublished?.kind || '');
      })
      .catch(() => {
        /* ignore */
      });
  }, [api]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      if (!term) loadRecent();
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.searchUsers(term);
        setResults(res.data || []);
      } catch (err) {
        setError(err.message || 'Falha na busca');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, api, loadRecent]);

  async function createFor(user, { replaceCompleted = false } = {}) {
    if (!user?.user_code || creating) return;
    if (!selectedKind) {
      setError('Selecione o modelo do termo');
      return;
    }
    setCreating(user.user_code);
    setError(null);
    setShareUrl(null);
    try {
      const res = await api.post('/doc-sign/contracts', {
        user_code: user.user_code,
        kind: selectedKind,
        regenerate: true,
        replace_completed: replaceCompleted,
        send_email: true,
      });
      const url = res.data?.signing_url || null;
      setShareUrl(url);
      if (url) await copyText(url);
      onCreated?.(res.data);
    } catch (err) {
      setError(err.message || 'Falha ao criar termo');
    } finally {
      setCreating(null);
    }
  }

  async function handleCreateClick(user) {
    if (user?.adhesion_term) {
      const okConfirm = window.confirm(
        'Este associado já tem termo assinado. Deseja gerar um novo? O anterior deixa de ser o vigente.'
      );
      if (!okConfirm) return;
      await createFor(user, { replaceCompleted: true });
      return;
    }
    await createFor(user);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-term-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="new-term-title" style={{ margin: 0 }}>
            Novo termo
          </h2>
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>

        {shareUrl ? (
          <div className="alert" style={{ wordBreak: 'break-word' }}>
            Termo criado. Link copiado para a área de transferência:
            <br />
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </div>
        ) : null}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="term-kind">Modelo</label>
          <select
            id="term-kind"
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value)}
            disabled={!publishedTemplates.length}
          >
            {!publishedTemplates.length ? <option value="">Nenhum modelo publicado</option> : null}
            {publishedTemplates.map((t) => (
              <option key={t.kind} value={t.kind}>
                {t.display_name || kindLabel(t.kind)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="associate-search">Buscar associado</label>
          <input
            id="associate-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, e-mail ou CPF (mín. 2 caracteres)"
            autoFocus
          />
        </div>

        {loading ? <p className="muted">Carregando…</p> : null}

        <ul className="associate-list">
          {results.map((u) => {
            const { name, email, cpf } = associateLabel(u);
            const busy = creating === u.user_code;
            return (
              <li key={u.user_code || u.id}>
                <div>
                  <strong>{name}</strong>
                  <div className="muted" style={{ fontSize: '0.9rem' }}>
                    {[email, cpf].filter(Boolean).join(' · ')}
                    {u.adhesion_term ? ' · já tem termo assinado' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(creating)}
                  onClick={() => handleCreateClick(u)}
                >
                  {busy ? 'Criando…' : u.adhesion_term ? 'Gerar novo' : 'Criar'}
                </button>
              </li>
            );
          })}
          {!loading && results.length === 0 ? (
            <li className="muted" style={{ justifyContent: 'center', border: 0 }}>
              Nenhum associado encontrado.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

export function ContractsPage({ api }) {
  const PAGE_SIZE = 20;
  const [contracts, setContracts] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (statusFilter) qs.set('status', statusFilter);
      if (search.trim()) qs.set('q', search.trim());
      const res = await api.get(`/doc-sign/contracts?${qs.toString()}`);
      setContracts(res.data || []);
      setTotal(Number(res.meta?.total) || 0);
    } catch (err) {
      setError(err.message || 'Falha ao carregar termos');
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function shareLink(contract) {
    if (!contract?.user_code || sharingId) return;
    setSharingId(contract.id);
    try {
      if (contract.status === 'completed') {
        const url = contract.signed_pdf_url || contract.audit_pdf_url;
        if (!url) {
          showToast('PDF assinado indisponível.');
          return;
        }
        await copyText(url);
        showToast('Link do PDF assinado copiado.');
        return;
      }
      if (contract.status === 'void') {
        showToast('Termo anulado — não há link de assinatura.');
        return;
      }
      const created = await api.post('/doc-sign/contracts', {
        user_code: contract.user_code,
        regenerate: false,
        send_email: true,
      });
      const url = created.data?.signing_url;
      if (!url) {
        showToast('Não foi possível gerar o link.');
        return;
      }
      await copyText(url);
      showToast('Link de assinatura copiado.');
      await load();
    } catch (err) {
      if (err.code === 'CONTRACT_ALREADY_COMPLETED') {
        showToast('Termo já assinado.');
      } else {
        showToast(err.message || 'Falha ao gerar link');
      }
    } finally {
      setSharingId(null);
    }
  }

  async function deleteContract(contract) {
    if (!contract?.id || deletingId) return;
    const label = contract.associate_full_name || contract.signer_email || 'este termo';
    const okConfirm = window.confirm(`Excluir o termo de ${label}? Esta ação não pode ser desfeita.`);
    if (!okConfirm) return;
    setDeletingId(contract.id);
    try {
      await api.del(`/doc-sign/contracts/${contract.id}`);
      showToast('Termo excluído.');
      if (contracts.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await load();
      }
    } catch (err) {
      showToast(err.message || 'Falha ao excluir termo');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Termos</h1>
          <p className="muted" style={{ margin: 0 }}>
            Contratos gerados a partir dos modelos publicados.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-novo-termo" onClick={() => setModalOpen(true)}>
          <span className="btn-plus" aria-hidden>
            +
          </span>
          Novo termo
        </button>
      </div>

      <div className="list-toolbar">
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
          <label htmlFor="term-search">Buscar</label>
          <input
            id="term-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nome ou e-mail"
          />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label htmlFor="term-status">Status</label>
          <select
            id="term-status"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="completed">Assinado</option>
            <option value="void">Anulado</option>
          </select>
        </div>
      </div>

      {toast && <div className="alert">{toast}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <p className="muted">Carregando…</p> : null}

      {!loading && contracts.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>Nenhum termo encontrado.</p>
        </div>
      ) : null}

      {contracts.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Associado</th>
                <th>Status</th>
                <th>Modelo</th>
                <th>Criado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.associate_full_name || c.signer_email || '—'}</div>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {c.signer_email}
                      {c.associate_cpf ? ` · ${c.associate_cpf}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill status-${c.status}`}>{statusLabel(c.status)}</span>
                  </td>
                  <td>{c.kind_display_name || kindLabel(c.kind)}</td>
                  <td className="muted">
                    {c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="row-actions">
                    <Link className="btn btn-icon" to={`/termos/${c.id}`} title="Ver termo" aria-label="Ver termo">
                      <IconEye />
                    </Link>
                    {c.status === 'pending' || c.status === 'completed' ? (
                      <button
                        type="button"
                        className="btn btn-icon"
                        title="Copiar link"
                        aria-label="Copiar link"
                        disabled={sharingId === c.id || deletingId === c.id}
                        onClick={() => shareLink(c)}
                      >
                        {sharingId === c.id ? '…' : <IconLink />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-icon btn-danger"
                      title="Excluir"
                      aria-label="Excluir termo"
                      disabled={deletingId === c.id}
                      onClick={() => deleteContract(c)}
                    >
                      {deletingId === c.id ? '…' : <IconTrash />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <span className="muted">
              {from}–{to} de {total}
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="btn"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="muted">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className="btn"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <NewTermModal
          api={api}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setPage(1);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
