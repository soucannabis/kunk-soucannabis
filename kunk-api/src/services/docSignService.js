'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, withClient } = require('../db/pool');
const { env } = require('../config/env');
const { AppError } = require('../utils/response');
const filesRepository = require('../repositories/filesRepository');
const repo = require('../repositories/docSignRepository');
const {
  validateContentJson,
  applyVariablesToContent,
  resolveKind,
  resolveVariables,
  sampleVariables,
  associationDefaults,
  fullName,
  missingRequiredVariables,
  CANONICAL_VARIABLES,
  VARIABLE_LABELS,
} = require('./docSignVariables');
const { defaultTitle, DEFAULT_SELF_CONTENT, DEFAULT_WITH_PATIENT_CONTENT } = require('./docSignDefaultTemplates');
const {
  sha256,
  renderContentPdf,
  renderAuditPdf,
  decodeDataUrl,
  emptyPngBuffer,
} = require('./docSignPdf');
const { withEventLabel } = require('./docSignEventLabels');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function makeSigningToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function signingUrl(token) {
  return `${env.docSignPublicUrl}/assinar/${token}`;
}

async function sendSigningInviteEmail({ email, signerName, token, contractId, associationName }) {
  const emailService = require('./email');
  const url = signingUrl(token);
  const tpl = emailService.templates.contractSigningLink({
    signingUrl: url,
    associationName: associationName || (await getAssociationName()),
    signerName,
  });
  const mail = await emailService.sendTemplated(email, tpl);
  try {
    await repo.insertEvent({
      contract_id: contractId,
      event_type: 'email.sent',
      actor_email: email,
      actor_name: signerName || null,
      meta: {
        skipped: Boolean(mail.skipped || !mail.email_sent),
        reason: mail.email_status || mail.reason || null,
        message_id: mail.messageId || null,
      },
    });
  } catch {
    /* non-fatal */
  }
  return mail;
}

async function sendSignedConfirmationEmail({
  email,
  signerName,
  signedPdfBuffer,
  auditPdfBuffer,
  contractId,
}) {
  const emailService = require('./email');
  const tpl = emailService.templates.contractSignedConfirmation({
    associationName: await getAssociationName(),
    signerName,
  });
  const attachments = [];
  if (signedPdfBuffer) {
    attachments.push({
      filename: `termo-assinado-${contractId}.pdf`,
      content: signedPdfBuffer,
      contentType: 'application/pdf',
    });
  }
  if (auditPdfBuffer) {
    attachments.push({
      filename: `audit-log-${contractId}.pdf`,
      content: auditPdfBuffer,
      contentType: 'application/pdf',
    });
  }
  const mail = await emailService.sendTemplated(email, tpl, { attachments });
  try {
    await repo.insertEvent({
      contract_id: contractId,
      event_type: 'email.confirmation_sent',
      actor_email: email,
      actor_name: signerName || null,
      meta: {
        skipped: Boolean(mail.skipped || !mail.email_sent),
        reason: mail.email_status || mail.reason || null,
        message_id: mail.messageId || null,
        attachments: attachments.map((a) => a.filename),
      },
    });
  } catch {
    /* non-fatal */
  }
  return mail;
}

function clientQuery(client) {
  return (text, params) => client.query(text, params);
}

function logoUrl(fileId) {
  return fileId ? `/api/v1/files/${fileId}/download` : null;
}

function extractFileIdFromDownloadUrl(href) {
  const match = String(href || '').match(/\/files\/([^/?#]+)\/download/i);
  return match?.[1] || null;
}

function isPlaceholderLogo(href) {
  const url = String(href || '').trim();
  if (!url) return true;
  const path = url.split('?')[0].toLowerCase();
  return path === '/logo.svg' || path.endsWith('/logo.svg');
}

/**
 * Logo institucional (Admin → Dados da associação), espelhada em kunk + registration.
 * @returns {Promise<string|null>} file id
 */
async function resolveBrandingLogoFileId() {
  try {
    const result = await query(
      `SELECT system, key, value FROM system_configs
       WHERE value IS NOT NULL
         AND TRIM(value) <> ''
         AND (
           (system = 'kunk' AND key = 'VITE_KUNK_LOGO')
           OR (
             system = 'registration'
             AND key IN (
               'VITE_ASSOCIATION_LOGO',
               'VITE_ASSOCIATION_LOGO_MENU',
               'VITE_ASSOCIATION_LOGO_SQUARE',
               'VITE_ASSOCIATION_LOGO_RECTANGULAR',
               'VITE_ASSOCIATION_LOGO_FORMAT',
               'VITE_ASSOCIATION_LOGO_PLACEMENTS'
             )
           )
         )`
    );
    const byKey = Object.fromEntries(
      result.rows.map((row) => [`${row.system}.${row.key}`, row.value])
    );
    const square = byKey['registration.VITE_ASSOCIATION_LOGO_SQUARE'];
    const rectangular = byKey['registration.VITE_ASSOCIATION_LOGO_RECTANGULAR'];
    let preferredFormat = String(byKey['registration.VITE_ASSOCIATION_LOGO_FORMAT'] || 'square')
      .trim()
      .toLowerCase();
    try {
      const raw = byKey['registration.VITE_ASSOCIATION_LOGO_PLACEMENTS'];
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const slot = parsed?.docsign?.login || parsed?.kunk?.login;
        if (slot?.format) preferredFormat = String(slot.format).trim().toLowerCase();
      }
    } catch {
      /* ignore invalid JSON */
    }
    const preferRect =
      preferredFormat === 'rectangular' || preferredFormat === 'rect' || preferredFormat === 'horizontal';
    const candidates = preferRect
      ? [
          rectangular,
          square,
          byKey['kunk.VITE_KUNK_LOGO'],
          byKey['registration.VITE_ASSOCIATION_LOGO'],
          byKey['registration.VITE_ASSOCIATION_LOGO_MENU'],
        ]
      : [
          square,
          rectangular,
          byKey['kunk.VITE_KUNK_LOGO'],
          byKey['registration.VITE_ASSOCIATION_LOGO'],
          byKey['registration.VITE_ASSOCIATION_LOGO_MENU'],
        ];
    for (const href of candidates) {
      if (isPlaceholderLogo(href)) continue;
      const id = extractFileIdFromDownloadUrl(href);
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveTemplateLogoFileId(templateLogoFileId) {
  if (templateLogoFileId) return templateLogoFileId;
  return resolveBrandingLogoFileId();
}

async function getAssociationProfile() {
  const defaults = {
    name: process.env.VITE_ASSOCIATION_NAME || 'Kunk',
    fullName: process.env.VITE_ASSOCIATION_FULL_NAME || '',
    email: process.env.VITE_ASSOCIATION_EMAIL || '',
    phone: process.env.VITE_ASSOCIATION_PHONE || '',
    site: process.env.VITE_ASSOCIATION_SITE || '',
    cnpj: process.env.VITE_ASSOCIATION_CNPJ || '',
    city: process.env.VITE_ASSOCIATION_CITY || '',
    state: process.env.VITE_ASSOCIATION_STATE || '',
  };
  const keyMap = {
    VITE_ASSOCIATION_NAME: 'name',
    VITE_ASSOCIATION_FULL_NAME: 'fullName',
    VITE_ASSOCIATION_EMAIL: 'email',
    VITE_ASSOCIATION_PHONE: 'phone',
    VITE_ASSOCIATION_SITE: 'site',
    VITE_ASSOCIATION_CNPJ: 'cnpj',
    VITE_ASSOCIATION_CITY: 'city',
    VITE_ASSOCIATION_STATE: 'state',
  };
  try {
    const result = await query(
      `SELECT key, value FROM system_configs
       WHERE system = 'registration'
         AND key = ANY($1::text[])`,
      [Object.keys(keyMap)]
    );
    for (const row of result.rows) {
      const prop = keyMap[row.key];
      if (!prop) continue;
      if (row.value != null && String(row.value).trim()) {
        defaults[prop] = String(row.value).trim();
      }
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

async function getAssociationName() {
  const profile = await getAssociationProfile();
  return profile.name || 'Kunk';
}

/** Nome usado no título padrão do termo (preferência: nome completo). */
async function getAssociationTitleName() {
  const profile = await getAssociationProfile();
  return (profile.fullName || profile.name || 'Kunk').trim() || 'Kunk';
}

async function loadLogoDataUrl(fileId) {
  if (!fileId) return null;
  try {
    const file = await filesRepository.getFile(fileId);
    const buf = await filesRepository.readFileBuffer(file);
    const mime = file.mime_type || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function publicContract(row, { token = null } = {}) {
  if (!row) return null;
  const variables = row.variables || {};
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    kind_display_name: row.kind_display_name || kindDisplayFallback(row.kind),
    title: String(row.title || '').trim() || row.kind_display_name || kindDisplayFallback(row.kind),
    user_code: row.user_code,
    signer_email: row.signer_email,
    associate_full_name:
      (row.associate_full_name || '').trim() ||
      variables.responsible_full_name ||
      null,
    associate_cpf: row.associate_cpf || variables.responsible_cpf || null,
    variables,
    filled_pdf_url: row.filled_pdf_file_id ? `/api/v1/files/${row.filled_pdf_file_id}/download` : null,
    signed_pdf_url: row.signed_pdf_file_id ? `/api/v1/files/${row.signed_pdf_file_id}/download` : null,
    audit_pdf_url: row.audit_pdf_file_id ? `/api/v1/files/${row.audit_pdf_file_id}/download` : null,
    filled_pdf_sha256: row.filled_pdf_sha256 || null,
    signed_pdf_sha256: row.signed_pdf_sha256 || null,
    created_at: row.created_at,
    completed_at: row.completed_at || null,
    signing_url: token ? signingUrl(token) : undefined,
  };
}

async function status() {
  await ensureDefaultTemplates();
  const templates = await repo.listTemplates();
  const published = templates.filter((t) => t.current_version_id);
  return {
    status: 'ready',
    templates: templates.map((t) => ({
      kind: t.kind,
      title: t.title,
      published: Boolean(t.current_version_id),
      current_version_number: t.current_version_number || null,
    })),
    ready_to_contract: published.filter((t) => t.kind === 'self' || t.kind === 'with_patient').length >= 2,
  };
}

async function listTemplates() {
  await ensureDefaultTemplates();
  const rows = await repo.listTemplates();
  return rows.map((t) => ({
    ...t,
    display_name: t.display_name || kindDisplayFallback(t.kind),
    requires_patient: Boolean(t.requires_patient || t.kind === 'with_patient'),
    contracts_count: Number(t.contracts_count) || 0,
  }));
}

function kindDisplayFallback(kind) {
  if (kind === 'self') return 'Associado';
  if (kind === 'with_patient') return 'Associado com paciente';
  return kind || '—';
}

function slugifyKind(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 40);
}

async function createTemplate(body = {}) {
  const mode = body.mode || body.type || 'custom';
  const defaultTit = defaultTitle(await getAssociationTitleName());

  let kind;
  let displayName;
  let requiresPatient;
  let draftContentJson;
  let title;

  if (mode === 'self') {
    kind = 'self';
    displayName = 'Associado';
    requiresPatient = false;
    draftContentJson = DEFAULT_SELF_CONTENT;
    title = body.title?.trim() || defaultTit;
  } else if (mode === 'with_patient') {
    kind = 'with_patient';
    displayName = 'Associado com paciente';
    requiresPatient = true;
    draftContentJson = DEFAULT_WITH_PATIENT_CONTENT;
    title = body.title?.trim() || defaultTit;
  } else {
    displayName = String(body.display_name || body.label || '').trim();
    if (!displayName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Informe o nome do novo tipo de modelo');
    }
    kind = slugifyKind(body.kind || displayName);
    if (!kind || !/^[a-z][a-z0-9_]{1,39}$/.test(kind)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Código do modelo inválido (use letras minúsculas, números e _)');
    }
    if (kind === 'self' || kind === 'with_patient') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Use a opção Associado / Associado com paciente para esses tipos');
    }
    requiresPatient = Boolean(body.requires_patient);
    draftContentJson = requiresPatient ? DEFAULT_WITH_PATIENT_CONTENT : DEFAULT_SELF_CONTENT;
    title = body.title?.trim() || defaultTit;
  }

  const existing = await repo.getTemplateByKind(kind);
  if (existing) {
    throw new AppError(409, 'TEMPLATE_EXISTS', `Já existe um modelo do tipo "${kindDisplayFallback(kind)}"`);
  }

  const row = await repo.createTemplate({
    kind,
    title,
    displayName,
    requiresPatient,
    draftContentJson,
  });
  await publish(kind, { notes: 'Publicação automática na criação', requireLogo: false });
  const published = await repo.getTemplateByKind(kind);
  return {
    id: published?.id || row.id,
    kind: row.kind,
    title: row.title,
    display_name: row.display_name,
    requires_patient: row.requires_patient,
    current_version_id: published?.current_version_id || null,
  };
}

async function getTemplate(kind) {
  const row = await repo.getTemplateByKind(kind);
  if (!row) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  const versions = await repo.listVersions(kind);
  const associationName = await getAssociationName();
  const requiresPatient = Boolean(row.requires_patient || row.kind === 'with_patient');
  const brandingLogoId = row.logo_file_id ? null : await resolveBrandingLogoFileId();
  const effectiveLogoId = row.logo_file_id || brandingLogoId || null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    display_name: row.display_name || kindDisplayFallback(row.kind),
    requires_patient: requiresPatient,
    default_title: defaultTitle(await getAssociationTitleName()),
    association_name: associationName,
    logo_file_id: effectiveLogoId,
    logo_url: logoUrl(effectiveLogoId),
    logo_from_association: Boolean(!row.logo_file_id && brandingLogoId),
    draft_content_json: row.draft_content_json,
    published_content_json: row.published_content_json || null,
    current_version_id: row.current_version_id,
    current_version_number: row.current_version_number || null,
    current_pdf_file_id: row.current_pdf_file_id || null,
    variables: CANONICAL_VARIABLES.map((name) => ({ name, label: VARIABLE_LABELS[name] || name })),
    versions: versions.map((v) => ({
      id: v.id,
      version_number: v.version_number,
      content_sha256: v.content_sha256,
      pdf_file_id: v.pdf_file_id,
      pdf_sha256: v.pdf_sha256,
      created_at: v.created_at,
      notes: v.notes,
    })),
  };
}

async function saveDraft(kind, { content_json, title, logo_file_id } = {}) {
  if (content_json !== undefined) {
    const check = validateContentJson(content_json);
    if (!check.ok) {
      throw new AppError(400, 'TEMPLATE_INVALID_VARIABLES', check.message, { unknown: check.unknown });
    }
  }
  if (title !== undefined && !String(title || '').trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Título do termo é obrigatório');
  }
  if (logo_file_id !== undefined && logo_file_id !== null) {
    const file = await filesRepository.getFile(logo_file_id);
    if (!file) throw new AppError(400, 'VALIDATION_ERROR', 'Arquivo de logo inválido');
  }
  const row = await repo.saveDraft(kind, {
    contentJson: content_json,
    title,
    logoFileId: logo_file_id,
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  return getTemplate(kind);
}

async function listTemplateLogos() {
  return repo.listTemplateLogos();
}

/**
 * Garante os dois modelos padrão (Associado / Associado com paciente) e os publica.
 * Idempotente — só cria se ainda não existirem; republica se ainda sem versão.
 */
async function ensureDefaultTemplates() {
  const title = defaultTitle(await getAssociationTitleName());
  const specs = [
    {
      kind: 'self',
      displayName: 'Associado',
      requiresPatient: false,
      draftContentJson: DEFAULT_SELF_CONTENT,
    },
    {
      kind: 'with_patient',
      displayName: 'Associado com paciente',
      requiresPatient: true,
      draftContentJson: DEFAULT_WITH_PATIENT_CONTENT,
    },
  ];
  const created = [];
  const published = [];
  for (const spec of specs) {
    let existing = await repo.getTemplateByKind(spec.kind);
    if (!existing) {
      await repo.createTemplate({
        kind: spec.kind,
        title,
        displayName: spec.displayName,
        requiresPatient: spec.requiresPatient,
        draftContentJson: spec.draftContentJson,
      });
      created.push(spec.kind);
      existing = await repo.getTemplateByKind(spec.kind);
    }
    if (existing && !existing.current_version_id) {
      await publish(spec.kind, {
        notes: 'Publicação automática na instalação',
        requireLogo: false,
      });
      published.push(spec.kind);
    }
  }
  return { created, published, kinds: specs.map((s) => s.kind) };
}

async function resetDefaultTemplates() {
  const associationName = await getAssociationName();
  const title = defaultTitle(await getAssociationTitleName());
  await repo.resetTemplatesToDefaults({
    selfContent: DEFAULT_SELF_CONTENT,
    withPatientContent: DEFAULT_WITH_PATIENT_CONTENT,
    selfTitle: title,
    withPatientTitle: title,
  });
  for (const kind of ['self', 'with_patient']) {
    await publish(kind, { notes: 'Publicação automática após reset', requireLogo: false });
  }
  return {
    association_name: associationName,
    title,
    kinds: ['self', 'with_patient'],
  };
}

async function resetTemplateKind(kind) {
  const template = await repo.getTemplateByKind(kind);
  if (!template) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  const title = defaultTitle(await getAssociationTitleName());
  const requiresPatient = Boolean(template.requires_patient || kind === 'with_patient');
  const content = requiresPatient ? DEFAULT_WITH_PATIENT_CONTENT : DEFAULT_SELF_CONTENT;
  const row = await repo.resetTemplateKind(kind, { content, title });
  if (!row) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  await publish(kind, { notes: 'Publicação automática após reset', requireLogo: false });
  return getTemplate(kind);
}

async function deleteTemplate(kind) {
  const template = await repo.getTemplateByKind(kind);
  if (!template) throw new AppError(404, 'NOT_FOUND', `Modelo ${kind} não encontrado`);

  const contractsCount = await repo.countContractsByKind(kind);
  if (contractsCount > 0) {
    throw new AppError(
      409,
      'TEMPLATE_HAS_CONTRACTS',
      `Não é possível excluir: existem ${contractsCount} termo(s) gerado(s) com este modelo`
    );
  }

  const deleted = await repo.deleteTemplateByKind(kind);
  if (!deleted) throw new AppError(404, 'NOT_FOUND', `Modelo ${kind} não encontrado`);
  return { kind: deleted.kind, deleted: true };
}

async function getSampleVariables(kind, overrides = {}) {
  const template = await repo.getTemplateByKind(kind);
  if (!template) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  const requiresPatient = Boolean(template.requires_patient || kind === 'with_patient');
  const association = await getAssociationProfile();
  const variables = sampleVariables(requiresPatient ? 'with_patient' : 'self', overrides, {
    association,
  });
  return {
    kind,
    variables,
    fields: CANONICAL_VARIABLES.filter((name) => name !== 'signature').map((name) => ({
      name,
      label: VARIABLE_LABELS[name] || name,
      value: variables[name],
    })),
  };
}

/**
 * Render PDF from current draft (or provided content_json) filled with sample / override variables.
 * Does not persist files.
 */
async function previewPdf(kind, { contentJson = null, variables: overrides = {} } = {}) {
  const template = await repo.getTemplateByKind(kind);
  if (!template) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  const requiresPatient = Boolean(template.requires_patient || kind === 'with_patient');

  const doc = contentJson || template.draft_content_json || template.published_content_json;
  if (!doc) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Não há conteúdo no rascunho para gerar o PDF');
  }
  const check = validateContentJson(doc);
  if (!check.ok) {
    throw new AppError(400, 'TEMPLATE_INVALID_VARIABLES', check.message, { unknown: check.unknown });
  }

  const association = await getAssociationProfile();
  const variables = sampleVariables(requiresPatient ? 'with_patient' : 'self', overrides || {}, {
    association,
  });
  Object.assign(variables, associationDefaults(association));
  const filled = applyVariablesToContent(doc, variables);
  const logoFileId = await resolveTemplateLogoFileId(template.logo_file_id);
  const logoDataUrl = await loadLogoDataUrl(logoFileId);
  let pdf;
  try {
    pdf = await renderContentPdf(filled, { title: template.title, logoDataUrl });
  } catch (err) {
    throw new AppError(500, 'PDF_RENDER_FAILED', err.message || 'Falha ao gerar PDF de prévia');
  }

  return {
    buffer: pdf.buffer,
    sha256: pdf.sha256,
    filename: `termo-${kind}-preview.pdf`,
    variables,
  };
}

async function publish(kind, { notes = null, createdBy = null, requireLogo = true } = {}) {
  const template = await repo.getTemplateByKind(kind);
  if (!template) throw new AppError(404, 'NOT_FOUND', `Template ${kind} não encontrado`);
  const contentJson = template.draft_content_json || template.published_content_json;
  if (!contentJson) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Salve um rascunho antes de publicar');
  }
  if (!String(template.title || '').trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Título do termo é obrigatório para publicar');
  }
  const logoFileId = await resolveTemplateLogoFileId(template.logo_file_id);
  if (requireLogo && !logoFileId) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Logo do termo é obrigatória para publicar (defina no modelo ou em Dados da associação)',
    );
  }
  const check = validateContentJson(contentJson);
  if (!check.ok) {
    throw new AppError(400, 'TEMPLATE_INVALID_VARIABLES', check.message, { unknown: check.unknown });
  }

  const logoDataUrl = logoFileId ? await loadLogoDataUrl(logoFileId) : null;
  if (requireLogo && !logoDataUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Arquivo de logo não encontrado');
  }

  let pdf;
  try {
    pdf = await renderContentPdf(contentJson, { title: template.title, logoDataUrl });
  } catch (err) {
    throw new AppError(500, 'PDF_RENDER_FAILED', err.message || 'Falha ao gerar PDF');
  }

  const file = await filesRepository.createFile({
    buffer: pdf.buffer,
    filename: `term-template-${kind}.pdf`,
    mimeType: 'application/pdf',
  });

  const contentSha = sha256(Buffer.from(JSON.stringify(contentJson)));
  const existingVersionId = template.current_version_id || template.published_version_id || null;

  const version = await withClient(async (client) => {
    const q = clientQuery(client);
    await client.query('BEGIN');
    try {
      let ver;
      if (existingVersionId) {
        ver = await repo.updateVersion(
          {
            id: existingVersionId,
            content_json: contentJson,
            content_sha256: contentSha,
            pdf_file_id: file.id,
            pdf_sha256: pdf.sha256,
            created_by: createdBy,
            notes,
          },
          q
        );
        if (!ver) {
          throw new AppError(404, 'NOT_FOUND', 'Versão publicada do modelo não encontrada');
        }
      } else {
        const versionId = uuidv4();
        ver = await repo.insertVersion(
          {
            id: versionId,
            template_id: template.id,
            version_number: 1,
            content_json: contentJson,
            content_sha256: contentSha,
            pdf_file_id: file.id,
            pdf_sha256: pdf.sha256,
            created_by: createdBy,
            notes,
          },
          q
        );
        await repo.setCurrentVersion(template.id, versionId, q);
      }
      await client.query('COMMIT');
      return ver;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  return {
    template_id: template.id,
    kind,
    version: {
      id: version.id,
      version_number: version.version_number,
      content_sha256: version.content_sha256,
      pdf_file_id: version.pdf_file_id,
      pdf_sha256: version.pdf_sha256,
    },
  };
}

async function createContract({
  userCode,
  sendEmail = true,
  regenerate = false,
  replaceCompleted = false,
  kind: kindOverride = null,
  meta = {},
}) {
  const user = await repo.findUserByCode(userCode);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');

  const email = user.email_account;
  if (!email) throw new AppError(400, 'VALIDATION_ERROR', 'Usuário sem e-mail');

  const completed = await repo.findCompletedContract({ userCode: user.user_code, email });
  if (completed && !replaceCompleted) {
    throw new AppError(409, 'CONTRACT_ALREADY_COMPLETED', 'Já existe um termo concluído para este associado/e-mail');
  }

  if (!regenerate && !replaceCompleted) {
    const pending = await repo.findPendingByUser(user.user_code);
    if (pending) {
      // Cannot recover raw token; mint a fresh token for the same pending contract.
      const token = makeSigningToken();
      await withClient(async (client) => {
        const q = clientQuery(client);
        await q(
          `UPDATE term_contracts SET signing_token_hash = $2, signing_token_expires = NOW() + INTERVAL '14 days'
           WHERE id = $1`,
          [pending.id, hashToken(token)]
        );
      });
      if (sendEmail !== false) {
        await sendSigningInviteEmail({
          email,
          signerName: fullName(user),
          token,
          contractId: pending.id,
        });
      }
      return { ...publicContract(pending, { token }), meta: { reused: true } };
    }
  }

  const kind = kindOverride ? String(kindOverride) : resolveKind(user);
  const template = await repo.getTemplateByKind(kind);
  if (!template?.current_version_id) {
    throw new AppError(422, 'TEMPLATE_NOT_PUBLISHED', `Modelo ${kind} ainda não foi publicado`);
  }
  const version = await repo.getVersionById(template.current_version_id);
  if (!version) throw new AppError(422, 'TEMPLATE_NOT_PUBLISHED', `Versão publicada de ${kind} não encontrada`);

  const requiresPatient = Boolean(template.requires_patient || kind === 'with_patient');
  let patient = null;
  if (requiresPatient && user.patient_user_code) {
    patient = await repo.findUserByCode(user.patient_user_code);
  }

  const association = await getAssociationProfile();
  const variables = resolveVariables(user, patient, { association });
  const missing = missingRequiredVariables(variables, requiresPatient);
  if (missing.length) {
    const labels = missing.map((name) => VARIABLE_LABELS[name] || name);
    throw new AppError(
      422,
      'ASSOCIATE_DATA_INCOMPLETE',
      `Cadastro incompleto para gerar o termo. Preencha: ${labels.join(', ')}`,
      { missing }
    );
  }
  const filledContent = applyVariablesToContent(version.content_json, variables);
  const logoFileId = await resolveTemplateLogoFileId(template.logo_file_id);
  const logoDataUrl = await loadLogoDataUrl(logoFileId);

  let pdf;
  try {
    pdf = await renderContentPdf(filledContent, { title: template.title, logoDataUrl });
  } catch (err) {
    throw new AppError(500, 'PDF_RENDER_FAILED', err.message || 'Falha ao gerar PDF do contrato');
  }

  const file = await filesRepository.createFile({
    buffer: pdf.buffer,
    filename: `term-filled-${user.user_code}.pdf`,
    mimeType: 'application/pdf',
  });

  const contractId = uuidv4();
  const token = makeSigningToken();
  const tokenHash = hashToken(token);

  const contract = await withClient(async (client) => {
    const q = clientQuery(client);
    await client.query('BEGIN');
    try {
      if (replaceCompleted) {
        await repo.clearCompletedContractsForUser(user.user_code, email, q);
      }
      if (regenerate || replaceCompleted) {
        await repo.voidPendingByUser(user.user_code, q);
      }
      const row = await repo.insertContract(
        {
          id: contractId,
          user_code: user.user_code,
          signer_email: email,
          template_version_id: version.id,
          kind,
          variables,
          filled_pdf_file_id: file.id,
          filled_pdf_sha256: pdf.sha256,
          signing_token_hash: tokenHash,
          signing_token_expires: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        },
        q
      );
      await repo.insertEvent(
        {
          contract_id: contractId,
          event_type: 'contract.created',
          actor_email: email,
          actor_name: fullName(user),
          ip: meta.ip || null,
          user_agent: meta.userAgent || null,
          timezone: meta.timezone || null,
        },
        q
      );
      await client.query('COMMIT');
      return row;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  if (sendEmail !== false) {
    await sendSigningInviteEmail({
      email,
      signerName: fullName(user),
      token,
      contractId: contract.id,
      associationName: association?.name || null,
    });
  }

  return { ...publicContract(contract, { token }), meta: { reused: false, replaced: Boolean(replaceCompleted) } };
}

async function resendContractEmail(contractId) {
  const row = await repo.getContractById(contractId);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');
  if (row.status !== 'pending') {
    throw new AppError(409, 'CONTRACT_NOT_PENDING', 'Só é possível reenviar e-mail de contratos pending');
  }
  const token = makeSigningToken();
  await withClient(async (client) => {
    const q = clientQuery(client);
    await q(
      `UPDATE term_contracts SET signing_token_hash = $2, signing_token_expires = NOW() + INTERVAL '14 days'
       WHERE id = $1`,
      [row.id, hashToken(token)]
    );
  });
  const mail = await sendSigningInviteEmail({
    email: row.signer_email,
    signerName: row.variables?.responsible_full_name || null,
    token,
    contractId: row.id,
  });
  return {
    ...publicContract(row, { token }),
    email_sent: Boolean(mail.email_sent),
    email_status: mail.email_status || mail.reason || null,
  };
}

async function getContract(id) {
  const row = await repo.getContractById(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');
  return publicContract(row);
}

async function getMyContract(associateUser) {
  const pending = await repo.findPendingByUser(associateUser.user_code);
  if (pending) return publicContract(pending);
  const completed = await repo.findCompletedContract({
    userCode: associateUser.user_code,
    email: associateUser.email_account,
  });
  if (completed) return publicContract(completed);
  return null;
}

async function listByUser(userCode) {
  const rows = await repo.listContractsByUser(userCode);
  return rows.map((r) => publicContract(r));
}

async function listContracts(opts = {}) {
  const { rows, total, limit, offset } = await repo.listContracts(opts);
  return {
    items: rows.map((r) => ({
      ...publicContract(r),
      associate_full_name: (r.associate_full_name || '').trim() || null,
      associate_cpf: r.associate_cpf || null,
    })),
    total,
    limit,
    offset,
  };
}

async function getSignPayload(token) {
  const row = await repo.getContractByTokenHash(hashToken(token));
  if (!row) throw new AppError(404, 'TOKEN_INVALID', 'Link de assinatura inválido ou expirado');

  if (row.status === 'completed') {
    return {
      contract_id: row.id,
      status: 'completed',
      already_signed: true,
      kind: row.kind,
      title: null,
      signer_email: row.signer_email,
      variables: row.variables || {},
      content_json: null,
      methods: [],
    };
  }

  if (row.status !== 'pending') {
    throw new AppError(410, 'TOKEN_INVALID', 'Link de assinatura inválido ou expirado');
  }

  if (row.signing_token_expires && new Date(row.signing_token_expires) < new Date()) {
    throw new AppError(410, 'TOKEN_INVALID', 'Link de assinatura expirado');
  }

  const version = await repo.getVersionById(row.template_version_id);
  if (!version?.content_json) {
    throw new AppError(500, 'TEMPLATE_MISSING', 'Conteúdo do termo não encontrado');
  }
  const template = await repo.getTemplateByKind(row.kind);
  const contentJson = applyVariablesToContent(version.content_json, row.variables || {});
  const logoFileId = await resolveTemplateLogoFileId(template?.logo_file_id);

  return {
    contract_id: row.id,
    status: row.status,
    already_signed: false,
    kind: row.kind,
    title: template?.title || 'Termo de adesão',
    logo_url: logoUrl(logoFileId),
    signer_email: row.signer_email,
    variables: row.variables,
    content_json: contentJson,
    methods: ['draw', 'type', 'upload'],
  };
}

async function recordView(token, meta = {}) {
  const row = await repo.getContractByTokenHash(hashToken(token), { status: 'pending' });
  if (!row) throw new AppError(404, 'TOKEN_INVALID', 'Link de assinatura inválido');
  await repo.insertEvent({
    contract_id: row.id,
    event_type: 'form.viewed',
    actor_email: row.signer_email,
    actor_name: row.variables?.responsible_full_name || null,
    ip: meta.ip || null,
    user_agent: meta.userAgent || null,
    timezone: meta.timezone || null,
  });
  return { ok: true };
}

async function completeSign(token, body, meta = {}) {
  const method = body?.method;
  if (!['draw', 'type', 'upload'].includes(method)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'method deve ser draw, type ou upload');
  }
  if (!body?.consent) {
    throw new AppError(400, 'CONSENT_REQUIRED', 'Consentimento é obrigatório');
  }

  let signatureBuffer = decodeDataUrl(body.signature_image_base64);
  if (method === 'type') {
    if (!body.typed_name || !String(body.typed_name).trim()) {
      throw new AppError(400, 'SIGNATURE_REQUIRED', 'Informe o nome digitado');
    }
  } else if (!signatureBuffer) {
    throw new AppError(400, 'SIGNATURE_REQUIRED', 'Imagem da assinatura é obrigatória');
  }

  const row = await repo.getContractByTokenHash(hashToken(token), { status: 'pending' });
  if (!row) throw new AppError(404, 'TOKEN_INVALID', 'Link de assinatura inválido');
  if (row.status !== 'pending') {
    throw new AppError(409, 'CONTRACT_NOT_PENDING', 'Contrato não está pendente');
  }

  await repo.insertEvent({
    contract_id: row.id,
    event_type: 'submission.started',
    actor_email: row.signer_email,
    actor_name: row.variables?.responsible_full_name || null,
    ip: meta.ip || null,
    user_agent: meta.userAgent || null,
    timezone: body.timezone || meta.timezone || null,
  });

  const version = await repo.getVersionById(row.template_version_id);
  if (!version?.content_json) {
    throw new AppError(500, 'TEMPLATE_MISSING', 'Conteúdo do termo não encontrado');
  }
  const template = await repo.getTemplateByKind(row.kind);
  const filledContent = applyVariablesToContent(version.content_json, row.variables || {});
  const logoFileId = await resolveTemplateLogoFileId(template?.logo_file_id);
  const logoDataUrl = await loadLogoDataUrl(logoFileId);

  const isEmptyPng =
    signatureBuffer &&
    signatureBuffer.length < 100;
  const useTypedName = method === 'type' && (!signatureBuffer || isEmptyPng);

  let signedPdf;
  try {
    signedPdf = await renderContentPdf(filledContent, {
      title: template?.title || 'Termo de adesão',
      logoDataUrl,
      signatureBuffer: useTypedName ? null : signatureBuffer,
      typedName: useTypedName ? body.typed_name : null,
    });
  } catch (err) {
    throw new AppError(500, 'PDF_RENDER_FAILED', err.message || 'Falha ao gerar PDF assinado');
  }

  const signedFile = await filesRepository.createFile({
    buffer: signedPdf.buffer,
    filename: `term-signed-${row.id}.pdf`,
    mimeType: 'application/pdf',
  });

  const imageToStore = signatureBuffer || emptyPngBuffer();
  const sigFile = await filesRepository.createFile({
    buffer: imageToStore,
    filename: `term-signature-${row.id}.png`,
    mimeType: 'image/png',
  });

  const events = await repo.listEvents(row.id);
  events.push({
    event_type: 'submission.completed',
    occurred_at: new Date().toISOString(),
    actor_name: row.variables?.responsible_full_name || null,
  });

  const audit = await renderAuditPdf({
    contractId: row.id,
    originalSha256: row.filled_pdf_sha256,
    resultSha256: signedPdf.sha256,
    generatedAt: new Date().toLocaleString('pt-BR', { timeZone: body.timezone || 'America/Sao_Paulo' }),
    signerEmail: row.signer_email,
    signerName: row.variables?.responsible_full_name || null,
    ip: meta.ip || null,
    userAgent: meta.userAgent || null,
    timezone: body.timezone || meta.timezone || null,
    variables: row.variables,
    events,
  });

  const auditFile = await filesRepository.createFile({
    buffer: audit.buffer,
    filename: `term-audit-${row.id}.pdf`,
    mimeType: 'application/pdf',
  });

  const completed = await withClient(async (client) => {
    const q = clientQuery(client);
    await client.query('BEGIN');
    try {
      const sigId = uuidv4();
      await repo.insertSignature(
        {
          id: sigId,
          contract_id: row.id,
          method,
          typed_name: body.typed_name || null,
          image_file_id: sigFile.id,
        },
        q
      );
      const done = await repo.completeContract(
        {
          id: row.id,
          signed_pdf_file_id: signedFile.id,
          audit_pdf_file_id: auditFile.id,
          signed_pdf_sha256: signedPdf.sha256,
        },
        q
      );
      if (!done) {
        throw new AppError(409, 'CONTRACT_NOT_PENDING', 'Contrato não está pendente');
      }
      await repo.insertEvent(
        {
          contract_id: row.id,
          event_type: 'submission.completed',
          actor_email: row.signer_email,
          actor_name: row.variables?.responsible_full_name || null,
          ip: meta.ip || null,
          user_agent: meta.userAgent || null,
          timezone: body.timezone || meta.timezone || null,
        },
        q
      );
      await repo.setUserAdhesionAndPhase(row.user_code, row.id, q);
      await client.query('COMMIT');
      return done;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

  // Confirmation e-mail with PDF attachments (non-blocking for business result)
  try {
    await sendSignedConfirmationEmail({
      email: row.signer_email,
      signerName: row.variables?.responsible_full_name || null,
      signedPdfBuffer: signedPdf.buffer,
      auditPdfBuffer: audit.buffer,
      contractId: row.id,
    });
  } catch {
    /* never fail the signature because of mail */
  }

  return publicContract(completed);
}

async function verify(contractId) {
  const row = await repo.getContractById(contractId);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');
  const checks = {};
  if (row.filled_pdf_file_id) {
    const f = await filesRepository.getFile(row.filled_pdf_file_id);
    const buf = await filesRepository.readFileBuffer(f);
    const h = sha256(buf);
    checks.filled = { expected: row.filled_pdf_sha256, actual: h, ok: h === row.filled_pdf_sha256 };
  }
  if (row.signed_pdf_file_id && row.signed_pdf_sha256) {
    const f = await filesRepository.getFile(row.signed_pdf_file_id);
    const buf = await filesRepository.readFileBuffer(f);
    const h = sha256(buf);
    checks.signed = { expected: row.signed_pdf_sha256, actual: h, ok: h === row.signed_pdf_sha256 };
  }
  return { contract_id: contractId, checks, valid: Object.values(checks).every((c) => c.ok) };
}

async function getAudit(contractId) {
  const row = await repo.getContractById(contractId);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');
  const events = (await repo.listEvents(contractId)).map(withEventLabel);
  return {
    contract: publicContract(row),
    events,
    audit_pdf_url: row.audit_pdf_file_id ? `/api/v1/files/${row.audit_pdf_file_id}/download` : null,
  };
}

async function voidContract(id) {
  const row = await repo.getContractById(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');
  if (row.status !== 'pending') {
    throw new AppError(409, 'CONTRACT_NOT_PENDING', 'Só é possível anular contratos pending');
  }
  await withClient(async (client) => {
    await client.query(`UPDATE term_contracts SET status = 'void' WHERE id = $1`, [id]);
  });
  return { id, status: 'void' };
}

async function deleteContract(id) {
  const row = await repo.getContractById(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Contrato não encontrado');

  await withClient(async (client) => {
    await client.query(
      `UPDATE users SET adhesion_term = NULL, date_updated = NOW()
       WHERE adhesion_term = $1`,
      [id]
    );
    await client.query(`DELETE FROM term_contracts WHERE id = $1`, [id]);
  });

  return { id, deleted: true };
}

module.exports = {
  status,
  listTemplates,
  createTemplate,
  getTemplate,
  saveDraft,
  listTemplateLogos,
  ensureDefaultTemplates,
  resetDefaultTemplates,
  resetTemplateKind,
  deleteTemplate,
  getSampleVariables,
  previewPdf,
  publish,
  createContract,
  resendContractEmail,
  getContract,
  getMyContract,
  listByUser,
  listContracts,
  getSignPayload,
  recordView,
  completeSign,
  verify,
  getAudit,
  voidContract,
  deleteContract,
  publicContract,
  CANONICAL_VARIABLES,
  VARIABLE_LABELS,
};
