'use strict';

const client = require('./client');
const { AppError } = require('../../utils/response');

/**
 * Probe PSP: listar recipients. Contas Gateway tipicamente não expõem essa API.
 */
async function probePsp(credsOverride = null) {
  try {
    await client.request('/recipients?page=1&size=1', { credsOverride });
    return { is_psp: true, checked_at: new Date().toISOString() };
  } catch (err) {
    const status = err.details?.status || err.status;
    const msg = String(err.message || '');
    const notPsp =
      status === 403 ||
      status === 404 ||
      /gateway/i.test(msg) ||
      /not.?allowed/i.test(msg) ||
      /psp/i.test(msg) ||
      err.code === 'PAGARME_AUTH';
    if (notPsp || err.code === 'PAGARME_ERROR') {
      throw new AppError(
        400,
        'PAGARME_NOT_PSP',
        'A conta Pagar.me desta instalação não parece ser PSP (necessário para split / Pedidos SouCannabis)',
        { cause: msg, status }
      );
    }
    throw err;
  }
}

module.exports = { probePsp };
