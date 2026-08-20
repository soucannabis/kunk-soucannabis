'use strict';

const cron = require('node-cron');
const { resolveStorageConfig } = require('../storage/resolveConfig');
const backupService = require('./backupService');

let currentTask = null;

function stopBackupCron() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
}

async function rescheduleBackupCron() {
  stopBackupCron();

  let cfg;
  try {
    cfg = await resolveStorageConfig();
  } catch (err) {
    console.warn('[backup-cron] não foi possível ler config:', err.message);
    return { scheduled: false, reason: err.message };
  }

  const isCloud = cfg.driver === 's3' || cfg.driver === 'gcs';
  if (!isCloud || !cfg.locked || !cfg.backup?.enabled) {
    return { scheduled: false, reason: 'backup_disabled' };
  }

  const parsed = backupService.parseScheduleTime(cfg.backup.scheduleTime);
  if (!parsed) {
    console.warn('[backup-cron] schedule_time inválido:', cfg.backup.scheduleTime);
    return { scheduled: false, reason: 'invalid_schedule' };
  }

  const timezone = cfg.backup.timezone || 'America/Sao_Paulo';
  const expression = `${parsed.minute} ${parsed.hour} * * *`;

  if (!cron.validate(expression)) {
    console.warn('[backup-cron] expressão inválida:', expression);
    return { scheduled: false, reason: 'invalid_expression' };
  }

  currentTask = cron.schedule(
    expression,
    () => {
      void backupService
        .runBackup({ triggered_by: 'cron' })
        .then((row) => {
          console.log(`[backup-cron] backup ok id=${row.id}`);
        })
        .catch((err) => {
          console.error('[backup-cron] falhou:', err.message || err);
        });
    },
    { timezone }
  );

  console.log(
    `[backup-cron] agendado diário às ${cfg.backup.scheduleTime} (${timezone})`
  );
  return {
    scheduled: true,
    expression,
    timezone,
    schedule_time: cfg.backup.scheduleTime,
  };
}

module.exports = {
  rescheduleBackupCron,
  stopBackupCron,
};
