import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseEnvBool, REGISTRATION_SYSTEM_DEFAULTS } from '@kunk/config';
import { useAssociateAuth } from '@kunk/auth-session';
import { AlertError } from '@kunk/ui';
import { Icon } from '../components/Icon.jsx';
import { usePublicConfig } from '../config/PublicConfigProvider.jsx';

const EXTRA_KINDS = [
  {
    key: 'prescription',
    title: 'Receitas',
    hint: 'Envie uma ou mais receitas médicas (foto ou PDF)',
    emptyCta: 'Adicionar receita',
  },
  {
    key: 'exam',
    title: 'Exames',
    hint: 'Envie exames complementares (opcional)',
    emptyCta: 'Adicionar exame',
  },
  {
    key: 'report',
    title: 'Laudos',
    hint: 'Envie laudos médicos (opcional)',
    emptyCta: 'Adicionar laudo',
  },
];

function isImageMime(mime) {
  return String(mime || '').startsWith('image/');
}

/** Quebra o texto em parágrafos a cada ponto final. */
function paragraphsFromCopy(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Resolve URL do formulário (absoluta ou relativa ao app Kunk). */
function resolveTriageFormUrl(raw) {
  const value = String(raw || '').trim() || REGISTRATION_SYSTEM_DEFAULTS.triageFormUrl;
  if (/^https?:\/\//i.test(value)) return value;
  const path = value.startsWith('/') ? value : `/${value}`;
  const base = String(
    import.meta.env.VITE_KUNK_PUBLIC_URL
      || import.meta.env.VITE_KUNK_URL
      || '',
  ).replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

function whatsappScheduleUrl(phone, contactUrl) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits) {
    const text = encodeURIComponent('Olá! Gostaria de agendar uma consulta.');
    return `https://wa.me/${digits}?text=${text}`;
  }
  const fallback = String(contactUrl || '').trim();
  return fallback || null;
}

function ExtraPreview({ file, api }) {
  const src = file?.previewUrl || (file?.id ? api.fileDownloadUrl(file.id) : file?.url);
  const label = file.filename || 'Arquivo';
  const mime = String(file?.mime_type || '').toLowerCase();
  const name = String(file?.filename || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || mime.includes('pdf') || name.endsWith('.pdf');
  const showImage = src && isImageMime(file.mime_type) && !isPdf;

  return (
    <div className="docs-preview-card">
      <div className={`docs-preview-frame${showImage ? '' : ' is-pdf'}`}>
        {showImage ? (
          <img src={src} alt={label} />
        ) : (
          <div className="docs-preview-file">
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
            <span className="docs-preview-file-label">{label}</span>
          </div>
        )}
        <span className="docs-preview-badge">Enviado</span>
      </div>
      <p className="docs-preview-caption">{label}</p>
    </div>
  );
}

function ExtraKindSection({ kind, files, api, busy, uploading, onUpload }) {
  const inputId = `extra-${kind.key}`;

  return (
    <div className="docs-extra-kind">
      <header className="docs-subject-header">
        <h3 className="docs-extra-kind-title">{kind.title}</h3>
        <span className={`docs-subject-status${files.length ? ' is-ok' : ''}`}>
          {files.length
            ? `${files.length} arquivo${files.length > 1 ? 's' : ''}`
            : 'Opcional'}
        </span>
      </header>

      {files.length > 0 ? (
        <div className="docs-slots docs-slots-multi">
          {files.map((file) => (
            <ExtraPreview key={file.id || file.previewUrl} file={file} api={api} />
          ))}
        </div>
      ) : null}

      <div className={`docs-slot${uploading ? ' is-uploading' : ''}`}>
        <label className="docs-slot-drop" htmlFor={inputId}>
          {uploading ? (
            <span className="docs-slot-loader" role="status">
              <span className="docs-spinner" aria-hidden />
              Enviando…
            </span>
          ) : (
            <>
              <span className="docs-slot-title">{kind.emptyCta}</span>
              <span className="docs-slot-hint">{kind.hint}</span>
              <span className="docs-slot-cta">
                <Icon name="upload" size={16} />
                Escolher arquivos
              </span>
            </>
          )}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="d-none"
          disabled={busy || uploading}
          onChange={(e) => {
            const picked = [...(e.target.files || [])];
            e.target.value = '';
            if (picked.length) onUpload(picked);
          }}
        />
      </div>
    </div>
  );
}

export function ConsultationPage({ api }) {
  const { refresh } = useAssociateAuth();
  const { config: cfg } = usePublicConfig();
  const navigate = useNavigate();
  const [extras, setExtras] = useState({
    prescription: [],
    report: [],
    exam: [],
  });
  const [localExtras, setLocalExtras] = useState({
    prescription: [],
    report: [],
    exam: [],
  });
  const [docsOpen, setDocsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingKind, setUploadingKind] = useState(null);

  const scheduleUrl = useMemo(
    () => whatsappScheduleUrl(cfg.associationPhone, cfg.contactUrl),
    [cfg.associationPhone, cfg.contactUrl],
  );

  const load = useCallback(async () => {
    const res = await api.extrasStatus();
    setExtras({
      prescription: res.data?.prescription || [],
      report: res.data?.report || [],
      exam: res.data?.exam || [],
    });
  }, [api]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signed') === '1') {
      refresh().catch(() => {});
    }
  }, [refresh]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  const filesByKind = useMemo(() => {
    const merge = (kind) => {
      const byId = new Map();
      for (const f of extras[kind] || []) byId.set(f.id, f);
      for (const f of localExtras[kind] || []) {
        if (f.id) byId.set(f.id, f);
        else byId.set(f.previewUrl || f.filename, f);
      }
      return [...byId.values()];
    };
    return {
      prescription: merge('prescription'),
      report: merge('report'),
      exam: merge('exam'),
    };
  }, [extras, localExtras]);

  const totalFiles = useMemo(
    () =>
      filesByKind.prescription.length
      + filesByKind.report.length
      + filesByKind.exam.length,
    [filesByKind],
  );

  async function uploadFiles(docKind, fileList) {
    if (!fileList?.length) return;
    setUploadingKind(docKind);
    setError(null);
    try {
      const uploadedLocal = [];
      for (const file of fileList) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_kind', docKind);
        fd.append('subject', 'responsible');
        const res = await api.uploadFile(fd);
        const uploaded = res?.data || {};
        uploadedLocal.push({
          id: uploaded.id,
          filename: uploaded.filename || file.name,
          mime_type: uploaded.mime_type || file.type,
          doc_kind: docKind,
          url: uploaded.url,
          previewUrl: URL.createObjectURL(file),
        });
      }
      setLocalExtras((prev) => ({
        ...prev,
        [docKind]: [...(prev[docKind] || []), ...uploadedLocal],
      }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingKind(null);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.complete();
      await refresh();
      navigate('/cadastro-concluido');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="docs-page">
      <h1 className="form-page-title">Finalizar cadastro</h1>
      <p className="form-page-hint">
        Agende uma consulta, anexe documentos se quiser e conclua o cadastro.
      </p>
      <AlertError message={error} />

      <div className="docs-assistant finish-blocks">
        <section className="docs-subject finish-block">
          <header className="docs-subject-header">
            <h2 className="docs-subject-title">1. Agendar consulta</h2>
          </header>
          <p className="docs-advance-text" style={{ marginTop: 0 }}>
            Fale com a associação pelo WhatsApp para marcar sua consulta.
          </p>
          {scheduleUrl ? (
            <a
              className="btn btn-success docs-primary-btn"
              href={scheduleUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" size={18} />
              Agendar consulta no WhatsApp
            </a>
          ) : (
            <p className="docs-subject-hint">
              Telefone de contato ainda não configurado no Admin.
            </p>
          )}
        </section>

        <section className={`docs-subject finish-block${docsOpen ? ' is-open' : ''}`}>
          <header className="docs-subject-header">
            <h2 className="docs-subject-title">2. Anexar documentos</h2>
            <span className={`docs-subject-status${totalFiles ? ' is-ok' : ''}`}>
              {totalFiles
                ? `${totalFiles} arquivo${totalFiles > 1 ? 's' : ''}`
                : 'Opcional'}
            </span>
          </header>
          <p className="docs-advance-text" style={{ marginTop: 0 }}>
            Receitas, exames e laudos — você pode enviar vários arquivos.
          </p>

          {!docsOpen ? (
            <button
              type="button"
              className="btn btn-success docs-primary-btn"
              onClick={() => setDocsOpen(true)}
            >
              <Icon name="paperclip" size={18} />
              Anexar documentos
            </button>
          ) : (
            <div className="finish-docs-panel">
              <button
                type="button"
                className="finish-docs-close"
                onClick={() => setDocsOpen(false)}
              >
                <Icon name="eyeOff" size={16} />
                Ocultar envios
              </button>
              {EXTRA_KINDS.map((kind) => (
                <ExtraKindSection
                  key={kind.key}
                  kind={kind}
                  files={filesByKind[kind.key]}
                  api={api}
                  busy={busy}
                  uploading={uploadingKind === kind.key}
                  onUpload={(files) => uploadFiles(kind.key, files)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="docs-subject finish-block finish-block-cta">
          <header className="docs-subject-header">
            <h2 className="docs-subject-title">3. Finalizar</h2>
          </header>
          <p className="docs-advance-text" style={{ marginTop: 0 }}>
            Os anexos são opcionais. Você pode concluir o cadastro a qualquer momento.
          </p>
          <button
            type="button"
            className="btn btn-success docs-primary-btn"
            disabled={busy || Boolean(uploadingKind)}
            onClick={finish}
          >
            <Icon name="checkCircle" size={18} />
            {busy ? 'Concluindo…' : 'Finalizar cadastro'}
          </button>
        </section>
      </div>
    </div>
  );
}

export function RegistrationCompletePage() {
  const { user } = useAssociateAuth();
  const { config: cfg } = usePublicConfig();
  const completionText =
    String(cfg.completionText || '').trim() || REGISTRATION_SYSTEM_DEFAULTS.completionText;
  const paragraphs = useMemo(() => paragraphsFromCopy(completionText), [completionText]);
  const showTriageButton = parseEnvBool(
    cfg.showTriageButton,
    REGISTRATION_SYSTEM_DEFAULTS.showTriageButton,
  );
  const triageUrl = useMemo(
    () => resolveTriageFormUrl(cfg.triageFormUrl || REGISTRATION_SYSTEM_DEFAULTS.triageFormUrl),
    [cfg.triageFormUrl],
  );

  return (
    <div className="docs-page text-center">
      <h1 className="form-page-title">Cadastro concluído</h1>
      <p className="form-page-hint">
        {user?.associate_name || 'Associado'} seu cadastro foi realizado com sucesso!
      </p>

      {paragraphs.length ? (
        <div className="docs-assistant">
          <section className="docs-subject welcome-card">
            <header className="docs-subject-header">
              <h2 className="docs-subject-title">Mensagem da associação</h2>
            </header>
            <div className="welcome-card-text">
              {paragraphs.map((paragraph) => (
                <p key={paragraph} className="docs-advance-text welcome-card-paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
            {showTriageButton && triageUrl ? (
              <a
                className="btn btn-success docs-primary-btn welcome-cta"
                href={triageUrl}
              >
                <Icon name="message" size={18} />
                Abrir uma solicitação de contato
              </a>
            ) : null}
          </section>
        </div>
      ) : null}

      {showTriageButton && triageUrl && !paragraphs.length ? (
        <div className="docs-advance" style={{ marginTop: '1.5rem' }}>
          <a
            className="btn btn-success docs-primary-btn"
            href={triageUrl}
          >
            <Icon name="message" size={18} />
            Abrir uma solicitação de contato
          </a>
        </div>
      ) : null}
    </div>
  );
}
