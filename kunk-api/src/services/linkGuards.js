'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

/**
 * Bloqueia exclusão quando há registros vinculados (409 HAS_LINKED_RECORDS).
 */

async function assertUserDeletable(user) {
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');
  const code = user.user_code;
  const id = user.id;
  const links = [];

  if (code) {
    const orders = await query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE user_code::text = $1 OR "user" = $2`,
      [String(code), id]
    );
    if (orders.rows[0]?.n > 0) links.push({ type: 'orders', count: orders.rows[0].n });

    const services = await query(
      `SELECT COUNT(*)::int AS n FROM services
       WHERE associate_user_code = $1 OR patient_user_code = $1`,
      [code]
    );
    if (services.rows[0]?.n > 0) links.push({ type: 'services', count: services.rows[0].n });

    const patients = await query(
      `SELECT COUNT(*)::int AS n FROM users WHERE responsible_code = $1`,
      [code]
    );
    if (patients.rows[0]?.n > 0) links.push({ type: 'patients', count: patients.rows[0].n });
  }

  if (links.length) {
    throw new AppError(409, 'HAS_LINKED_RECORDS', 'Não é possível excluir: há registros vinculados', {
      links,
    });
  }
}

async function assertProfessionalDeletable(pro) {
  if (!pro) throw new AppError(404, 'NOT_FOUND', 'Profissional não encontrado');
  const links = [];
  const code = pro.professional_code;
  const id = pro.id;

  if (code) {
    const services = await query(
      `SELECT COUNT(*)::int AS n FROM services WHERE professional_id = $1`,
      [code]
    );
    if (services.rows[0]?.n > 0) links.push({ type: 'services', count: services.rows[0].n });

    const orders = await query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE prescriber_code::text = $1`,
      [String(code)]
    );
    if (orders.rows[0]?.n > 0) links.push({ type: 'orders', count: orders.rows[0].n });
  }

  // Soft-delete (active=0) is allowed even with links; this guard is for hard delete only.
  if (links.length) {
    throw new AppError(409, 'HAS_LINKED_RECORDS', 'Não é possível excluir: há registros vinculados', {
      links,
      hint: 'Use soft-delete (active=0)',
      professional_id: id,
    });
  }
}

async function assertInstitutionalClientDeletable(client) {
  if (!client) throw new AppError(404, 'NOT_FOUND', 'Cliente institucional não encontrado');
  const links = [];
  const code = client.client_code;
  const id = client.id;

  const orders = await query(
    `SELECT COUNT(*)::int AS n FROM orders
     WHERE institutional_client_id = $1 OR institutional_client_code::text = $2`,
    [id, code ? String(code) : '']
  );
  if (orders.rows[0]?.n > 0) links.push({ type: 'orders', count: orders.rows[0].n });

  if (links.length) {
    throw new AppError(409, 'HAS_LINKED_RECORDS', 'Não é possível excluir: há registros vinculados', {
      links,
    });
  }
}

module.exports = {
  assertUserDeletable,
  assertProfessionalDeletable,
  assertInstitutionalClientDeletable,
};
