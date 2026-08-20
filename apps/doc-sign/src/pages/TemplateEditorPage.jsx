import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPublicConfig } from '@kunk/config';
import { TermEditor } from '../editor/TermEditor.jsx';
import { TermLogoCropModal } from '../editor/TermLogoCropModal.jsx';
import { kindLabel, variableLabel } from '../labels.js';

function EditableSampleFields({ fields, values, onChange, kind }) {
  const visible = fields.filter((f) => {
    if (String(f.name || '').startsWith('association_')) return false;
    if (kind !== 'with_patient' && (f.name === 'patient_full_name' || f.name === 'patient_cpf')) {
      return false;
    }
    return true;
  });

  return (
    <div className="grid-2">
      {visible.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={`sample-${field.name}`}>{variableLabel(field.name)}</label>
          <input
            id={`sample-${field.name}`}
            type="text"
            value={values[field.name] ?? ''}
            onChange={(e) => onChange(field.name, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateEditorPage({ api }) {
  const { kind } = useParams();
  const navigate = useNavigate();
  const [tpl, setTpl] = useState(null);
  const [draft, setDraft] = useState(null);
  const [title, setTitle] = useState('');
  const [logoFileId, setLogoFileId] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [availableLogos, setAvailableLogos] = useState([]);
  const [cropSrc, setCropSrc] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sampleFields, setSampleFields] = useState([]);
  const [sampleValues, setSampleValues] = useState({});
  const busy = Boolean(busyAction);

  async function loadLogos() {
    try {
      const res = await api.get('/doc-sign/templates-logos');
      setAvailableLogos(res.data || []);
    } catch {
      setAvailableLogos([]);
    }
  }

  async function load() {
    const res = await api.get(`/doc-sign/templates/${kind}`);
    setTpl(res.data);
    setDraft(
      res.data.draft_content_json ||
        res.data.published_content_json || { type: 'doc', content: [{ type: 'paragraph' }] }
    );
    setTitle(res.data.title || res.data.default_title || '');
    setLogoFileId(res.data.logo_file_id || null);
    setLogoUrl(res.data.logo_url || null);
    await loadLogos();
  }

  async function loadSampleVariables() {
    const res = await api.get(`/doc-sign/templates/${kind}/sample-variables`);
    setSampleFields(res.data.fields || []);
    const next = {};
    for (const field of res.data.fields || []) {
      next[field.name] = field.value ?? '';
    }
    setSampleValues(next);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [api, kind]);

  async function persistMetaAndDraft({ contentJson = draft, nextTitle = title, nextLogoId = logoFileId } = {}) {
    const res = await api.request('PUT', `/doc-sign/templates/${kind}/draft`, {
      content_json: contentJson,
      title: nextTitle,
      logo_file_id: nextLogoId,
    });
    setTpl(res.data);
    setTitle(res.data.title || '');
    setLogoFileId(res.data.logo_file_id || null);
    setLogoUrl(res.data.logo_url || null);
    return res.data;
  }

  async function saveDraft() {
    setBusyAction('save');
    setError(null);
    setMsg(null);
    try {
      if (!String(title || '').trim()) throw new Error('Informe o título do termo');
      if (!logoFileId) throw new Error('Insira a logo do termo');
      await persistMetaAndDraft();
      navigate('/modelos');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function publish() {
    setBusyAction('publish');
    setError(null);
    setMsg(null);
    try {
      if (!String(title || '').trim()) throw new Error('Título do termo é obrigatório');
      if (!logoFileId) throw new Error('Logo do termo é obrigatória');
      await persistMetaAndDraft();
      await api.post(`/doc-sign/templates/${kind}/publish`, { notes: 'Publicação pelo editor' });
      navigate('/modelos');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteModel() {
    const label = title || tpl?.display_name || kindLabel(kind);
    const okConfirm = window.confirm(`Excluir o modelo "${label}"? Esta ação não pode ser desfeita.`);
    if (!okConfirm) return;
    setBusyAction('delete');
    setError(null);
    setMsg(null);
    try {
      await api.del(`/doc-sign/templates/${encodeURIComponent(kind)}`);
      navigate('/modelos');
    } catch (err) {
      setError(err.message || 'Falha ao excluir modelo');
    } finally {
      setBusyAction(null);
    }
  }

  function onPickLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  async function onCropConfirm(blob) {
    setBusyAction('logo');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', new File([blob], 'term-logo.png', { type: 'image/png' }));
      fd.append('filename', 'term-logo.png');
      const res = await api.uploadFile(fd);
      const id = res.data?.id;
      if (!id) throw new Error('Upload sem id de arquivo');
      const url = `/api/v1/files/${id}/download`;
      setLogoFileId(id);
      setLogoUrl(url);
      await persistMetaAndDraft({ nextLogoId: id });
      setMsg('Logo atualizada.');
      await loadLogos();
    } catch (err) {
      setError(err.message);
    } finally {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setBusyAction(null);
    }
  }

  async function selectExistingLogo(logo) {
    setBusyAction('logo');
    setError(null);
    try {
      setLogoFileId(logo.id);
      setLogoUrl(logo.url);
      await persistMetaAndDraft({ nextLogoId: logo.id });
      setMsg('Logo selecionada.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function openPreviewPanel() {
    setBusyAction('preview');
    setError(null);
    setMsg(null);
    try {
      if (!sampleFields.length) await loadSampleVariables();
      setPreviewOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  function resetSampleData() {
    loadSampleVariables().catch((err) => setError(err.message));
  }

  async function downloadPreviewPdf() {
    setBusyAction('download');
    setError(null);
    setMsg(null);
    try {
      const { apiUrl } = getPublicConfig();
      const res = await fetch(`${apiUrl}/doc-sign/templates/${kind}/preview-pdf`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_json: draft,
          variables: sampleValues,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message = json?.errors?.[0]?.message || `Falha ao gerar PDF (${res.status})`;
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `termo-${kind}-preview.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('PDF de teste baixado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  if (!tpl || !draft) {
    return <p className="muted">Carregando modelo…</p>;
  }

  const otherLogos = availableLogos.filter((l) => l.id !== logoFileId);

  return (
    <div>
      <p>
        <Link to="/modelos">← Modelos</Link>
      </p>
      <h1 style={{ marginBottom: '0.35rem' }}>Editar modelo</h1>
      <p className="muted">{tpl.display_name || kindLabel(kind)}</p>

      <div className="card template-meta">
        <div className="field">
          <label htmlFor="term-title">Título do termo (obrigatório)</label>
          <input
            id="term-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tpl.default_title || 'Termo de Adesão à…'}
          />
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            Padrão: {tpl.default_title}
          </p>
        </div>

        <div className="field">
          <label>Logo do termo (obrigatória)</label>
          <p className="muted" style={{ marginTop: 0 }}>
            Proporção horizontal 3:1 (referência 300×100). Se vazia, usa a logo de Dados da
            associação.
          </p>
          <div className="term-logo-preview-wrap">
            {logoUrl ? (
              <img className="term-logo-preview" src={logoUrl} alt="Logo do termo" />
            ) : (
              <div className="term-logo-placeholder">
                <span>Caixa 3:1 — envie a logo da associação</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <label className="btn" style={{ cursor: 'pointer' }}>
              {logoUrl ? 'Trocar logo…' : 'Enviar logo…'}
              <input type="file" accept="image/*" hidden onChange={onPickLogoFile} />
            </label>
          </div>
          {otherLogos.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <p className="muted" style={{ marginBottom: '0.5rem' }}>
                Ou escolha uma logo já usada em outro modelo:
              </p>
              <div className="term-logo-pick-row">
                {otherLogos.map((logo) => (
                  <button
                    key={logo.id}
                    type="button"
                    className="term-logo-pick"
                    disabled={busy}
                    onClick={() => selectExistingLogo(logo)}
                    title={logo.filename || logo.id}
                  >
                    <img src={logo.url} alt="" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card term-sheet" style={{ marginBottom: '1rem' }}>
        {logoUrl ? <img className="term-logo-preview" src={logoUrl} alt="" style={{ marginBottom: '1rem' }} /> : null}
        <h2 className="term-preview-title">{title || tpl.default_title}</h2>
        <TermEditor contentJson={draft} variables={tpl.variables || []} onChange={setDraft} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert">{msg}</div>}
      <p className="muted" style={{ marginBottom: '0.75rem' }}>
        {tpl.current_version_id ? 'Publicado' : 'Ainda não publicado'}
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-loading" disabled={busy} onClick={saveDraft}>
          {busyAction === 'save' ? (
            <>
              <span className="spinner" aria-hidden />
              Salvando…
            </>
          ) : (
            'Salvar rascunho'
          )}
        </button>
        <button type="button" className="btn btn-primary btn-loading" disabled={busy} onClick={publish}>
          {busyAction === 'publish' ? (
            <>
              <span className="spinner" aria-hidden />
              Publicando…
            </>
          ) : (
            'Publicar'
          )}
        </button>
        <button type="button" className="btn btn-loading" disabled={busy} onClick={openPreviewPanel}>
          {busyAction === 'preview' ? (
            <>
              <span className="spinner" aria-hidden />
              Carregando…
            </>
          ) : (
            'Baixar PDF de teste'
          )}
        </button>
        <button type="button" className="btn btn-danger btn-loading" disabled={busy} onClick={deleteModel}>
          {busyAction === 'delete' ? (
            <>
              <span className="spinner" aria-hidden />
              Excluindo…
            </>
          ) : (
            'Excluir modelo'
          )}
        </button>
      </div>

      {previewOpen && (
        <div className="card preview-panel" style={{ marginTop: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>PDF de teste</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Usa o rascunho atual do editor com dados fictícios. Você pode editar os valores antes de baixar.
          </p>
          <EditableSampleFields
            kind={kind}
            fields={sampleFields}
            values={sampleValues}
            onChange={(name, value) => setSampleValues((prev) => ({ ...prev, [name]: value }))}
          />
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-loading"
              disabled={busy}
              onClick={downloadPreviewPdf}
            >
              {busyAction === 'download' ? (
                <>
                  <span className="spinner" aria-hidden />
                  Gerando PDF…
                </>
              ) : (
                'Gerar e baixar PDF'
              )}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={resetSampleData}>
              Restaurar fictícios
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPreviewOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {cropSrc ? (
        <TermLogoCropModal
          src={cropSrc}
          busy={busy}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onConfirm={onCropConfirm}
        />
      ) : null}
    </div>
  );
}
