'use strict';

const WEBHOOK_TABLES = ['users', 'orders', 'services', 'reception'];

const WEBHOOK_ACTIONS = ['create', 'update', 'delete'];

const WEBHOOK_TABLE_LABELS = {
  users: 'Associados',
  orders: 'Pedidos',
  services: 'Atendimentos',
  reception: 'Triagem',
};

const WEBHOOK_ACTION_LABELS = {
  create: 'Criar',
  update: 'Atualizar',
  delete: 'Excluir',
};

const DEFAULT_MAX_ATTEMPTS = 8;
const DELIVERY_TIMEOUT_MS = 15000;
const WORKER_CRON = '*/15 * * * * *';

function isWebhookTable(name) {
  return WEBHOOK_TABLES.includes(String(name || ''));
}

function isWebhookAction(name) {
  return WEBHOOK_ACTIONS.includes(String(name || ''));
}

module.exports = {
  WEBHOOK_TABLES,
  WEBHOOK_ACTIONS,
  WEBHOOK_TABLE_LABELS,
  WEBHOOK_ACTION_LABELS,
  DEFAULT_MAX_ATTEMPTS,
  DELIVERY_TIMEOUT_MS,
  WORKER_CRON,
  isWebhookTable,
  isWebhookAction,
};
