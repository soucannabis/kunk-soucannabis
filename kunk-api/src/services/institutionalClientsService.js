'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const itemsRepository = require('../repositories/itemsRepository');
const { AppError } = require('../utils/response');
const { stripSensitive } = require('../schema/collections');
const { assertInstitutionalClientDeletable } = require('./linkGuards');
const {
  hasStreetAddress,
  deliveryAddressFromUser,
  cadastralAddressFromUser,
} = require('./orderAddressTracking');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
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

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(cnpj[i]) * weights1[i];
  let d1 = sum % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  if (d1 !== Number(cnpj[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(cnpj[i]) * weights2[i];
  let d2 = sum % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  return d2 === Number(cnpj[13]);
}

function isValidCep(value) {
  return onlyDigits(value).length === 8;
}

function isValidPhoneBr(value) {
  const digits = onlyDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

function isCompanyFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function displayName(client) {
  if (!client) return null;
  if (isCompanyFlag(client.is_company)) {
    return String(client.company_name || '').trim() || null;
  }
  return (
    `${client.representative_name || ''} ${client.representative_last_name || ''}`.trim() || null
  );
}

function receiverName(client) {
  if (!client) return null;
  return (
    `${client.representative_name || ''} ${client.representative_last_name || ''}`.trim() ||
    String(client.representative_name || '').trim() ||
    null
  );
}

function shippingDocument(client) {
  if (!client) return '';
  if (isCompanyFlag(client.is_company)) return onlyDigits(client.company_cnpj);
  return onlyDigits(client.representative_cpf);
}

function shippingPhone(client) {
  if (!client) return '';
  if (isCompanyFlag(client.is_company)) {
    return onlyDigits(client.company_phone || client.representative_mobile);
  }
  return onlyDigits(client.representative_mobile);
}

function shippingEmail(client) {
  if (!client) return '';
  if (isCompanyFlag(client.is_company)) {
    return String(client.company_email || client.representative_email || '').trim();
  }
  return String(client.representative_email || '').trim();
}

function deliveryAddressFromClient(client) {
  if (!client) return null;
  return deliveryAddressFromUser(client) || cadastralAddressFromUser(client);
}

function normalizePayload(payload = {}, { partial = false } = {}) {
  const body = { ...payload };
  delete body.id;
  delete body.client_code;

  if (body.is_company !== undefined) {
    body.is_company = isCompanyFlag(body.is_company);
  }

  if (body.representative_cpf !== undefined) {
    body.representative_cpf = onlyDigits(body.representative_cpf) || null;
  }
  if (body.company_cnpj !== undefined) {
    body.company_cnpj = onlyDigits(body.company_cnpj) || null;
  }
  if (body.cep !== undefined) {
    body.cep = onlyDigits(body.cep) || null;
  }
  if (body.representative_mobile !== undefined) {
    body.representative_mobile = onlyDigits(body.representative_mobile) || null;
  }
  if (body.company_phone !== undefined) {
    body.company_phone = onlyDigits(body.company_phone) || null;
  }
  if (body.representative_email !== undefined) {
    body.representative_email = String(body.representative_email || '')
      .trim()
      .toLowerCase() || null;
  }
  if (body.company_email !== undefined) {
    body.company_email = String(body.company_email || '')
      .trim()
      .toLowerCase() || null;
  }
  // annotations: JSONB — keep array/object; stringify only if already string content needed by caller

  if (body.is_company === false) {
    body.company_name = null;
    body.company_trade_name = null;
    body.company_cnpj = null;
    body.company_email = null;
    body.company_phone = null;
  }

  if (!partial) {
    if (body.is_company === undefined) body.is_company = false;
    if (body.status === undefined) body.status = 'active';
  }

  return body;
}

function validateClientFields(body, { existing = null, partial = false } = {}) {
  const merged = { ...(existing || {}), ...body };
  const company = isCompanyFlag(merged.is_company);

  if (!partial || body.representative_name !== undefined) {
    if (!String(merged.representative_name || '').trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Nome do representante é obrigatório');
    }
  }
  if (!partial || body.representative_cpf !== undefined) {
    if (!isValidCpf(merged.representative_cpf)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'CPF do representante inválido');
    }
  }
  if (!partial || body.representative_mobile !== undefined || body.company_phone !== undefined) {
    const phone = company
      ? merged.company_phone || merged.representative_mobile
      : merged.representative_mobile;
    if (!isValidPhoneBr(phone)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Telefone do destinatário é obrigatório (mín. 10 dígitos)'
      );
    }
  }
  if (!partial || body.representative_email !== undefined || body.company_email !== undefined) {
    const email = company
      ? merged.company_email || merged.representative_email
      : merged.representative_email;
    if (!email || !String(email).includes('@')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'E-mail de contato é obrigatório');
    }
  }

  const street = merged.street || merged.delivery_address?.street;
  const cep = merged.cep || merged.delivery_address?.cep;
  if (!partial || body.street !== undefined || body.cep !== undefined || body.delivery_address !== undefined) {
    if (!String(street || '').trim() || !isValidCep(cep)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Endereço incompleto: rua e CEP (8 dígitos) são obrigatórios'
      );
    }
  }

  if (company) {
    if (!partial || body.company_name !== undefined) {
      if (!String(merged.company_name || '').trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Razão social da empresa é obrigatória');
      }
    }
    if (!partial || body.company_cnpj !== undefined) {
      if (!isValidCnpj(merged.company_cnpj)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'CNPJ da empresa inválido');
      }
    }
  }
}

async function list(queryParams = {}, { scopeFilter } = {}) {
  return itemsRepository.listItems('institutional_clients', queryParams, { scopeFilter });
}

async function search(q) {
  if (!q || String(q).trim().length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'q deve ter ao menos 2 caracteres');
  }
  const term = `%${String(q).trim()}%`;
  const digits = onlyDigits(q);
  const digitTerm = digits.length >= 2 ? `%${digits}%` : null;
  const result = await query(
    `SELECT *
     FROM institutional_clients
     WHERE company_name ILIKE $1
        OR company_trade_name ILIKE $1
        OR representative_name ILIKE $1
        OR representative_last_name ILIKE $1
        OR representative_email ILIKE $1
        OR company_email ILIKE $1
        OR ($2::text IS NOT NULL AND (
              company_cnpj ILIKE $2
           OR representative_cpf ILIKE $2
           OR representative_mobile ILIKE $2
           OR company_phone ILIKE $2
        ))
     ORDER BY id DESC
     LIMIT 50`,
    [term, digitTerm]
  );
  return result.rows.map((r) => ({
    ...stripSensitive('institutional_clients', r),
    display_name: displayName(r),
  }));
}

async function getByCode(clientCode) {
  const result = await query(
    `SELECT * FROM institutional_clients WHERE client_code::text = $1 LIMIT 1`,
    [clientCode]
  );
  if (!result.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Cliente institucional não encontrado');
  const row = stripSensitive('institutional_clients', result.rows[0]);
  return { ...row, display_name: displayName(row) };
}

async function getById(id) {
  const row = await itemsRepository.getItem('institutional_clients', id);
  return { ...row, display_name: displayName(row) };
}

async function loadClientForOrder(payload) {
  if (payload?.institutional_client_id) {
    const byId = await query(
      `SELECT * FROM institutional_clients WHERE id = $1 LIMIT 1`,
      [payload.institutional_client_id]
    );
    if (byId.rows[0]) return byId.rows[0];
  }
  const code = payload?.institutional_client_code || payload?.client_code;
  if (code) {
    const byCode = await query(
      `SELECT * FROM institutional_clients WHERE client_code::text = $1 LIMIT 1`,
      [String(code)]
    );
    if (byCode.rows[0]) return byCode.rows[0];
  }
  return null;
}

async function create(payload = {}) {
  const body = normalizePayload(payload, { partial: false });
  validateClientFields(body, { partial: false });
  const now = new Date().toISOString();
  return itemsRepository.createItem('institutional_clients', {
    ...body,
    client_code: payload.client_code || uuidv4(),
    date_created: now,
    date_updated: now,
    status: body.status || 'active',
  });
}

async function update(id, payload = {}) {
  const existing = await itemsRepository.getItem('institutional_clients', id);
  const body = normalizePayload(payload, { partial: true });
  validateClientFields(body, { existing, partial: true });
  return itemsRepository.updateItem('institutional_clients', id, {
    ...body,
    date_updated: new Date().toISOString(),
  });
}

async function remove(id) {
  const client = await itemsRepository.getItem('institutional_clients', id);
  await assertInstitutionalClientDeletable(client);
  return itemsRepository.deleteItem('institutional_clients', id);
}

async function getHistory(id) {
  const client = await itemsRepository.getItem('institutional_clients', id);
  const code = client.client_code;
  const orders = await query(
    `SELECT id, order_code, status, associate_name, receiver_name, total, discount, donation,
            items, tags, created_date, date_created, tracking_code, institutional_client_id,
            institutional_client_code
     FROM orders
     WHERE institutional_client_id = $1 OR institutional_client_code::text = $2
     ORDER BY COALESCE(created_date, date_created) DESC NULLS LAST
     LIMIT 100`,
    [client.id, String(code)]
  );
  return { orders: orders.rows };
}

module.exports = {
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  isCompanyFlag,
  displayName,
  receiverName,
  shippingDocument,
  shippingPhone,
  shippingEmail,
  deliveryAddressFromClient,
  hasStreetAddress,
  normalizePayload,
  validateClientFields,
  list,
  search,
  getByCode,
  getById,
  loadClientForOrder,
  create,
  update,
  remove,
  getHistory,
};
