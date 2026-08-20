'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { isKnownColumn } = require('../schema/collections');
const associateAuthRepository = require('../repositories/associateAuthRepository');
const ciap2Config = require('./ciap2Config');
const {
  PHASE,
  normalizePhase,
  phaseAtMost,
  phaseEquals,
  isAssociateStatus,
} = require('../constants/associatePhases');

const PATCHABLE = [
  'responsible_type', 'associate_name', 'associate_last_name', 'associate_birth_date',
  'gender', 'nationality', 'associate_cpf', 'associate_rg', 'associate_rg_issuer',
  'marital_status', 'account_password', 'mobile_number', 'street', 'street_number',
  'complement', 'neighborhood', 'city', 'state', 'cep', 'reason_treatment_text',
  'ciap_codes', 'prescription', 'preferred_products', 'date_prescription',
  'fullname',
];

const REQUIRED_RESPONSIBLE = [
  'responsible_type', 'associate_name', 'associate_last_name', 'associate_birth_date',
  'gender', 'nationality', 'associate_cpf', 'associate_rg', 'associate_rg_issuer',
  'marital_status', 'account_password', 'mobile_number', 'street', 'street_number',
  'neighborhood', 'city', 'state', 'cep', 'reason_treatment_text', 'ciap_codes',
];

const REQUIRED_PATIENT = [
  'associate_name', 'associate_last_name', 'associate_birth_date',
  'gender', 'nationality', 'associate_cpf', 'associate_rg', 'associate_rg_issuer',
  'ciap_codes', 'reason_treatment_text',
];

const REQUIRED_PET_PATIENT = [
  'associate_name', 'associate_birth_date', 'gender', 'reason_treatment_text',
];

function isPatientRegistration(responsibleType) {
  return ['another', 'pet'].includes(String(responsibleType || ''));
}

function requiredResponsibleFields(responsibleType) {
  if (responsibleType !== 'pet') return REQUIRED_RESPONSIBLE;
  return REQUIRED_RESPONSIBLE.filter(
    (key) => key !== 'reason_treatment_text' && key !== 'ciap_codes'
  );
}

function requiredPatientFields(responsibleType) {
  return responsibleType === 'pet' ? REQUIRED_PET_PATIENT : REQUIRED_PATIENT;
}

function isValidCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

function isValidCep(value) {
  return String(value || '').replace(/\D/g, '').length === 8;
}

function isValidPhoneBr(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function normalizeCiap(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function fieldPresent(row, key) {
  if (key === 'account_password') return Boolean(row.account_password);
  if (key === 'ciap_codes') return normalizeCiap(row.ciap_codes).length >= 1;
  const v = row[key];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function validateField(key, value, { requirePasswordHash = false } = {}) {
  if (value === undefined || value === null || value === '') return false;
  if (key === 'associate_cpf') return isValidCpf(value);
  if (key === 'cep') return isValidCep(value);
  if (key === 'mobile_number') return isValidPhoneBr(value);
  if (key === 'account_password') {
    if (requirePasswordHash && String(value).startsWith('$2')) return true;
    return String(value).length >= 8;
  }
  if (key === 'ciap_codes') {
    const codes = normalizeCiap(value);
    return codes.length >= 1 && codes.length <= 10;
  }
  if (key === 'responsible_type') {
    return ['himself', 'another', 'pet'].includes(String(value));
  }
  if (key === 'state') return String(value).length === 2;
  return String(value).trim().length > 0;
}

async function resolveRequiredKeys(baseKeys) {
  const enabled = await ciap2Config.isEnabled();
  if (enabled) return baseKeys;
  return baseKeys.filter((k) => k !== 'ciap_codes');
}

async function computeInvalidFields(row, requiredKeys) {
  const keys = await resolveRequiredKeys(requiredKeys);
  const invalid = [];
  for (const key of keys) {
    if (!fieldPresent(row, key)) {
      invalid.push(key);
      continue;
    }
    if (key === 'account_password') {
      if (!validateField(key, row[key], { requirePasswordHash: true })) invalid.push(key);
      continue;
    }
    if (!validateField(key, row[key])) invalid.push(key);
  }
  return [...new Set(invalid)];
}

async function prepareCiapForSave(value) {
  const codes = normalizeCiap(value);
  if (!(await ciap2Config.isEnabled())) {
    return { ok: true, value: codes.length ? codes.join(';') : null };
  }
  if (!validateField('ciap_codes', codes)) return { ok: false };
  return { ok: true, value: codes.join(';') };
}

const ASSOCIADO_PATCHABLE = new Set(['prescription', 'preferred_products', 'date_prescription']);

function assertPhaseWritable(phase, maxPhase) {
  if (!phaseAtMost(phase, maxPhase)) {
    throw new AppError(403, 'PHASE_LOCKED', `Fase ${normalizePhase(phase)} não permite esta ação`);
  }
}

async function patchMe(associateRow, body) {
  const payload = body || {};
  const knownKeys = Object.keys(payload).filter(
    (k) => PATCHABLE.includes(k) && isKnownColumn('users', k)
  );
  if (!knownKeys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Nenhum campo conhecido no body');
  }

  const phase = normalizePhase(associateRow.associate_status);
  const onlyAssociadoFields = knownKeys.every((k) => ASSOCIADO_PATCHABLE.has(k));
  if (onlyAssociadoFields) {
    if (!isAssociateStatus(associateRow)) {
      throw new AppError(403, 'PHASE_LOCKED', 'Campos de consulta só após se tornar Associado');
    }
  } else {
    assertPhaseWritable(phase, PHASE.DADOS_PESSOAIS);
  }

  const savedFields = [];
  const attemptedInvalid = [];
  const updates = {};

  for (const key of knownKeys) {
    let value = payload[key];
    if (key === 'ciap_codes') {
      const prepared = await prepareCiapForSave(value);
      if (!prepared.ok) {
        attemptedInvalid.push(key);
        continue;
      }
      value = prepared.value;
    } else if (key === 'account_password') {
      if (!validateField(key, value)) {
        attemptedInvalid.push(key);
        continue;
      }
      value = await associateAuthRepository.hashPassword(value);
    } else if (!validateField(key, value)) {
      attemptedInvalid.push(key);
      continue;
    }
    updates[key] = value;
    savedFields.push(key);
  }

  const merged = { ...associateRow, ...updates };
  const invalidFields = await computeInvalidFields(
    merged,
    requiredResponsibleFields(merged.responsible_type)
  );

  const setParts = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(updates)) {
    setParts.push(`${k} = $${i++}`);
    params.push(v);
  }
  setParts.push(`invalid_fields = $${i++}`);
  params.push(JSON.stringify(invalidFields));
  setParts.push('date_updated = NOW()');

  if (
    phaseEquals(associateRow.associate_status, PHASE.CADASTRO_CRIADO)
    && invalidFields.length === 0
    && savedFields.length
  ) {
    setParts.push(`associate_status = $${i++}`);
    params.push(PHASE.DADOS_PESSOAIS);
  }

  params.push(associateRow.id);
  const result = await query(
    `UPDATE users SET ${setParts.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );

  const user = associateAuthRepository.publicAssociate(result.rows[0]);
  return {
    data: user,
    meta: {
      saved_fields: savedFields,
      invalid_fields: user.invalid_fields,
      rejected_fields: attemptedInvalid,
    },
  };
}

async function listMyPatients(associateRow) {
  const result = await query(
    `SELECT * FROM users WHERE responsible_code = $1 AND status = 'patient' ORDER BY id DESC`,
    [associateRow.user_code]
  );
  return result.rows.map((r) => associateAuthRepository.publicAssociate(r));
}

async function createMyPatient(associateRow, body) {
  assertPhaseWritable(associateRow.associate_status, PHASE.DADOS_PESSOAIS);
  if (!isPatientRegistration(associateRow.responsible_type)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Paciente só é permitido quando responsible_type=another ou pet'
    );
  }

  const payload = body || {};
  const updates = {};
  const savedFields = [];
  const attemptedInvalid = [];

  for (const key of PATCHABLE) {
    if (payload[key] === undefined) continue;
    if (key === 'account_password' || key === 'responsible_type') continue;
    let value = payload[key];
    if (key === 'ciap_codes') {
      const prepared = await prepareCiapForSave(value);
      if (!prepared.ok) {
        attemptedInvalid.push(key);
        continue;
      }
      value = prepared.value;
    } else if (!validateField(key, value)) {
      attemptedInvalid.push(key);
      continue;
    }
    updates[key] = value;
    savedFields.push(key);
  }

  const draft = { ...updates };
  const invalidFields = await computeInvalidFields(
    draft,
    requiredPatientFields(associateRow.responsible_type)
  );
  const userCode = uuidv4();

  const cols = [
    'status', 'responsible_type', 'responsible_code', 'user_code',
    'email_account', 'invalid_fields', 'date_created', 'created_date',
    ...Object.keys(updates),
  ];
  const vals = [
    'patient', 'patient', associateRow.user_code, userCode,
    associateRow.email_account, JSON.stringify(invalidFields), new Date(), new Date(),
    ...Object.values(updates),
  ];
  const placeholders = cols.map((_, idx) => `$${idx + 1}`);

  const result = await query(
    `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    vals
  );

  await query(
    `UPDATE users SET patient_user_code = $1, date_updated = NOW() WHERE id = $2`,
    [userCode, associateRow.id]
  );

  const user = associateAuthRepository.publicAssociate(result.rows[0]);
  return {
    data: user,
    meta: { saved_fields: savedFields, invalid_fields: user.invalid_fields, rejected_fields: attemptedInvalid },
  };
}

async function patchMyPatient(associateRow, patientId, body) {
  assertPhaseWritable(associateRow.associate_status, PHASE.DADOS_PESSOAIS);
  const result = await query(
    `SELECT * FROM users WHERE id = $1 AND responsible_code = $2 AND status = 'patient'`,
    [patientId, associateRow.user_code]
  );
  const patient = result.rows[0];
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Paciente não encontrado');

  const payload = body || {};
  const knownKeys = Object.keys(payload).filter(
    (k) => PATCHABLE.includes(k) && k !== 'account_password' && k !== 'responsible_type' && isKnownColumn('users', k)
  );
  if (!knownKeys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Nenhum campo conhecido no body');
  }

  const savedFields = [];
  const attemptedInvalid = [];
  const updates = {};

  for (const key of knownKeys) {
    let value = payload[key];
    if (key === 'ciap_codes') {
      const prepared = await prepareCiapForSave(value);
      if (!prepared.ok) {
        attemptedInvalid.push(key);
        continue;
      }
      value = prepared.value;
    } else if (!validateField(key, value)) {
      attemptedInvalid.push(key);
      continue;
    }
    updates[key] = value;
    savedFields.push(key);
  }

  const merged = { ...patient, ...updates };
  const invalidFields = await computeInvalidFields(
    merged,
    requiredPatientFields(associateRow.responsible_type)
  );

  const setParts = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(updates)) {
    setParts.push(`${k} = $${i++}`);
    params.push(v);
  }
  setParts.push(`invalid_fields = $${i++}`);
  params.push(JSON.stringify(invalidFields));
  setParts.push('date_updated = NOW()');
  params.push(patient.id);

  const updated = await query(
    `UPDATE users SET ${setParts.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );

  const user = associateAuthRepository.publicAssociate(updated.rows[0]);
  return {
    data: user,
    meta: { saved_fields: savedFields, invalid_fields: user.invalid_fields, rejected_fields: attemptedInvalid },
  };
}

async function getIdentityFiles(userId) {
  const result = await query(
    `SELECT uf.doc_type, uf.side, uf.subject, uf.doc_kind,
            f.id AS file_id, f.filename, f.mime_type, f.created_at
     FROM users_files uf
     JOIN files f ON f.id = uf.file_id
     WHERE uf.user_id = $1 AND (uf.doc_kind IS NULL OR uf.doc_kind = 'identity')
     ORDER BY f.created_at ASC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.file_id,
    filename: row.filename,
    mime_type: row.mime_type,
    created_at: row.created_at,
    doc_type: row.doc_type,
    side: row.side,
    subject: row.subject,
    doc_kind: row.doc_kind || 'identity',
    url: `/api/v1/files/${row.file_id}/download`,
  }));
}

function subjectComplete(files, subject) {
  const mine = files.filter((f) => f.subject === subject && (f.doc_kind === 'identity' || !f.doc_kind));
  const hasRgFront = mine.some((f) => f.doc_type === 'rg' && f.side === 'front');
  const hasRgBack = mine.some((f) => f.doc_type === 'rg' && f.side === 'back');
  const hasCnh = mine.some((f) => f.doc_type === 'cnh' && (f.side === 'front' || !f.side));
  if (hasCnh) {
    return {
      complete: true,
      mode: 'cnh',
      missing: [],
      files: mine.filter((f) => f.doc_type === 'cnh'),
    };
  }
  if (hasRgFront && hasRgBack) {
    return {
      complete: true,
      mode: 'rg',
      missing: [],
      files: mine.filter((f) => f.doc_type === 'rg'),
    };
  }
  const missing = [];
  if (!hasCnh && !(hasRgFront && hasRgBack)) {
    if (!hasRgFront) missing.push({ subject, doc_type: 'rg', side: 'front' });
    if (!hasRgBack) missing.push({ subject, doc_type: 'rg', side: 'back' });
    missing.push({ subject, doc_type: 'cnh', side: 'front' });
  }
  return { complete: false, mode: null, missing, files: mine };
}

async function documentsStatus(associateRow) {
  const files = await getIdentityFiles(associateRow.id);
  const responsible = subjectComplete(files, 'responsible');
  const result = {
    responsible,
    patient: null,
    complete: responsible.complete,
  };

  if (associateRow.responsible_type === 'another') {
    const patients = await listMyPatients(associateRow);
    if (!patients.length) {
      result.patient = { complete: false, mode: null, missing: [{ subject: 'patient', reason: 'no_patient' }], files: [] };
      result.complete = false;
    } else {
      const patientFiles = await getIdentityFiles(patients[0].id);
      result.patient = subjectComplete(patientFiles, 'patient');
      result.complete = responsible.complete && result.patient.complete;
    }
  }

  return result;
}

const EXTRA_DOC_KINDS = ['prescription', 'report', 'exam'];

async function extrasStatus(associateRow) {
  const result = await query(
    `SELECT uf.doc_kind, uf.doc_type, uf.side, uf.subject,
            f.id AS file_id, f.filename, f.mime_type, f.created_at
     FROM users_files uf
     JOIN files f ON f.id = uf.file_id
     WHERE uf.user_id = $1 AND uf.doc_kind = ANY($2::text[])
     ORDER BY f.created_at ASC`,
    [associateRow.id, EXTRA_DOC_KINDS]
  );

  const grouped = {
    prescription: [],
    report: [],
    exam: [],
  };

  for (const row of result.rows) {
    const kind = String(row.doc_kind || '');
    if (!grouped[kind]) continue;
    grouped[kind].push({
      id: row.file_id,
      filename: row.filename,
      mime_type: row.mime_type,
      created_at: row.created_at,
      doc_kind: kind,
      subject: row.subject || 'responsible',
      url: `/api/v1/files/${row.file_id}/download`,
    });
  }

  return grouped;
}

async function formComplete(row, required) {
  return (await computeInvalidFields(row, required)).length === 0;
}

async function advance(associateRow) {
  const phase = normalizePhase(associateRow.associate_status);

  if (phase === PHASE.CADASTRO_CRIADO) {
    const okForm = await formComplete(
      associateRow,
      requiredResponsibleFields(associateRow.responsible_type)
    );
    if (!okForm) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Formulário do responsável incompleto', {
        invalid_fields: await computeInvalidFields(
          associateRow,
          requiredResponsibleFields(associateRow.responsible_type)
        ),
      });
    }
    const result = await query(
      `UPDATE users SET associate_status = $2, date_updated = NOW() WHERE id = $1 RETURNING *`,
      [associateRow.id, PHASE.DADOS_PESSOAIS]
    );
    return associateAuthRepository.publicAssociate(result.rows[0]);
  }

  if (phase === PHASE.DADOS_PESSOAIS) {
    const okForm = await formComplete(
      associateRow,
      requiredResponsibleFields(associateRow.responsible_type)
    );
    if (!okForm) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Formulário do responsável incompleto');
    }
    if (isPatientRegistration(associateRow.responsible_type)) {
      const patients = await listMyPatients(associateRow);
      if (!patients.length) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Paciente obrigatório');
      }
      const patientRow = await associateAuthRepository.getById(patients[0].id);
      if (
        !(await formComplete(
          patientRow,
          requiredPatientFields(associateRow.responsible_type)
        ))
      ) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Formulário do paciente incompleto');
      }
    }
    const result = await query(
      `UPDATE users SET associate_status = $2, date_updated = NOW() WHERE id = $1 RETURNING *`,
      [associateRow.id, PHASE.DOCUMENTOS]
    );
    return associateAuthRepository.publicAssociate(result.rows[0]);
  }

  if (phase === PHASE.DOCUMENTOS) {
    const docs = await documentsStatus(associateRow);
    if (!docs.complete) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Documentos de identidade incompletos', { documents: docs });
    }
    const result = await query(
      `UPDATE users SET associate_status = $2, date_updated = NOW() WHERE id = $1 RETURNING *`,
      [associateRow.id, PHASE.ASSINATURA_TERMO]
    );
    return associateAuthRepository.publicAssociate(result.rows[0]);
  }

  if (phase === PHASE.ASSINATURA_TERMO) {
    if (associateRow.adhesion_term) {
      const result = await query(
        `UPDATE users SET status = 'Associado', date_updated = NOW() WHERE id = $1 RETURNING *`,
        [associateRow.id]
      );
      return associateAuthRepository.publicAssociate(result.rows[0]);
    }
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Assine o termo de adesão antes de se tornar Associado'
    );
  }

  throw new AppError(400, 'VALIDATION_ERROR', `Não é possível avançar a partir da fase ${phase}`);
}

async function complete(associateRow) {
  if (!isAssociateStatus(associateRow)) {
    throw new AppError(403, 'PHASE_LOCKED', 'Conclusão só é permitida após se tornar Associado');
  }
  const result = await query(
    `UPDATE users SET associate_status = $2, status = 'Associado', date_updated = NOW() WHERE id = $1 RETURNING *`,
    [associateRow.id, PHASE.CONCLUIDO]
  );
  return associateAuthRepository.publicAssociate(result.rows[0]);
}

async function usersExists(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email é obrigatório');
  }
  const user = await associateAuthRepository.findByEmailAccount(normalized);
  const state = associateAuthRepository.accountState(user);
  return { exists: state !== 'none', state };
}

module.exports = {
  patchMe,
  listMyPatients,
  createMyPatient,
  patchMyPatient,
  documentsStatus,
  extrasStatus,
  advance,
  complete,
  usersExists,
  REQUIRED_RESPONSIBLE,
  REQUIRED_PATIENT,
  computeInvalidFields,
};
