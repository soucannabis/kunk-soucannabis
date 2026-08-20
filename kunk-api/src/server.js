'use strict';

const { createApp } = require('./app');
const { env } = require('./config/env');
const { checkConnection } = require('./db/pool');
const systemErrorsService = require('./services/systemErrorsService');

function installProcessErrorHooks() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[kunk-api] unhandledRejection', err);
    void systemErrorsService.recordSafe({
      ...systemErrorsService.payloadFromBackendError(err),
      code: 'UNHANDLED_REJECTION',
      metadata: { hook: 'unhandledRejection' },
    });
  });

  process.on('uncaughtException', (err) => {
    console.error('[kunk-api] uncaughtException', err);
    void systemErrorsService.recordSafe({
      ...systemErrorsService.payloadFromBackendError(err),
      code: 'UNCAUGHT_EXCEPTION',
      metadata: { hook: 'uncaughtException' },
    });
  });
}

async function main() {
  if (!env.pgUrl) {
    console.error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) is required');
    process.exit(1);
  }

  try {
    await checkConnection();
    console.log('Database connected');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }

  try {
    const { ensureAssociateStatusColumn } = require('./db/ensureAssociateStatusColumn');
    const statusCol = await ensureAssociateStatusColumn();
    if (statusCol.migratedType) {
      console.log('Schema: users.associate_status migrado para VARCHAR (fases pt-BR)');
    } else if (statusCol.numericNormalized || statusCol.legacy5Updated) {
      console.log(
        `Schema: associate_status normalizado (num=${statusCol.numericNormalized}, legacy5=${statusCol.legacy5Updated})`
      );
    }
  } catch (err) {
    console.warn('Schema: não foi possível garantir associate_status VARCHAR:', err.message);
  }

  try {
    const { ensureSystemBackups } = require('./db/ensureSystemBackups');
    await ensureSystemBackups();
    console.log('Schema: system_backups / backup configs ok');
  } catch (err) {
    console.warn('Schema: não foi possível garantir system_backups:', err.message);
  }

  try {
    const { ensureOperatorSessions } = require('./db/ensureOperatorSessions');
    await ensureOperatorSessions();
    console.log('Schema: operator_sessions ok');
  } catch (err) {
    console.warn('Schema: não foi possível garantir operator_sessions:', err.message);
  }

  try {
    const { ensureUsersApiTokenPrefix } = require('./db/ensureUsersApiTokenPrefix');
    await ensureUsersApiTokenPrefix();
    console.log('Schema: users_api.token_prefix / scopes ok');
  } catch (err) {
    console.warn('Schema: não foi possível garantir users_api.token_prefix/scopes:', err.message);
  }

  try {
    const { ensureEmailAccountUnique } = require('./db/ensureEmailAccountUnique');
    await ensureEmailAccountUnique();
    console.log('Schema: users_email_account_login_uidx ok');
  } catch (err) {
    console.warn('Schema: não foi possível garantir users_email_account_login_uidx:', err.message);
  }

  try {
    const { ensureWebhooks } = require('./db/ensureWebhooks');
    await ensureWebhooks();
    console.log('Schema: webhook_endpoints / webhook_deliveries ok');
  } catch (err) {
    console.warn('Schema: não foi possível garantir webhooks:', err.message);
  }

  try {
    const docSignService = require('./services/docSignService');
    const ensured = await docSignService.ensureDefaultTemplates();
    if (ensured.created?.length) {
      console.log(`Doc-sign: modelos padrão criados (${ensured.created.join(', ')})`);
    }
    if (ensured.published?.length) {
      console.log(`Doc-sign: modelos publicados (${ensured.published.join(', ')})`);
    }
  } catch (err) {
    console.warn('Doc-sign: não foi possível garantir modelos padrão:', err.message);
  }

  installProcessErrorHooks();

  const app = createApp();
  const host = process.env.HOST || '0.0.0.0';
  app.listen(env.port, host, () => {
    console.log(`kunk-api listening on http://${host}:${env.port}/api/v1`);
    void require('./services/backupCron')
      .rescheduleBackupCron()
      .catch((err) => console.warn('[backup-cron] init falhou:', err.message));
    try {
      require('./services/webhooks').startWebhookWorker();
    } catch (err) {
      console.warn('[webhooks] worker init falhou:', err.message);
    }
  });
}

main();
