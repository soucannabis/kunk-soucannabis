import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAssociateAuth } from '@kunk/auth-session';
import { AlertError } from '@kunk/ui';
import { Icon } from '../components/Icon.jsx';
import { PHASE, normalizePhase } from '../lib/associatePhases.js';

const SIDE_LABEL = {
  front: 'Frente',
  back: 'Verso',
};

function sideLabel(side) {
  return SIDE_LABEL[side] || 'Documento';
}

function docTypeLabel(docType) {
  if (docType === 'cnh') return 'CNH';
  if (docType === 'rg') return 'RG';
  return 'Documento';
}

function isImageMime(mime) {
  return String(mime || '').startsWith('image/');
}

function isPdfFile(file) {
  const mime = String(file?.mime_type || '').toLowerCase();
  const name = String(file?.filename || '').toLowerCase();
  return mime === 'application/pdf' || mime.includes('pdf') || name.endsWith('.pdf');
}

function PdfIcon() {
  return (
    <svg className="docs-preview-pdf-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#E53935"
        d="M12 4h18l10 10v30a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
      />
      <path fill="#FFCDD2" d="M30 4v10h10z" />
      <path
        fill="#fff"
        d="M16 28h3.2c1.9 0 3.2-1.1 3.2-2.8S21.1 22.4 19.2 22.4H16V28zm1.6-4.2h1.5c.8 0 1.4.4 1.4 1.2s-.6 1.2-1.4 1.2h-1.5v-2.4zM23.2 28h1.6v-2.2h2.1c1.8 0 3-1.1 3-2.8s-1.2-2.8-3-2.8h-3.7V28zm1.6-4h2c.8 0 1.3.4 1.3 1.2s-.5 1.2-1.3 1.2h-2V24zM32.4 28H37v-1.4h-3v-1.3h2.7v-1.3H34v-1.2h3V22.4h-4.6V28z"
      />
    </svg>
  );
}

function DocPreview({ file, api, badge, onRemove, removeDisabled }) {
  const src = file?.previewUrl || (file?.id ? api.fileDownloadUrl(file.id) : file?.url);
  const title = `${docTypeLabel(file.doc_type)} · ${sideLabel(file.side)}`;
  const showImage = src && isImageMime(file.mime_type) && !isPdfFile(file);

  return (
    <div className="docs-preview-card">
      <div className={`docs-preview-frame${showImage ? '' : ' is-pdf'}`}>
        {showImage ? (
          <img src={src} alt={title} />
        ) : (
          <div className="docs-preview-file">
            <PdfIcon />
            <span className="docs-preview-file-label">{file.filename || 'Documento PDF'}</span>
          </div>
        )}
        {badge ? <span className="docs-preview-badge">{badge}</span> : null}
        {onRemove ? (
          <button
            type="button"
            className="docs-preview-remove"
            disabled={removeDisabled}
            onClick={onRemove}
          >
            <Icon name="trash" size={14} />
            Remover
          </button>
        ) : null}
      </div>
      <p className="docs-preview-caption">{title}</p>
    </div>
  );
}

function UploadSlot({
  id,
  title,
  hint,
  busy,
  file,
  api,
  onPick,
  onRemove,
}) {
  const pending = Boolean(file?.pending);
  const uploaded = Boolean(file?.id && !file?.pending);

  return (
    <div className={`docs-slot${file ? ' is-done' : ''}${busy ? ' is-uploading' : ''}`}>
      {file ? (
        <DocPreview
          file={file}
          api={api}
          badge={pending ? 'Selecionado' : uploaded ? 'Enviado' : null}
          onRemove={onRemove}
          removeDisabled={busy}
        />
      ) : (
        <>
          <label className="docs-slot-drop" htmlFor={id}>
            {busy ? (
              <span className="docs-slot-loader" role="status">
                <span className="docs-spinner" aria-hidden />
                Enviando…
              </span>
            ) : (
              <>
                <span className="docs-slot-title">{title}</span>
                <span className="docs-slot-hint">{hint}</span>
                <span className="docs-slot-cta">
                  <Icon name="upload" size={16} />
                  Escolher arquivo
                </span>
              </>
            )}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*,.pdf"
            className="d-none"
            disabled={busy}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked) onPick(picked);
            }}
          />
        </>
      )}
    </div>
  );
}

function SubjectDocs({ api, subject, label, status, onUploaded }) {
  const [docType, setDocType] = useState('rg');
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState({});

  const serverFiles = status?.files || [];

  useEffect(() => {
    if (status?.mode === 'cnh' || status?.mode === 'rg') {
      setDocType(status.mode);
    }
  }, [status?.mode]);

  useEffect(() => {
    setPending({});
  }, [docType]);

  const serverBySide = useMemo(() => {
    const map = {};
    for (const f of serverFiles) {
      if (f.doc_type !== docType) continue;
      const side = f.side || 'front';
      map[side] = f;
    }
    return map;
  }, [serverFiles, docType]);

  function slotFile(side) {
    if (pending[side]) return pending[side];
    return serverBySide[side] || null;
  }

  function pick(side, file) {
    if (!file) return;
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setPending((prev) => {
      if (prev[side]?.previewUrl) URL.revokeObjectURL(prev[side].previewUrl);
      return {
        ...prev,
        [side]: {
          pending: true,
          rawFile: file,
          filename: file.name,
          mime_type: file.type,
          doc_type: docType,
          side,
          subject,
          previewUrl,
        },
      };
    });
  }

  function clearPending(side) {
    setPending((prev) => {
      const next = { ...prev };
      if (next[side]?.previewUrl) URL.revokeObjectURL(next[side].previewUrl);
      delete next[side];
      return next;
    });
  }

  async function removeUploaded(file) {
    if (!file?.id) return;
    setError(null);
    try {
      await api.deleteFile(file.id);
      await onUploaded();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSlot(side) {
    if (pending[side]) {
      clearPending(side);
      return;
    }
    const uploaded = serverBySide[side];
    if (uploaded) await removeUploaded(uploaded);
  }

  const requiredSides = docType === 'rg' ? ['front', 'back'] : ['front'];
  const pendingSides = requiredSides.filter((side) => pending[side]);
  const coveredSides = requiredSides.filter((side) => pending[side] || serverBySide[side]);
  const readyToUpload = pendingSides.length > 0 && coveredSides.length === requiredSides.length;
  const serverCompleteForType =
    status?.complete && status?.mode === docType && pendingSides.length === 0;

  async function uploadPending() {
    if (!readyToUpload) {
      setError(
        docType === 'rg'
          ? 'Selecione frente e verso do RG antes de enviar.'
          : 'Selecione a CNH aberta antes de enviar.',
      );
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const side of pendingSides) {
        const item = pending[side];
        const fd = new FormData();
        fd.append('file', item.rawFile);
        fd.append('doc_type', docType);
        fd.append('side', side);
        fd.append('subject', subject);
        fd.append('doc_kind', 'identity');
        await api.uploadFile(fd);
      }
      setPending((prev) => {
        for (const side of Object.keys(prev)) {
          if (prev[side]?.previewUrl) URL.revokeObjectURL(prev[side].previewUrl);
        }
        return {};
      });
      await onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const frontFile = slotFile('front');
  const backFile = slotFile('back');
  const showTypePicker = !serverCompleteForType;

  return (
    <section className="docs-subject">
      <header className="docs-subject-header">
        <h2 className="docs-subject-title">{label}</h2>
      </header>

      <AlertError message={error} />

      {showTypePicker ? (
        <div className="docs-type-picker" role="radiogroup" aria-label={`Tipo de documento — ${label}`}>
          <button
            type="button"
            role="radio"
            aria-checked={docType === 'rg'}
            className={`docs-type-option${docType === 'rg' ? ' is-selected' : ''}`}
            onClick={() => setDocType('rg')}
            disabled={uploading}
          >
            <Icon name="idCard" size={22} className="docs-type-option-icon" />
            <span className="docs-type-option-body">
              <span className="docs-type-option-title">RG (frente e verso)</span>
              <span className="docs-type-option-desc">Envie frente e verso do documento</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={docType === 'cnh'}
            className={`docs-type-option${docType === 'cnh' ? ' is-selected' : ''}`}
            onClick={() => setDocType('cnh')}
            disabled={uploading}
          >
            <Icon name="fileText" size={22} className="docs-type-option-icon" />
            <span className="docs-type-option-body">
              <span className="docs-type-option-title">CNH (aberta)</span>
              <span className="docs-type-option-desc">Envie a CNH aberta, com todos os dados visíveis</span>
            </span>
          </button>
        </div>
      ) : null}

      <div className="docs-slots">
        <UploadSlot
          id={`${subject}-front`}
          title={docType === 'cnh' ? 'Selecionar CNH aberta' : 'Selecionar frente'}
          hint={
            docType === 'cnh'
              ? 'Foto ou PDF nítido da CNH aberta'
              : 'Foto ou PDF nítido do documento'
          }
          busy={uploading}
          file={frontFile}
          api={api}
          onPick={(file) => pick('front', file)}
          onRemove={() => removeSlot('front')}
        />
        {docType === 'rg' ? (
          <UploadSlot
            id={`${subject}-back`}
            title="Selecionar verso"
            hint="Foto ou PDF do verso do RG"
            busy={uploading}
            file={backFile}
            api={api}
            onPick={(file) => pick('back', file)}
            onRemove={() => removeSlot('back')}
          />
        ) : null}
      </div>

      {pendingSides.length > 0 || !serverCompleteForType ? (
        <div className="docs-upload-actions">
          {pendingSides.length > 0 && !readyToUpload ? (
            <p className="docs-subject-hint">
              {docType === 'rg' && !pending.back && !serverBySide.back
                ? 'Selecione também o verso do RG para enviar.'
                : docType === 'rg' && !pending.front && !serverBySide.front
                  ? 'Selecione também a frente do RG para enviar.'
                  : 'Selecione os arquivos necessários antes de enviar.'}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-success docs-primary-btn"
            disabled={uploading || !readyToUpload}
            onClick={uploadPending}
          >
            <Icon name="upload" size={18} />
            {uploading ? 'Enviando…' : 'Enviar documentos'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function DocumentsPage({ api }) {
  const { user, refresh } = useAssociateAuth();
  const phase = normalizePhase(user?.associate_status);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signingUrl, setSigningUrl] = useState(null);
  const [signingAttempt, setSigningAttempt] = useState(0);

  const load = useCallback(async () => {
    const res = await api.documentsStatus();
    setStatus(res.data);
  }, [api]);

  useEffect(() => {
    if (phase === PHASE.DOCUMENTOS) load().catch((err) => setError(err.message));
  }, [phase, load]);

  useEffect(() => {
    if (phase !== PHASE.ASSINATURA_TERMO) return undefined;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      setSigningUrl(null);
      try {
        const res = await api.post('/doc-sign/contracts', {});
        if (cancelled) return;
        const url = res.data?.signing_url || null;
        setSigningUrl(url);
        if (!url) setError('Não foi possível obter o link de assinatura. Tente novamente.');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao gerar o termo. Tente novamente.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, api, signingAttempt]);

  async function advanceToTerms() {
    setBusy(true);
    setError(null);
    try {
      await api.advance();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openSigning() {
    if (!signingUrl) return;
    const returnUrl = encodeURIComponent(`${window.location.origin}/finalizar?signed=1`);
    const url = `${signingUrl}${signingUrl.includes('?') ? '&' : '?'}return_url=${returnUrl}`;
    window.location.assign(url);
  }

  if (phase === PHASE.ASSINATURA_TERMO) {
    const canRetry = Boolean(error) && !signingUrl && !busy;
    return (
      <div className="docs-page">
        <h1 className="form-page-title">Assinatura do termo</h1>
        <p className="form-page-hint">
          Seus documentos foram recebidos. Assine o termo de adesão para continuar o cadastro.
        </p>
        <AlertError message={error} />
        <div className="docs-sign-card">
          <p className="docs-sign-note">
            Para se tornar um associado, por favor, leia e assine o Termo de Adesão do Associado
            clicando no botão abaixo
          </p>
          {canRetry ? (
            <button
              type="button"
              className="btn btn-success docs-primary-btn docs-sign-btn"
              onClick={() => setSigningAttempt((n) => n + 1)}
            >
              <Icon name="refresh" size={20} />
              Tentar novamente
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-success docs-primary-btn docs-sign-btn"
              disabled={busy || !signingUrl}
              onClick={openSigning}
            >
              <Icon name="pen" size={20} />
              {busy && !signingUrl ? 'Preparando termo…' : 'Assinar termo de adesão'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="docs-page">
      <h1 className="form-page-title">Documentos de identidade</h1>
      <p className="form-page-hint">
        Escolha RG ou CNH, selecione os arquivos e clique em Enviar documentos.
        <br />
        Use imagens nítidas ou PDF legível para agilizar a análise.
      </p>
      <AlertError message={error} />

      <div className="docs-assistant">
        <SubjectDocs
          api={api}
          subject="responsible"
          label="Responsável"
          status={status?.responsible}
          onUploaded={load}
        />
        {user?.responsible_type === 'another' ? (
          <SubjectDocs
            api={api}
            subject="patient"
            label="Paciente"
            status={status?.patient}
            onUploaded={load}
          />
        ) : null}
      </div>

      {status?.complete ? (
        <div className="docs-advance">
          <p className="docs-advance-text">Tudo certo. Você já pode avançar para a assinatura do termo.</p>
          <button type="button" className="btn btn-success docs-primary-btn" disabled={busy} onClick={advanceToTerms}>
            <Icon name="arrowRight" size={18} />
            {busy ? 'Avançando…' : 'Avançar para assinatura'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
