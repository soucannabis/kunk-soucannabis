'use strict';

const { query } = require('./pool');

/**
 * Garante `users.associate_status` como VARCHAR com fases pt-BR.
 * Corrige bancos que ainda têm INTEGER (causa 22P02 ao gravar 'assinatura_termo').
 */
async function ensureAssociateStatusColumn() {
  const col = await query(
    `SELECT data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'associate_status'`
  );
  if (!col.rows.length) {
    return { ok: true, skipped: true, reason: 'column_missing' };
  }

  const dataType = String(col.rows[0].data_type || '').toLowerCase();
  const alreadyText = dataType === 'character varying' || dataType === 'text' || dataType === 'varchar';

  if (!alreadyText) {
    await query(`
      ALTER TABLE users
        ALTER COLUMN associate_status TYPE VARCHAR(64)
        USING (
          CASE
            WHEN associate_status IS NULL THEN NULL
            WHEN associate_status::text IN ('1', 'email_created', 'welcome', 'cadastro_criado')
              THEN 'cadastro_criado'
            WHEN associate_status::text IN (
              '2', 'associate_data', 'patient_data', 'form_error', 'dados_pessoais'
            ) THEN 'dados_pessoais'
            WHEN associate_status::text IN ('3', 'documents', 'docs', 'documentos')
              THEN 'documentos'
            WHEN associate_status::text IN (
              '4', 'contract', 'signing', 'term', 'assinatura_termo'
            ) THEN 'assinatura_termo'
            WHEN associate_status::text IN (
              '5', 'consultation', 'prescription', 'consulta'
            ) THEN '__legacy_5__'
            WHEN associate_status::text = 'concluido' THEN 'concluido'
            WHEN associate_status::text IN (
              'cadastro_criado', 'dados_pessoais', 'documentos', 'assinatura_termo'
            ) THEN associate_status::text
            ELSE 'cadastro_criado'
          END
        )
    `);
  }

  // Antiga fase 5 = pós-termo.
  const legacy5 = await query(`
    UPDATE users
    SET
      associate_status = CASE
        WHEN status = 'Associado' THEN 'concluido'
        ELSE 'assinatura_termo'
      END,
      status = CASE
        WHEN status = 'patient' THEN status
        ELSE 'Associado'
      END,
      date_updated = NOW()
    WHERE associate_status = '__legacy_5__'
  `);

  // Normaliza restos numéricos em VARCHAR ('1'..'5').
  const numericLegacy = await query(`
    UPDATE users
    SET
      associate_status = CASE associate_status
        WHEN '1' THEN 'cadastro_criado'
        WHEN '2' THEN 'dados_pessoais'
        WHEN '3' THEN 'documentos'
        WHEN '4' THEN 'assinatura_termo'
        WHEN '5' THEN CASE WHEN status = 'Associado' THEN 'concluido' ELSE 'assinatura_termo' END
        ELSE associate_status
      END,
      date_updated = NOW()
    WHERE associate_status IN ('1', '2', '3', '4', '5')
  `);

  return {
    ok: true,
    migratedType: !alreadyText,
    legacy5Updated: legacy5.rowCount || 0,
    numericNormalized: numericLegacy.rowCount || 0,
  };
}

module.exports = { ensureAssociateStatusColumn };
