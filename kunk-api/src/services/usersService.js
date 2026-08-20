'use strict';

const { query } = require('../db/pool');
const itemsRepository = require('../repositories/itemsRepository');
const { AppError } = require('../utils/response');
const { stripSensitive } = require('../schema/collections');
const { parseInclude, truthyParam, hydrateIncludes, hydratePatients } = require('./includeService');
const { assertUserDeletable } = require('./linkGuards');
const associateAuthRepository = require('../repositories/associateAuthRepository');
const { v4: uuidv4 } = require('uuid');
const { PHASE } = require('../constants/associatePhases');
const { parseFilterQuery } = require('../query/parseFilter');

/** Busca painel: nome, sobrenome, nome completo, e-mail, CPF, telefone (parcial/completo). */
function buildUsersSearchFilter(rawSearch) {
  const term = String(rawSearch || '').trim();
  if (!term) return null;

  const digits = term.replace(/\D/g, '');
  const parts = [
    { associate_name: { _icontains: term } },
    { associate_last_name: { _icontains: term } },
    { email_account: { _icontains: term } },
    { associate_cpf: { _icontains: term } },
    { mobile_number: { _icontains: term } },
    { fullname: { _icontains: term } },
  ];

  if (digits.length >= 3) {
    parts.push({ mobile_number: { _icontains: digits } });
    if (digits.startsWith('55') && digits.length >= 12) {
      parts.push({ mobile_number: { _icontains: digits.slice(2) } });
    }
  }

  const words = term.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0];
    const rest = words.slice(1).join(' ');
    parts.push({
      _and: [
        { associate_name: { _icontains: first } },
        { associate_last_name: { _icontains: rest } },
      ],
    });
    parts.push({
      _and: [
        { associate_name: { _icontains: words.slice(0, -1).join(' ') } },
        { associate_last_name: { _icontains: words[words.length - 1] } },
      ],
    });
  }

  return { _or: parts };
}

function mergeFilter(base, extra) {
  if (!base) return extra || null;
  if (!extra) return base;
  return { _and: [base, extra] };
}

async function list(queryParams = {}, { scopeFilter } = {}) {
  const includeKeys = parseInclude('users', queryParams.include);
  const withPatients = truthyParam(queryParams.patients);

  const qp = { ...queryParams };
  const searchTerm = qp.search != null ? String(qp.search).trim() : '';
  delete qp.search;

  if (searchTerm) {
    const searchFilter = buildUsersSearchFilter(searchTerm);
    const existing = parseFilterQuery(qp.filter);
    qp.filter = mergeFilter(existing, searchFilter);
  }

  const result = await itemsRepository.listItems('users', qp, { scopeFilter });
  if (includeKeys.length) {
    await hydrateIncludes('users', result.data, includeKeys);
  }
  if (withPatients) {
    await hydratePatients(result.data);
  }
  return result;
}

async function searchUsers(q) {
  if (!q || String(q).trim().length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'q deve ter ao menos 2 caracteres');
  }
  const term = String(q).trim();
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, '');
  const params = [like];
  let phoneClause = '';
  if (digits.length >= 3) {
    params.push(`%${digits}%`);
    phoneClause = ` OR regexp_replace(COALESCE(mobile_number, ''), '\\D', '', 'g') LIKE $${params.length}`;
  }

  const result = await query(
    `SELECT id, user_code, associate_name, associate_last_name, email_account, associate_cpf,
            mobile_number, status, associate_status, patient_user_code, fullname, adhesion_term,
            TRIM(CONCAT(COALESCE(associate_name, ''), ' ', COALESCE(associate_last_name, ''))) AS full_name
     FROM users
     WHERE associate_name ILIKE $1
        OR associate_last_name ILIKE $1
        OR email_account ILIKE $1
        OR associate_cpf ILIKE $1
        OR mobile_number ILIKE $1
        OR fullname ILIKE $1
        OR TRIM(CONCAT(COALESCE(associate_name, ''), ' ', COALESCE(associate_last_name, ''))) ILIKE $1
        ${phoneClause}
     ORDER BY id DESC
     LIMIT 50`,
    params
  );
  return result.rows.map((r) => ({
    ...stripSensitive('users', r),
    full_name: (r.fullname || r.full_name || '').trim() || null,
  }));
}

async function getByCode(userCode, queryParams = {}) {
  const result = await query(`SELECT * FROM users WHERE user_code::text = $1 LIMIT 1`, [userCode]);
  if (!result.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');
  const row = stripSensitive('users', result.rows[0]);
  const rows = [row];
  const includeKeys = parseInclude('users', queryParams.include);
  if (includeKeys.length) {
    await hydrateIncludes('users', rows, includeKeys);
  }
  if (truthyParam(queryParams.patients)) {
    await hydratePatients(rows);
  }
  return rows[0];
}

async function getById(id, queryParams = {}) {
  const row = await itemsRepository.getItem('users', id, queryParams);
  const rows = [row];
  if (truthyParam(queryParams.patients)) {
    await hydratePatients(rows);
  }
  return rows[0];
}

/**
 * Painel: criar associado só com e-mail (sem senha do funil).
 * Respeita ACCOUNT_EXISTS / ACCOUNT_IN_PROGRESS.
 */
async function createUserFromPanel(payload = {}) {
  const email = await associateAuthRepository.assertLoginEmailAvailable(
    payload.email_account || payload.email
  );

  const now = new Date().toISOString();
  return itemsRepository.createItem('users', {
    email_account: email,
    associate_status: PHASE.CADASTRO_CRIADO,
    status: payload.status != null && payload.status !== '' && payload.status !== 'published'
      ? payload.status
      : PHASE.CADASTRO_CRIADO,
    user_code: payload.user_code || uuidv4(),
    date_created: now,
    created_date: now,
    associate_name: payload.associate_name || null,
    associate_last_name: payload.associate_last_name || null,
  });
}

async function createUser(payload) {
  if (payload?.panel === true || (payload?.email_account && !payload?.account_password && !payload?.status?.includes?.('patient'))) {
    const { panel, ...rest } = payload;
    if (!payload.responsible_code && !payload.account_password) {
      return createUserFromPanel(rest);
    }
  }
  const body = {
    ...payload,
    user_code: payload.user_code || uuidv4(),
    date_created: payload.date_created || new Date().toISOString(),
  };
  if (body.email && !body.email_account) {
    body.email_account = String(body.email).trim().toLowerCase();
  }
  delete body.panel;
  delete body.email;
  const isPatient = String(body.status || '') === 'patient';
  if (body.email_account && !isPatient) {
    body.email_account = await associateAuthRepository.assertLoginEmailAvailable(body.email_account);
  }
  return itemsRepository.createItem('users', body);
}

/** Campos que o PATCH de painel (`/users/:id`) e de paciente podem gravar. */
const PANEL_PATCHABLE = new Set([
  'responsible_type',
  'associate_name',
  'associate_last_name',
  'associate_birth_date',
  'gender',
  'nationality',
  'associate_cpf',
  'associate_rg',
  'associate_rg_issuer',
  'marital_status',
  'mobile_number',
  'street',
  'street_number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'cep',
  'reason_treatment_text',
  'ciap_codes',
  'prescription',
  'preferred_products',
  'date_prescription',
  'fullname',
  'proof_of_address',
  'rg_proof',
  'rg_patient_proof',
  'annotations',
  'email_account',
  'avatar_url',
  'delivery_address',
  'prescriber',
  'prescriber_code',
]);

function pickAllowedUserPatch(payload = {}) {
  const src = { ...payload };
  if (src.email && !src.email_account) {
    src.email_account = String(src.email).trim().toLowerCase();
  }
  const body = {};
  for (const key of PANEL_PATCHABLE) {
    if (src[key] !== undefined) body[key] = src[key];
  }
  if (body.annotations != null && typeof body.annotations !== 'string') {
    body.annotations = JSON.stringify(body.annotations);
  }
  return body;
}

async function updateUser(id, payload = {}) {
  const body = pickAllowedUserPatch(payload);
  if (!Object.keys(body).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payload vazio');
  }

  if (body.email_account != null && String(body.email_account).trim() !== '') {
    body.email_account = await associateAuthRepository.assertLoginEmailAvailable(
      body.email_account,
      { excludeId: id }
    );
  }

  return itemsRepository.updateItem('users', id, body);
}

async function makeAssociate(id) {
  return itemsRepository.updateItem(
    'users',
    id,
    { status: 'Associado', associate_status: PHASE.ASSINATURA_TERMO },
    { skipReadonly: ['status', 'associate_status'] }
  );
}

async function getPatients(id) {
  const user = await itemsRepository.getItem('users', id);
  const code = user.user_code;
  const result = await query(
    `SELECT * FROM users WHERE responsible_code = $1 ORDER BY id DESC`,
    [code]
  );
  return result.rows.map((r) => stripSensitive('users', r));
}

async function createPatient(responsibleId, payload = {}) {
  const responsible = await itemsRepository.getItem('users', responsibleId);
  if (String(responsible.status) === 'patient') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Pacientes não podem ter pacientes');
  }
  const now = new Date().toISOString();
  const body = {
    ...payload,
    status: 'patient',
    responsible_type: payload.responsible_type || 'patient',
    responsible_code: responsible.user_code,
    user_code: payload.user_code || uuidv4(),
    date_created: now,
    created_date: now,
    email_account: payload.email_account || responsible.email_account || null,
    mobile_number: payload.mobile_number || responsible.mobile_number || null,
    street: payload.street ?? responsible.street ?? null,
    street_number: payload.street_number ?? responsible.street_number ?? null,
    complement: payload.complement ?? responsible.complement ?? null,
    neighborhood: payload.neighborhood ?? responsible.neighborhood ?? null,
    city: payload.city ?? responsible.city ?? null,
    state: payload.state ?? responsible.state ?? null,
    cep: payload.cep ?? responsible.cep ?? null,
  };
  delete body.id;
  delete body.account_password;
  delete body.email;
  delete body.use_custom_contact;
  delete body.use_custom_address;
  delete body.use_delivery;
  return itemsRepository.createItem('users', body);
}

async function updatePatient(responsibleId, patientId, payload = {}) {
  const responsible = await itemsRepository.getItem('users', responsibleId);
  const patient = await itemsRepository.getItem('users', patientId);
  if (String(patient.responsible_code) !== String(responsible.user_code)) {
    throw new AppError(404, 'NOT_FOUND', 'Paciente não pertence a este responsável');
  }
  const body = pickAllowedUserPatch(payload);
  if (!Object.keys(body).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payload vazio');
  }
  return itemsRepository.updateItem('users', patientId, body);
}

async function deletePatient(responsibleId, patientId) {
  const responsible = await itemsRepository.getItem('users', responsibleId);
  const patient = await itemsRepository.getItem('users', patientId);
  if (String(patient.responsible_code) !== String(responsible.user_code)) {
    throw new AppError(404, 'NOT_FOUND', 'Paciente não pertence a este responsável');
  }
  await assertUserDeletable(patient);
  await detachUserFiles(patientId);
  return itemsRepository.deleteItem('users', patientId);
}

async function getHistory(id) {
  const user = await itemsRepository.getItem('users', id);
  const code = user.user_code;
  const [orders, services] = await Promise.all([
    query(
      `SELECT id, order_code, status, associate_name, total, discount, donation, items, tags,
              created_date, date_created, tracking_code, prescriber,
              freight_carrier, freight_option, carrier_order_code
       FROM orders
       WHERE user_code::text = $1 OR "user" = $2
       ORDER BY COALESCE(created_date, date_created) DESC NULLS LAST
       LIMIT 100`,
      [String(code), user.id]
    ),
    query(
      `SELECT id, service_code, booking_group_code, status, associate_name, patient_name,
              patient_user_code, professional_name, price, donation, price_paid, tags,
              consultation_date AS date, consultation_date, date_created
       FROM services
       WHERE associate_user_code = $1 OR patient_user_code = $1
       ORDER BY COALESCE(consultation_date, date_created) DESC NULLS LAST
       LIMIT 100`,
      [code]
    ),
  ]);
  return {
    orders: orders.rows,
    services: services.rows,
  };
}

async function detachUserFiles(userId) {
  const linked = await query(`SELECT file_id FROM users_files WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM users_files WHERE user_id = $1`, [userId]);

  const filesRepository = require('../repositories/filesRepository');
  for (const row of linked.rows) {
    if (!row.file_id) continue;
    try {
      await filesRepository.deleteFile(row.file_id);
    } catch {
      /* arquivo ainda referenciado por pedidos/contratos/etc. */
    }
  }
}

async function deleteUser(id) {
  const user = await itemsRepository.getItem('users', id);
  await assertUserDeletable(user);

  // adhesion_term aponta para contrato; limpa antes do CASCADE dos termos.
  await query(
    `UPDATE users SET adhesion_term = NULL, session_token = NULL, is_session_active = false,
                        date_updated = NOW()
     WHERE id = $1`,
    [id]
  );

  // users_files não tem ON DELETE CASCADE — bloqueava a exclusão com 23503.
  await detachUserFiles(id);

  return itemsRepository.deleteItem('users', id);
}

async function updateHandbook(id, handbook) {
  return itemsRepository.updateItem('users', id, { handbook });
}

module.exports = {
  list,
  searchUsers,
  getByCode,
  getById,
  createUser,
  createUserFromPanel,
  updateUser,
  makeAssociate,
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
  getHistory,
  deleteUser,
  updateHandbook,
};
