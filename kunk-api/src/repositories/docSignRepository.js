'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');

async function createTemplate({ kind, title, displayName, requiresPatient, draftContentJson }) {
  const result = await query(
    `INSERT INTO term_templates (
       id, kind, title, display_name, requires_patient, draft_content_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      uuidv4(),
      kind,
      title,
      displayName,
      Boolean(requiresPatient),
      JSON.stringify(draftContentJson || { type: 'doc', content: [{ type: 'paragraph' }] }),
    ]
  );
  return result.rows[0] || null;
}

async function listTemplates() {
  const result = await query(
    `SELECT t.*,
            v.version_number AS current_version_number,
            v.pdf_file_id AS current_pdf_file_id,
            v.content_sha256 AS current_content_sha256,
            COALESCE(c.contracts_count, 0)::int AS contracts_count
     FROM term_templates t
     LEFT JOIN term_template_versions v ON v.id = t.current_version_id
     LEFT JOIN (
       SELECT kind, COUNT(*)::int AS contracts_count
       FROM term_contracts
       GROUP BY kind
     ) c ON c.kind = t.kind
     ORDER BY t.kind`
  );
  return result.rows;
}

async function getTemplateByKind(kind) {
  const result = await query(
    `SELECT t.*,
            v.id AS published_version_id,
            v.version_number AS current_version_number,
            v.content_json AS published_content_json,
            v.pdf_file_id AS current_pdf_file_id,
            v.content_sha256 AS current_content_sha256,
            v.pdf_sha256 AS current_pdf_sha256
     FROM term_templates t
     LEFT JOIN term_template_versions v ON v.id = t.current_version_id
     WHERE t.kind = $1`,
    [kind]
  );
  return result.rows[0] || null;
}

async function saveDraft(kind, { contentJson, title, logoFileId } = {}) {
  const sets = ['updated_at = NOW()'];
  const params = [kind];
  if (contentJson !== undefined) {
    params.push(JSON.stringify(contentJson));
    sets.push(`draft_content_json = $${params.length}::jsonb`);
  }
  if (title !== undefined) {
    params.push(String(title).trim());
    sets.push(`title = $${params.length}`);
  }
  if (logoFileId !== undefined) {
    params.push(logoFileId || null);
    sets.push(`logo_file_id = $${params.length}`);
  }
  const result = await query(
    `UPDATE term_templates SET ${sets.join(', ')} WHERE kind = $1 RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function listTemplateLogos() {
  const result = await query(
    `SELECT DISTINCT ON (t.logo_file_id)
       t.logo_file_id AS id,
       f.filename,
       f.created_at
     FROM term_templates t
     JOIN files f ON f.id = t.logo_file_id
     WHERE t.logo_file_id IS NOT NULL
     ORDER BY t.logo_file_id, f.created_at DESC`
  );
  return result.rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    url: `/api/v1/files/${r.id}/download`,
    created_at: r.created_at,
  }));
}

async function resetTemplatesToDefaults({ selfContent, withPatientContent, selfTitle, withPatientTitle }) {
  await query(`UPDATE term_templates SET current_version_id = NULL WHERE kind IN ('self', 'with_patient')`);
  await query(
    `DELETE FROM term_template_versions v
     USING term_templates t
     WHERE v.template_id = t.id AND t.kind IN ('self', 'with_patient')`
  );

  await query(
    `INSERT INTO term_templates (id, kind, title, display_name, requires_patient, draft_content_json)
     VALUES ($1, 'self', $2, 'Associado', false, $3::jsonb)
     ON CONFLICT (kind) DO UPDATE SET
       title = EXCLUDED.title,
       display_name = EXCLUDED.display_name,
       requires_patient = EXCLUDED.requires_patient,
       draft_content_json = EXCLUDED.draft_content_json,
       logo_file_id = NULL,
       current_version_id = NULL,
       updated_at = NOW()`,
    [uuidv4(), selfTitle, JSON.stringify(selfContent)]
  );
  await query(
    `INSERT INTO term_templates (id, kind, title, display_name, requires_patient, draft_content_json)
     VALUES ($1, 'with_patient', $2, 'Associado com paciente', true, $3::jsonb)
     ON CONFLICT (kind) DO UPDATE SET
       title = EXCLUDED.title,
       display_name = EXCLUDED.display_name,
       requires_patient = EXCLUDED.requires_patient,
       draft_content_json = EXCLUDED.draft_content_json,
       logo_file_id = NULL,
       current_version_id = NULL,
       updated_at = NOW()`,
    [uuidv4(), withPatientTitle, JSON.stringify(withPatientContent)]
  );
}

async function resetTemplateKind(kind, { content, title }) {
  const tpl = await getTemplateByKind(kind);
  if (!tpl) return null;
  await query(`UPDATE term_templates SET current_version_id = NULL WHERE id = $1`, [tpl.id]);
  await query(`DELETE FROM term_template_versions WHERE template_id = $1`, [tpl.id]);
  const result = await query(
    `UPDATE term_templates
     SET title = $2,
         draft_content_json = $3::jsonb,
         logo_file_id = NULL,
         updated_at = NOW()
     WHERE kind = $1
     RETURNING *`,
    [kind, title, JSON.stringify(content)]
  );
  return result.rows[0] || null;
}

async function countContractsByKind(kind) {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM term_contracts WHERE kind = $1`,
    [kind]
  );
  return result.rows[0]?.n || 0;
}

async function deleteTemplateByKind(kind) {
  const tpl = await getTemplateByKind(kind);
  if (!tpl) return null;
  await query(`UPDATE term_templates SET current_version_id = NULL WHERE id = $1`, [tpl.id]);
  await query(`DELETE FROM term_template_versions WHERE template_id = $1`, [tpl.id]);
  const result = await query(`DELETE FROM term_templates WHERE kind = $1 RETURNING id, kind`, [kind]);
  return result.rows[0] || null;
}

async function clearCompletedContractsForUser(userCode, email, clientQuery = query) {
  await clientQuery(
    `UPDATE users SET adhesion_term = NULL, date_updated = NOW() WHERE user_code = $1`,
    [userCode]
  );
  await clientQuery(
    `UPDATE term_contracts SET status = 'void'
     WHERE status = 'completed'
       AND (user_code = $1 OR lower(signer_email) = lower($2))`,
    [userCode, email]
  );
}

async function listVersions(kind) {
  const result = await query(
    `SELECT v.*
     FROM term_template_versions v
     JOIN term_templates t ON t.id = v.template_id
     WHERE t.kind = $1
     ORDER BY v.version_number DESC`,
    [kind]
  );
  return result.rows;
}

async function getVersionById(versionId) {
  const result = await query(`SELECT * FROM term_template_versions WHERE id = $1`, [versionId]);
  return result.rows[0] || null;
}

async function nextVersionNumber(templateId, clientQuery = query) {
  const result = await clientQuery(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM term_template_versions WHERE template_id = $1`,
    [templateId]
  );
  return Number(result.rows[0].n);
}

async function insertVersion(row, clientQuery = query) {
  const result = await clientQuery(
    `INSERT INTO term_template_versions (
       id, template_id, version_number, content_json, content_sha256,
       pdf_file_id, pdf_sha256, created_by, notes
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      row.id,
      row.template_id,
      row.version_number,
      JSON.stringify(row.content_json),
      row.content_sha256,
      row.pdf_file_id || null,
      row.pdf_sha256 || null,
      row.created_by || null,
      row.notes || null,
    ]
  );
  return result.rows[0];
}

/** Atualiza a versão publicada existente (sem criar histórico). */
async function updateVersion(row, clientQuery = query) {
  const result = await clientQuery(
    `UPDATE term_template_versions
     SET content_json = $2::jsonb,
         content_sha256 = $3,
         pdf_file_id = $4,
         pdf_sha256 = $5,
         created_by = COALESCE($6, created_by),
         notes = $7
     WHERE id = $1
     RETURNING *`,
    [
      row.id,
      JSON.stringify(row.content_json),
      row.content_sha256,
      row.pdf_file_id || null,
      row.pdf_sha256 || null,
      row.created_by || null,
      row.notes || null,
    ]
  );
  return result.rows[0] || null;
}

async function setCurrentVersion(templateId, versionId, clientQuery = query) {
  const result = await clientQuery(
    `UPDATE term_templates
     SET current_version_id = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [templateId, versionId]
  );
  return result.rows[0];
}

async function findUserByCode(userCode) {
  const result = await query(`SELECT * FROM users WHERE user_code = $1`, [userCode]);
  return result.rows[0] || null;
}

async function findCompletedContract({ userCode, email }) {
  const result = await query(
    `SELECT * FROM term_contracts
     WHERE status = 'completed'
       AND (user_code = $1 OR lower(signer_email) = lower($2))
     LIMIT 1`,
    [userCode, email]
  );
  return result.rows[0] || null;
}

async function findPendingByUser(userCode) {
  const result = await query(
    `SELECT * FROM term_contracts
     WHERE user_code = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userCode]
  );
  return result.rows[0] || null;
}

async function voidPendingByUser(userCode, clientQuery = query) {
  await clientQuery(
    `UPDATE term_contracts SET status = 'void' WHERE user_code = $1 AND status = 'pending'`,
    [userCode]
  );
}

async function insertContract(row, clientQuery = query) {
  const result = await clientQuery(
    `INSERT INTO term_contracts (
       id, user_code, signer_email, template_version_id, kind, status, variables,
       filled_pdf_file_id, filled_pdf_sha256, signing_token_hash, signing_token_expires
     ) VALUES ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7,$8,$9,$10)
     RETURNING *`,
    [
      row.id,
      row.user_code,
      row.signer_email,
      row.template_version_id,
      row.kind,
      JSON.stringify(row.variables || {}),
      row.filled_pdf_file_id,
      row.filled_pdf_sha256,
      row.signing_token_hash,
      row.signing_token_expires || null,
    ]
  );
  return result.rows[0];
}

async function getContractById(id) {
  const result = await query(
    `SELECT c.*,
            COALESCE(NULLIF(tt.display_name, ''), tt.title, c.kind) AS kind_display_name,
            COALESCE(NULLIF(tt.title, ''), NULLIF(tt.display_name, ''), c.kind) AS title
     FROM term_contracts c
     LEFT JOIN term_templates tt ON tt.kind = c.kind
     WHERE c.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getContractByTokenHash(tokenHash, { status = null } = {}) {
  const params = [tokenHash];
  let sql = `SELECT * FROM term_contracts WHERE signing_token_hash = $1`;
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function listContractsByUser(userCode) {
  const result = await query(
    `SELECT * FROM term_contracts WHERE user_code = $1 ORDER BY created_at DESC`,
    [userCode]
  );
  return result.rows;
}

async function listContracts({ limit = 20, offset = 0, status = null, q = null } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  const term = q != null ? String(q).trim() : '';
  if (term) {
    params.push(`%${term.toLowerCase()}%`);
    where.push(
      `(LOWER(c.signer_email) LIKE $${params.length}
       OR LOWER(TRIM(CONCAT(COALESCE(u.associate_name, ''), ' ', COALESCE(u.associate_last_name, '')))) LIKE $${params.length}
       OR LOWER(COALESCE(u.associate_cpf, '')) LIKE $${params.length})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM term_contracts c
     LEFT JOIN users u ON u.user_code = c.user_code
     ${whereSql}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const limitN = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  params.push(limitN);
  params.push(offsetN);
  const result = await query(
    `SELECT c.*,
            TRIM(CONCAT(COALESCE(u.associate_name, ''), ' ', COALESCE(u.associate_last_name, ''))) AS associate_full_name,
            u.associate_cpf AS associate_cpf,
            COALESCE(NULLIF(tt.display_name, ''), tt.title, c.kind) AS kind_display_name
     FROM term_contracts c
     LEFT JOIN users u ON u.user_code = c.user_code
     LEFT JOIN term_templates tt ON tt.kind = c.kind
     ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows: result.rows, total, limit: limitN, offset: offsetN };
}

async function insertEvent(row, clientQuery = query) {
  const result = await clientQuery(
    `INSERT INTO term_events (
       id, contract_id, event_type, occurred_at, actor_email, actor_name,
       ip, user_agent, timezone, meta
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, COALESCE($4::timestamptz, NOW()),
       $5, $6, $7, $8, $9, $10::jsonb
     ) RETURNING *`,
    [
      row.id || null,
      row.contract_id,
      row.event_type,
      row.occurred_at || null,
      row.actor_email || null,
      row.actor_name || null,
      row.ip || null,
      row.user_agent || null,
      row.timezone || null,
      row.meta ? JSON.stringify(row.meta) : null,
    ]
  );
  return result.rows[0];
}

async function listEvents(contractId) {
  const result = await query(
    `SELECT * FROM term_events WHERE contract_id = $1 ORDER BY occurred_at ASC, id ASC`,
    [contractId]
  );
  return result.rows;
}

async function insertSignature(row, clientQuery = query) {
  const result = await clientQuery(
    `INSERT INTO term_signatures (id, contract_id, method, typed_name, image_file_id, consent_accepted_at)
     VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
    [row.id, row.contract_id, row.method, row.typed_name || null, row.image_file_id || null]
  );
  return result.rows[0];
}

async function completeContract(row, clientQuery = query) {
  const result = await clientQuery(
    `UPDATE term_contracts SET
       status = 'completed',
       signed_pdf_file_id = $2,
       audit_pdf_file_id = $3,
       signed_pdf_sha256 = $4,
       completed_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [row.id, row.signed_pdf_file_id, row.audit_pdf_file_id, row.signed_pdf_sha256]
  );
  return result.rows[0] || null;
}

async function setUserAdhesionAndPhase(userCode, contractId, clientQuery = query) {
  const result = await clientQuery(
    `UPDATE users SET
       adhesion_term = $2,
       status = 'Associado',
       date_updated = NOW()
     WHERE user_code = $1
     RETURNING *`,
    [userCode, contractId]
  );
  return result.rows[0];
}

module.exports = {
  listTemplates,
  createTemplate,
  getTemplateByKind,
  saveDraft,
  listTemplateLogos,
  resetTemplatesToDefaults,
  resetTemplateKind,
  countContractsByKind,
  deleteTemplateByKind,
  clearCompletedContractsForUser,
  listVersions,
  getVersionById,
  nextVersionNumber,
  insertVersion,
  updateVersion,
  setCurrentVersion,
  findUserByCode,
  findCompletedContract,
  findPendingByUser,
  voidPendingByUser,
  insertContract,
  getContractById,
  getContractByTokenHash,
  listContractsByUser,
  listContracts,
  insertEvent,
  listEvents,
  insertSignature,
  completeContract,
  setUserAdhesionAndPhase,
};
