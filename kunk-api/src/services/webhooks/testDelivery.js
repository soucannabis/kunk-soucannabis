'use strict';

const { AppError } = require('../../utils/response');
const { query } = require('../../db/pool');
const repository = require('./repository');
const { dispatchDelivery } = require('./dispatch');
const { assertPublicHttpUrl } = require('../../utils/publicHttpUrl');

/**
 * Enfileira um ping e dispara na hora, retornando sucesso/erro legível para o Admin.
 */
async function runTestDelivery(endpointId) {
  const id = Number(endpointId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ID do webhook inválido');
  }

  const endpoint = await repository.getEndpoint(id);
  if (!endpoint) {
    throw new AppError(404, 'NOT_FOUND', 'Webhook não encontrado');
  }
  if (!endpoint.enabled) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Webhook está pausado. Ative-o antes de testar.'
    );
  }
  if (!String(endpoint.url || '').trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Webhook sem URL configurada.');
  }

  await assertPublicHttpUrl(endpoint.url);

  const delivery = await repository.enqueueTestDelivery(id);
  await query(`UPDATE webhook_deliveries SET status = 'processing' WHERE id = $1`, [delivery.id]);

  const resolved = await repository.getEndpointSecret(id);
  if (!resolved?.secret) {
    const updated = await repository.markRetryOrDead(delivery.id, {
      httpStatus: null,
      error: 'Secret do webhook indisponível',
      attempts: delivery.attempts,
      maxAttempts: 1,
    });
    throw new AppError(
      500,
      'CONFIG_ERROR',
      'Não foi possível ler o secret do webhook para assinar o teste.',
      { delivery: updated }
    );
  }

  const result = await dispatchDelivery(
    { ...delivery, status: 'processing' },
    { url: resolved.url, secret: resolved.secret }
  );

  if (result.ok) {
    const updated = await repository.markDelivered(delivery.id, result.status);
    return {
      ok: true,
      message: `Teste entregue com sucesso (HTTP ${result.status}).`,
      delivery: updated,
    };
  }

  const detail =
    result.status != null ? `HTTP ${result.status}` : String(result.error || '').trim() || 'sem resposta do destino';
  const updated = await repository.markRetryOrDead(delivery.id, {
    httpStatus: result.status,
    error: detail,
    attempts: delivery.attempts,
    maxAttempts: 1,
  });

  const httpPart = result.status != null ? `HTTP ${result.status}` : 'sem resposta HTTP';
  throw new AppError(502, 'WEBHOOK_TEST_FAILED', `Teste falhou (${httpPart}): ${detail}`, {
    delivery: updated,
    http_status: result.status,
  });
}

module.exports = { runTestDelivery };
