'use strict';

const cron = require('node-cron');
const { WORKER_CRON } = require('./catalog');
const repository = require('./repository');
const { dispatchDelivery } = require('./dispatch');

let currentTask = null;
let running = false;

async function processOnce(limit = 20) {
  if (running) return { skipped: true };
  running = true;
  try {
    const due = await repository.claimDueDeliveries(limit);
    let delivered = 0;
    let failed = 0;
    let dead = 0;

    for (const delivery of due) {
      const resolved = await repository.getEndpointSecret(delivery.endpoint_id);
      if (!resolved) {
        await repository.markRetryOrDead(delivery.id, {
          httpStatus: null,
          error: 'endpoint missing',
          attempts: delivery.attempts,
          maxAttempts: delivery.max_attempts,
        });
        dead += 1;
        continue;
      }

      const result = await dispatchDelivery(delivery, {
        url: resolved.url,
        secret: resolved.secret,
      });

      if (result.ok) {
        await repository.markDelivered(delivery.id, result.status);
        delivered += 1;
      } else {
        const updated = await repository.markRetryOrDead(delivery.id, {
          httpStatus: result.status,
          error: result.error || (result.status != null ? `HTTP ${result.status}` : 'falha'),
          attempts: delivery.attempts,
          maxAttempts: delivery.max_attempts,
        });
        if (updated?.status === 'dead') dead += 1;
        else failed += 1;
      }
    }

    return { claimed: due.length, delivered, failed, dead };
  } finally {
    running = false;
  }
}

function startWebhookWorker() {
  stopWebhookWorker();
  if (!cron.validate(WORKER_CRON)) {
    console.warn('[webhooks] cron inválido:', WORKER_CRON);
    return { scheduled: false };
  }
  currentTask = cron.schedule(WORKER_CRON, () => {
    void processOnce().catch((err) => {
      console.error('[webhooks] worker falhou:', err.message || err);
    });
  });
  console.log('[webhooks] worker agendado:', WORKER_CRON);
  return { scheduled: true, expression: WORKER_CRON };
}

function stopWebhookWorker() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
}

module.exports = {
  processOnce,
  startWebhookWorker,
  stopWebhookWorker,
};
