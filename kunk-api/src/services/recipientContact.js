'use strict';

const { query } = require('../db/pool');
const institutional = require('./institutionalClientsService');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function pickUserContact(u) {
  return {
    phone: onlyDigits(u.mobile_number),
    email: u.email_account || '',
    document: onlyDigits(u.associate_cpf || u.cpf),
    name: `${u.associate_name || ''} ${u.associate_last_name || ''}`.trim(),
  };
}

/**
 * Contato do destinatário para etiqueta: associado (users) ou cliente institucional.
 */
async function loadRecipientContact(order) {
  if (!order) return { phone: '', email: '', document: '', name: '' };

  if (order.institutional_client_id || order.institutional_client_code) {
    const client = await institutional.loadClientForOrder(order);
    if (client) {
      return {
        phone: institutional.shippingPhone(client),
        email: institutional.shippingEmail(client),
        document: institutional.shippingDocument(client),
        name: institutional.displayName(client) || institutional.receiverName(client) || '',
      };
    }
  }

  if (order.user) {
    const byId = await query(
      `SELECT mobile_number, email_account, associate_name, associate_last_name, associate_cpf
       FROM users WHERE id = $1 LIMIT 1`,
      [order.user]
    );
    if (byId.rows[0]) return pickUserContact(byId.rows[0]);
  }
  if (order.user_code) {
    const byCode = await query(
      `SELECT mobile_number, email_account, associate_name, associate_last_name, associate_cpf
       FROM users WHERE user_code = $1 LIMIT 1`,
      [order.user_code]
    );
    if (byCode.rows[0]) return pickUserContact(byCode.rows[0]);
  }
  return { phone: '', email: '', document: '', name: '' };
}

module.exports = {
  loadRecipientContact,
  onlyDigits,
};
