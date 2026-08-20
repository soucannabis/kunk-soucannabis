import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDatabaseUrl() {
  if (process.env.PG_URL) return process.env.PG_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.E2E_PG_URL) return process.env.E2E_PG_URL;

  const apiUrl = process.env.E2E_API_URL || '';
  if (/^https?:\/\/(?!localhost)/i.test(apiUrl)) {
    return null;
  }

  const envPath = path.resolve(__dirname, '../../../../kunk-api/.env');
  const fileEnv = parseEnvFile(envPath);
  if (fileEnv.PG_URL) return fileEnv.PG_URL;
  if (fileEnv.DATABASE_URL) return fileEnv.DATABASE_URL;

  const host = process.env.PGHOST || fileEnv.PGHOST;
  const user = process.env.PGUSER || fileEnv.PGUSER;
  const password = process.env.PGPASSWORD ?? fileEnv.PGPASSWORD;
  const database = process.env.PGDATABASE || fileEnv.PGDATABASE;
  const port = process.env.PGPORT || fileEnv.PGPORT || '5432';
  if (host && user && database && password != null && password !== '') {
    return (
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(String(password))}` +
      `@${host}:${port}/${encodeURIComponent(database)}`
    );
  }
  return null;
}

function requirePool() {
  const url = loadDatabaseUrl();
  if (!url) return null;
  return new pg.Pool({ connectionString: url });
}

/** Indica se PG_URL/DATABASE_URL está disponível para seeds E2E. */
export function hasDbUrl() {
  return Boolean(loadDatabaseUrl());
}

/** Só env explícita — evita usar kunk-api/.env local ao rodar E2E remoto. */
export function hasExplicitDbUrl() {
  return Boolean(process.env.PG_URL || process.env.DATABASE_URL || process.env.E2E_PG_URL);
}

let bcryptModule;
async function hashAssociatePassword(plain) {
  if (!bcryptModule) {
    const { createRequire } = await import('module');
    const req = createRequire(path.join(__dirname, '../../../../kunk-api/package.json'));
    bcryptModule = req('bcrypt');
  }
  // API em produção (Railway) usa 10 rounds; local test usa 4.
  const rounds = 10;
  return bcryptModule.hash(String(plain), rounds);
}

/**
 * Cria associado mínimo (fase cadastro_criado) via DB — evita POST register-email (rate limit).
 * Retorna false se PG_URL não estiver configurado.
 */
export async function ensureAssociateForE2E(email, { password = 'senha123' } = {}) {
  if (!email) throw new Error('ensureAssociateForE2E exige email');
  const pool = requirePool();
  if (!pool) return false;

  const normalized = String(email).trim().toLowerCase();
  await deleteAssociateByEmail(normalized);
  const passwordHash = await hashAssociatePassword(password);
  const userCode = randomUUID();

  try {
    await pool.query(
      `INSERT INTO users (
         email_account, account_password, associate_status, status, user_code,
         date_created, created_date, invalid_fields
       ) VALUES ($1, $2, 'cadastro_criado', 'cadastro_criado', $3::uuid, NOW(), NOW(), $4)`,
      [normalized, passwordHash, userCode, JSON.stringify([])]
    );

    const { rows } = await pool.query(
      `SELECT id FROM users
       WHERE lower(email_account) = lower($1)
         AND (status IS NULL OR status <> 'patient')
       LIMIT 1`,
      [normalized]
    );
    if (!rows[0]) {
      throw new Error(`ensureAssociateForE2E: insert falhou para ${normalized}`);
    }
    return true;
  } finally {
    await pool.end();
  }
}

/** Endereço padrão SP para demos de frete (Loggi / Melhor Envio). */
const DEMO_SHIPPING_ADDRESS = {
  street: 'Rua das Flores',
  street_number: '100',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  cep: '01310100',
  complement: '',
};

/**
 * Garante CEP e endereço cadastral no associado (necessário para cotar frete no carrinho).
 */
export async function ensureDemoAssociateShippingAddress(
  email,
  address = DEMO_SHIPPING_ADDRESS
) {
  if (!email) throw new Error('ensureDemoAssociateShippingAddress exige email');
  const pool = requirePool();
  if (!pool) return { id: null, email_account: email, address };
  try {
    const cepDigits = String(address.cep || '').replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      throw new Error(`CEP inválido para demo: ${address.cep}`);
    }
    const delivery = {
      street: address.street,
      number: address.street_number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      cep: cepDigits,
      complement: address.complement || '',
    };
    const { rows } = await pool.query(
      `UPDATE users
       SET street = $2,
           street_number = $3,
           neighborhood = $4,
           city = $5,
           state = $6,
           cep = $7,
           complement = $8,
           delivery_address = $9::jsonb,
           date_updated = NOW()
       WHERE lower(email_account) = lower($1)
         AND (status IS NULL OR status <> 'patient')
       RETURNING id, email_account, cep, city, state`,
      [
        email,
        address.street,
        address.street_number,
        address.neighborhood,
        address.city,
        address.state,
        cepDigits,
        address.complement || '',
        JSON.stringify(delivery),
      ]
    );
    if (!rows[0]) throw new Error(`Associado não encontrado para endereço: ${email}`);
    return { ...rows[0], address: delivery };
  } finally {
    await pool.end();
  }
}

/** Force status/fase for E2E pós-termo (QA only). */
export async function forceAssociateStatus(email, { status = 'Associado', associate_status = 'assinatura_termo' } = {}) {
  const pool = requirePool();
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE users SET status = $1, associate_status = $2, date_updated = NOW()
       WHERE lower(email_account) = lower($3)`,
      [status, associate_status, email]
    );
  } finally {
    await pool.end();
  }
}

/** @deprecated use forceAssociateStatus */
export async function forceAssociatePhase(email, phase) {
  if (phase === 5 || phase === 'associado' || phase === 'consulta') {
    return forceAssociateStatus(email, { status: 'Associado', associate_status: 'assinatura_termo' });
  }
  return forceAssociateStatus(email, { status: null, associate_status: phase });
}

/**
 * Limpa os dados transitórios criados pela demo contato → pedido sem remover o associado.
 * Remove todos os pedidos do associado, receitas anexadas e a data/campo da prescrição.
 */
export async function cleanupAssociateOrdersAndPrescriptions(email) {
  if (!email) {
    return { deletedOrders: 0, deletedPrescriptionFiles: 0 };
  }

  const pool = requirePool();
  if (!pool) return { deletedOrders: 0, deletedPrescriptionFiles: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: users } = await client.query(
      `SELECT id, user_code
       FROM users
       WHERE lower(email_account) = lower($1)
       ORDER BY id`,
      [email]
    );
    if (!users.length) throw new Error(`Associado não encontrado: ${email}`);

    const userIds = users.map((user) => user.id);
    const userCodes = users.map((user) => String(user.user_code || '')).filter(Boolean);
    const { rows: orders } = await client.query(
      `SELECT id
       FROM orders
       WHERE "user" = ANY($1::int[])
          OR user_code = ANY($2::text[])`,
      [userIds, userCodes]
    );
    const orderIds = orders.map((order) => order.id);

    if (orderIds.length) {
      await client.query(
        `DELETE FROM product_stock_movements WHERE order_id = ANY($1::int[])`,
        [orderIds]
      );
      await client.query(
        `DELETE FROM orders_files WHERE order_id = ANY($1::int[])`,
        [orderIds]
      );
      await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [orderIds]);
    }

    const { rows: prescriptions } = await client.query(
      `SELECT DISTINCT file_id AS id
       FROM users_files
       WHERE user_id = ANY($1::int[])
         AND doc_kind = 'prescription'`,
      [userIds]
    );
    const prescriptionFileIds = prescriptions.map((file) => file.id).filter(Boolean);

    await client.query(
      `UPDATE users
       SET date_prescription = NULL, prescription = NULL, date_updated = NOW()
       WHERE id = ANY($1::int[])`,
      [userIds]
    );
    await client.query(
      `DELETE FROM users_files
       WHERE user_id = ANY($1::int[])
         AND doc_kind = 'prescription'`,
      [userIds]
    );
    if (prescriptionFileIds.length) {
      await client.query(
        `DELETE FROM files WHERE id = ANY($1::uuid[])`,
        [prescriptionFileIds]
      );
    }

    await client.query('COMMIT');
    return {
      deletedOrders: orderIds.length,
      deletedPrescriptionFiles: prescriptionFileIds.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Reabre a assinatura de uma conta de demo, removendo somente seus contratos anteriores. */
export async function resetAssociateTermByEmail(email) {
  const pool = requirePool();
  if (!pool) return { deletedContracts: 0, deletedFiles: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: users } = await client.query(
      `SELECT id, user_code FROM users WHERE lower(email_account) = lower($1)`,
      [email]
    );
    if (!users.length) throw new Error(`Associado não encontrado: ${email}`);

    const userCodes = users.map((user) => user.user_code).filter(Boolean);
    const { rows: fileRows } = await client.query(
      `SELECT filled_pdf_file_id AS id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       UNION
       SELECT signed_pdf_file_id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       UNION
       SELECT audit_pdf_file_id FROM term_contracts WHERE user_code = ANY($1::uuid[])`,
      [userCodes]
    );
    const fileIds = fileRows.map((row) => row.id).filter(Boolean);

    await client.query(
      `UPDATE users
       SET adhesion_term = NULL, status = NULL, associate_status = 'assinatura_termo',
           date_updated = NOW()
       WHERE lower(email_account) = lower($1)`,
      [email]
    );
    await client.query(
      `DELETE FROM term_events WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [userCodes]
    );
    await client.query(
      `DELETE FROM term_signatures WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [userCodes]
    );
    const deleted = await client.query(
      `DELETE FROM term_contracts WHERE user_code = ANY($1::uuid[])`,
      [userCodes]
    );
    if (fileIds.length) {
      await client.query(`DELETE FROM files WHERE id = ANY($1::uuid[])`, [fileIds]);
    }
    await client.query('COMMIT');
    return { deletedContracts: deleted.rowCount || 0, deletedFiles: fileIds.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Remove o associado (e pacientes vinculados) criados no E2E, mais arquivos e termos.
 * Usa e-mail exato — não apaga sample data.
 * Também remove pedidos/serviços/reception vinculados (FK em orders.user).
 */
export async function deleteAssociateByEmail(email) {
  if (!email) return { deletedUsers: 0 };
  const pool = requirePool();
  if (!pool) return { deletedUsers: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: roots } = await client.query(
      `SELECT id, user_code FROM users WHERE lower(email_account) = lower($1)`,
      [email]
    );
    if (!roots.length) {
      await client.query('COMMIT');
      return { deletedUsers: 0 };
    }

    const rootCodes = roots.map((r) => r.user_code).filter(Boolean);
    const { rows: patients } = await client.query(
      `SELECT id, user_code FROM users
       WHERE responsible_code = ANY($1::uuid[])
          OR user_code::text IN (
               SELECT patient_user_code FROM users
               WHERE user_code = ANY($1::uuid[])
                 AND patient_user_code IS NOT NULL
                 AND patient_user_code <> ''
             )`,
      [rootCodes]
    );

    const allUsers = [...roots, ...patients];
    const userIds = [...new Set(allUsers.map((u) => u.id))];
    const userCodes = [...new Set(allUsers.map((u) => u.user_code).filter(Boolean))];
    const userCodesText = userCodes.map(String);

    const { rows: orders } = await client.query(
      `SELECT id FROM orders
       WHERE "user" = ANY($1::int[])
          OR user_code = ANY($2::text[])`,
      [userIds, userCodesText]
    );
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      await client.query(
        `DELETE FROM product_stock_movements WHERE order_id = ANY($1::int[])`,
        [orderIds]
      );
      await client.query(
        `DELETE FROM orders_files WHERE order_id = ANY($1::int[])`,
        [orderIds]
      );
      await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [orderIds]);
    }

    const { rows: services } = await client.query(
      `SELECT id FROM services
       WHERE associate_user_code = ANY($1::uuid[])
          OR patient_user_code = ANY($1::uuid[])
          OR associate_user_code::text = ANY($2::text[])`,
      [userCodes, userCodesText]
    );
    const serviceIds = services.map((s) => s.id);
    if (serviceIds.length) {
      await client.query(
        `DELETE FROM services_files WHERE service_id = ANY($1::int[])`,
        [serviceIds]
      );
      await client.query(`DELETE FROM services WHERE id = ANY($1::int[])`, [serviceIds]);
    }

    await client.query(`DELETE FROM reception WHERE associate_code = ANY($1::text[])`, [
      userCodesText,
    ]);
    await client.query(`DELETE FROM reception WHERE lower(email) = lower($1)`, [email]);

    await client.query(
      `DELETE FROM term_events WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [userCodes]
    );
    await client.query(
      `DELETE FROM term_signatures WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [userCodes]
    );

    const { rows: contractFiles } = await client.query(
      `SELECT filled_pdf_file_id AS id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       UNION
       SELECT signed_pdf_file_id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       UNION
       SELECT audit_pdf_file_id FROM term_contracts WHERE user_code = ANY($1::uuid[])`,
      [userCodes]
    );
    await client.query(`DELETE FROM term_contracts WHERE user_code = ANY($1::uuid[])`, [
      userCodes,
    ]);

    const { rows: ufFiles } = await client.query(
      `SELECT file_id AS id FROM users_files WHERE user_id = ANY($1::int[])`,
      [userIds]
    );
    await client.query(`DELETE FROM users_files WHERE user_id = ANY($1::int[])`, [userIds]);

    const fileIds = [...contractFiles, ...ufFiles]
      .map((r) => r.id)
      .filter(Boolean);

    if (fileIds.length) {
      await client.query(
        `UPDATE term_signatures SET image_file_id = NULL WHERE image_file_id = ANY($1::uuid[])`,
        [fileIds]
      );
      await client.query(`DELETE FROM files WHERE id = ANY($1::uuid[])`, [fileIds]);
    }

    await client.query(
      `UPDATE users SET patient_user_code = NULL
       WHERE user_code = ANY($1::uuid[])`,
      [userCodes]
    );
    await client.query(
      `UPDATE users SET responsible_code = NULL
       WHERE responsible_code = ANY($1::uuid[])`,
      [userCodes]
    );

    const patientIds = patients.map((p) => p.id);
    if (patientIds.length) {
      await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [patientIds]);
    }
    await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [
      roots.map((r) => r.id),
    ]);

    await client.query('COMMIT');
    return {
      deletedUsers: userIds.length,
      deletedOrders: orderIds.length,
      deletedServices: serviceIds.length,
      fileIds: fileIds.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Remove associados duplicados "Ana Silva", mantendo apenas `keepEmail`.
 * Usado pela demo de associados: gravações anteriores deixam várias Anas na lista.
 *
 * Remove só os vínculos (orders_files/users_files/...) e os registros dos
 * duplicados; a tabela `files` fica intacta, porque os mesmos arquivos podem
 * estar referenciados por pedidos de outros associados.
 */
export async function cleanupDuplicateAnaSilvaAssociates(keepEmail) {
  if (!keepEmail) {
    throw new Error('cleanupDuplicateAnaSilvaAssociates exige keepEmail');
  }

  const pool = requirePool();
  if (!pool) return { keptEmail: keepEmail, deletedDuplicates: 0, deletedEmails: [] };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: roots } = await client.query(
      `SELECT id, email_account, user_code
       FROM users
       WHERE associate_name ILIKE 'Ana'
         AND associate_last_name ILIKE 'Silva'
         AND (status IS NULL OR status <> 'patient')
         AND lower(coalesce(email_account, '')) <> lower($1)
       ORDER BY id`,
      [keepEmail]
    );

    if (!roots.length) {
      await client.query('COMMIT');
      return { keptEmail: keepEmail, deletedDuplicates: 0, deletedEmails: [] };
    }

    const rootIds = roots.map((r) => r.id);
    const rootCodes = roots.map((r) => r.user_code).filter(Boolean);

    const { rows: patients } = await client.query(
      `SELECT id, user_code FROM users WHERE responsible_code = ANY($1::uuid[])`,
      [rootCodes]
    );
    const allIds = [...new Set([...rootIds, ...patients.map((p) => p.id)])];
    const allCodes = [
      ...new Set([...rootCodes, ...patients.map((p) => p.user_code).filter(Boolean)]),
    ];

    const { rows: orders } = await client.query(
      `SELECT id FROM orders WHERE "user" = ANY($1::int[]) OR user_code = ANY($2::text[])`,
      [allIds, allCodes.map(String)]
    );
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      await client.query(`DELETE FROM product_stock_movements WHERE order_id = ANY($1::int[])`, [orderIds]);
      await client.query(`DELETE FROM orders_files WHERE order_id = ANY($1::int[])`, [orderIds]);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [orderIds]);
    }

    const { rows: services } = await client.query(
      `SELECT id FROM services
       WHERE associate_user_code = ANY($1::uuid[]) OR patient_user_code = ANY($1::uuid[])`,
      [allCodes]
    );
    const serviceIds = services.map((s) => s.id);
    if (serviceIds.length) {
      await client.query(`DELETE FROM services_files WHERE service_id = ANY($1::int[])`, [serviceIds]);
      await client.query(`DELETE FROM services WHERE id = ANY($1::int[])`, [serviceIds]);
    }

    await client.query(`DELETE FROM reception WHERE associate_code = ANY($1::text[])`, [
      allCodes.map(String),
    ]);
    await client.query(
      `DELETE FROM term_events WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [allCodes]
    );
    await client.query(
      `DELETE FROM term_signatures WHERE contract_id IN (
         SELECT id FROM term_contracts WHERE user_code = ANY($1::uuid[])
       )`,
      [allCodes]
    );
    await client.query(`DELETE FROM term_contracts WHERE user_code = ANY($1::uuid[])`, [allCodes]);
    await client.query(`DELETE FROM users_files WHERE user_id = ANY($1::int[])`, [allIds]);
    await client.query(
      `UPDATE users SET patient_user_code = NULL WHERE patient_user_code = ANY($1::text[])`,
      [allCodes.map(String)]
    );
    await client.query(
      `UPDATE users SET responsible_code = NULL WHERE responsible_code = ANY($1::uuid[])`,
      [allCodes]
    );
    await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [allIds]);

    await client.query('COMMIT');
    return {
      keptEmail: keepEmail,
      deletedDuplicates: roots.length,
      deletedEmails: roots.map((r) => String(r.email_account || `(sem-email#${r.id})`)),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Remove contatos de triagem criados pelo E2E (e-mail exato). */
export async function deleteReceptionByEmail(email) {
  if (!email) return { deleted: 0 };
  const pool = requirePool();
  if (!pool) return { deleted: 0 };
  try {
    const res = await pool.query(
      `DELETE FROM reception WHERE lower(email) = lower($1)`,
      [email]
    );
    return { deleted: res.rowCount || 0 };
  } finally {
    await pool.end();
  }
}

/**
 * Limpa atendimentos/serviços e triagens da demo sem remover o associado.
 * Remove services_files + files anexados, services e reception do e-mail.
 */
export async function cleanupAssociateServicesAndReception(email) {
  if (!email) {
    return { deletedServices: 0, deletedReceiptFiles: 0, deletedReception: 0 };
  }

  const pool = requirePool();
  if (!pool) return { deletedServices: 0, deletedReceiptFiles: 0, deletedReception: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: users } = await client.query(
      `SELECT id, user_code
       FROM users
       WHERE lower(email_account) = lower($1)
       ORDER BY id`,
      [email]
    );
    const userCodes = users.map((user) => String(user.user_code || '')).filter(Boolean);

    const { rows: services } = await client.query(
      `SELECT id
       FROM services
       WHERE lower(coalesce(associate_email, '')) = lower($1)
          OR associate_user_code::text = ANY($2::text[])`,
      [email, userCodes]
    );
    const serviceIds = services.map((row) => row.id);

    let deletedReceiptFiles = 0;
    if (serviceIds.length) {
      const { rows: links } = await client.query(
        `SELECT file_id
         FROM services_files
         WHERE service_id = ANY($1::int[])`,
        [serviceIds]
      );
      const fileIds = links.map((row) => row.file_id).filter(Boolean);
      await client.query(
        `DELETE FROM services_files WHERE service_id = ANY($1::int[])`,
        [serviceIds]
      );
      if (fileIds.length) {
        const deleted = await client.query(
          `DELETE FROM files WHERE id = ANY($1::uuid[])`,
          [fileIds]
        );
        deletedReceiptFiles = deleted.rowCount || 0;
      }
      await client.query(`DELETE FROM services WHERE id = ANY($1::int[])`, [serviceIds]);
    }

    const reception = await client.query(
      `DELETE FROM reception WHERE lower(email) = lower($1)`,
      [email]
    );

    await client.query('COMMIT');
    return {
      deletedServices: serviceIds.length,
      deletedReceiptFiles,
      deletedReception: reception.rowCount || 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Cria o paciente persistente e dados temporários exibidos no histórico
 * do modal de associados. Retorna somente IDs temporários para cleanup.
 */
export async function seedAssociateHistoryDemo(email) {
  const pool = requirePool();
  if (!pool) return { associate: null, patient: null, orderIds: [], serviceIds: [] };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: associates } = await client.query(
      `SELECT id, user_code, associate_name, associate_last_name, email_account,
              mobile_number, street, street_number, neighborhood, city, state, cep
       FROM users
       WHERE lower(email_account) = lower($1)
         AND (status IS NULL OR status <> 'patient')
       ORDER BY id DESC
       LIMIT 1`,
      [email]
    );
    const associate = associates[0];
    if (!associate) throw new Error(`Associado não encontrado: ${email}`);

    // Garante Ana no topo da lista e remove resíduos de gravações anteriores.
    await client.query(
      `UPDATE users
       SET created_date = NOW(),
           date_updated = NOW(),
           annotations = NULL,
           prescriber = NULL,
           prescriber_code = NULL,
           date_prescription = NULL
       WHERE id = $1`,
      [associate.id]
    );

    const patientName = 'Paciente Demo Associados';
    const { rows: existingPatients } = await client.query(
      `SELECT id, user_code
       FROM users
       WHERE responsible_code = $1::uuid
         AND associate_name = $2
       ORDER BY id DESC
       LIMIT 1`,
      [associate.user_code, patientName]
    );
    let patient = existingPatients[0];
    if (!patient) {
      const { rows } = await client.query(
        `INSERT INTO users (
           status, associate_name, associate_last_name, associate_birth_date,
           gender, nationality, responsible_type, responsible_code, user_code,
           email_account, mobile_number, street, street_number, neighborhood,
           city, state, cep, date_created, date_updated, created_date
         ) VALUES (
           'patient', $1, 'Demo', '2010-05-15',
           'homem-cis', 'Brasileira', 'patient', $2::uuid, $3::uuid,
           $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW()
         )
         RETURNING id, user_code`,
        [
          patientName,
          associate.user_code,
          randomUUID(),
          associate.email_account,
          associate.mobile_number,
          associate.street,
          associate.street_number,
          associate.neighborhood,
          associate.city,
          associate.state,
          associate.cep,
        ]
      );
      patient = rows[0];
    }

    const professional = await client.query(
      `SELECT professional_code, name, last_name, email
       FROM professionals
       WHERE name ILIKE 'Lucas' AND last_name ILIKE 'Nogueira'
       LIMIT 1`
    );
    const pro = professional.rows[0];
    if (!pro?.professional_code) throw new Error('Profissional Lucas Nogueira não encontrado');

    const orderIds = [];
    const serviceIds = [];
    const products = ['Óleo CBD 3000mg', 'Óleo THC 1500mg', 'Óleo CBN 1000mg'];
    for (let index = 0; index < 3; index += 1) {
      const createdAt = new Date(Date.now() - (index + 1) * 86_400_000);
      const total = 100 + index * 25;
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (
           date_created, date_updated, created_date, status, total, delivery_price,
           associate_name, receiver_name, order_code, user_code, "user", items,
           discount, donation, details, tags, address, freight_carrier, is_sample
         ) VALUES (
           $1::timestamptz, $1::timestamptz, $1::timestamp, 'Pagamento concluído', $2, 0,
           $3, $3, $4::uuid, $5, $6, $7::jsonb,
           0, 0, 'Pedido temporário para demonstração do histórico.', $8::jsonb,
           $9::jsonb, 'loggi', false
         )
         RETURNING id`,
        [
          createdAt,
          total,
          `${associate.associate_name} ${associate.associate_last_name || ''}`.trim(),
          randomUUID(),
          associate.user_code,
          associate.id,
          JSON.stringify([
            {
              code: `DEMO-HIST-${index + 1}`,
              name: products[index],
              quantity: 1,
              amount: total,
              price: total,
            },
          ]),
          JSON.stringify(['demo-historico']),
          JSON.stringify({
            street: associate.street || 'Rua Demonstração',
            number: associate.street_number || '100',
            neighborhood: associate.neighborhood || 'Centro',
            city: associate.city || 'São Paulo',
            state: associate.state || 'SP',
            cep: associate.cep || '01001000',
          }),
        ]
      );
      orderIds.push(orderRows[0].id);

      const { rows: serviceRows } = await client.query(
        `INSERT INTO services (
           type, date_created, name, professional_id, status, price,
           associate_name, associate_user_code, associate_email, professional_name,
           consultation_date, price_paid, donation, booking_group_code, patient_name,
           patient_user_code, professional_email, service_code, observations,
           payment_type, tags, is_sample
         ) VALUES (
           'retorno', $1, $2, $3::uuid, 'Pagamento Concluído', 200,
           $4, $5::uuid, $6, $7,
           $8, 100, 100, $9, $10,
           $11::uuid, $12, $13::uuid, 'Atendimento temporário para histórico.',
           'Pix', $14::jsonb, false
         )
         RETURNING id`,
        [
          createdAt,
          `Consulta de retorno ${index + 1}`,
          pro.professional_code,
          `${associate.associate_name} ${associate.associate_last_name || ''}`.trim(),
          associate.user_code,
          associate.email_account,
          `${pro.name} ${pro.last_name || ''}`.trim(),
          new Date(createdAt.getTime() + 3_600_000),
          randomUUID(),
          patientName,
          patient.user_code,
          pro.email || null,
          randomUUID(),
          JSON.stringify(['retorno', 'demo-historico']),
        ]
      );
      serviceIds.push(serviceRows[0].id);
    }

    await client.query('COMMIT');
    return { associate, patient, orderIds, serviceIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const DEMO_CONTEST_TEXT =
  'O atendimento de Iris Yamamoto é consulta de retorno, o valor está errado.';

function monthLabelFromDate(date) {
  return date
    .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(' de ', ' ');
}

function yearMonthFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseContestReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Pré-condição da demo de relatório: Marina + Iris/Karen pagos no mês,
 * limpa contestações e reseta validações/preço usados na gravação.
 */
export async function prepareServicesReportDemo({
  professionalEmail = process.env.DEMO_PROFESSIONAL_EMAIL || 'profissional@example.test',
  associateName = 'Iris Yamamoto',
  secondAssociateName = 'Karen Esteves',
  contestText = DEMO_CONTEST_TEXT,
  irisPrice = 200,
} = {}) {
  const pool = requirePool();
  if (!pool) return null;
  try {
    const { rows: pros } = await pool.query(
      `SELECT id, name, last_name, email, professional_code, contest_reports
       FROM professionals
       WHERE lower(email) = lower($1)
          OR (name ILIKE 'Marina' AND last_name ILIKE 'Oliveira')
       ORDER BY CASE WHEN lower(email) = lower($1) THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [professionalEmail]
    );
    const professional = pros[0];
    if (!professional) {
      throw new Error(`Profissional não encontrado: ${professionalEmail}`);
    }

    async function findPaidService(name) {
      const { rows } = await pool.query(
        `SELECT id, consultation_date, associate_name, patient_name, status, price, price_paid,
                donation, commission_validation
         FROM services
         WHERE professional_id::text = $1
           AND status = 'Pagamento Concluído'
           AND consultation_date IS NOT NULL
           AND (
             associate_name ILIKE $2
             OR patient_name ILIKE $2
           )
         ORDER BY consultation_date ASC
         LIMIT 1`,
        [String(professional.professional_code), `%${name}%`]
      );
      return rows[0] || null;
    }

    const iris = await findPaidService(associateName);
    if (!iris) {
      throw new Error(`Serviço pago de ${associateName} não encontrado para Marina`);
    }
    const karen = await findPaidService(secondAssociateName);
    if (!karen) {
      throw new Error(`Serviço pago de ${secondAssociateName} não encontrado para Marina`);
    }

    const consultationDate = new Date(iris.consultation_date);
    const monthLabel = monthLabelFromDate(consultationDate);
    const yearMonth = yearMonthFromDate(consultationDate);

    // Zera contestações e aprovações de Iris/Karen antes de gravar.
    await pool.query(`UPDATE professionals SET contest_reports = '[]'::jsonb WHERE id = $1`, [
      professional.id,
    ]);
    await pool.query(
      `UPDATE services
       SET commission_validation = NULL
       WHERE id = ANY($1::int[])`,
      [[iris.id, karen.id]]
    );

    await pool.query(
      `UPDATE services
       SET price = $1::numeric,
           price_paid = GREATEST(0, $1::numeric - COALESCE(donation, 0))
       WHERE id = $2`,
      [irisPrice, iris.id]
    );

    return {
      professional: {
        id: professional.id,
        name: professional.name,
        last_name: professional.last_name,
        email: professional.email,
        professional_code: String(professional.professional_code),
        display_name: `${professional.name || ''} ${professional.last_name || ''}`.trim(),
      },
      service: {
        id: iris.id,
        associate_name: iris.associate_name,
        patient_name: iris.patient_name,
        consultation_date: iris.consultation_date,
        price: irisPrice,
      },
      secondService: {
        id: karen.id,
        associate_name: karen.associate_name,
        patient_name: karen.patient_name,
        consultation_date: karen.consultation_date,
      },
      monthLabel,
      yearMonth,
      contestText,
    };
  } finally {
    await pool.end();
  }
}

/** Remove contestações/aprovações de demo e restaura preço da Iris. */
export async function cleanupServicesReportDemoContests({
  professionalId,
  contestText = DEMO_CONTEST_TEXT,
  serviceIds = [],
  restoreIrisPrice = 200,
} = {}) {
  if (!professionalId) return { removed: 0 };
  const pool = requirePool();
  if (!pool) return { removed: 0 };
  try {
    const { rows } = await pool.query(
      `SELECT id, contest_reports FROM professionals WHERE id = $1`,
      [professionalId]
    );
    const professional = rows[0];
    if (!professional) return { removed: 0 };
    const current = parseContestReports(professional.contest_reports);
    const removed = current.length;
    await pool.query(`UPDATE professionals SET contest_reports = '[]'::jsonb WHERE id = $1`, [
      professional.id,
    ]);

    const ids = serviceIds.map(Number).filter(Number.isFinite);
    if (ids.length) {
      await pool.query(
        `UPDATE services SET commission_validation = NULL WHERE id = ANY($1::int[])`,
        [ids]
      );
      await pool.query(
        `UPDATE services
         SET price = $1::numeric,
             price_paid = GREATEST(0, $1::numeric - COALESCE(donation, 0))
         WHERE id = $2`,
        [restoreIrisPrice, ids[0]]
      );
    }
    return { removed };
  } finally {
    await pool.end();
  }
}

/** Remove somente pedidos e atendimentos temporários identificados por ID. */
export async function cleanupHistoryDemoData({ orderIds = [], serviceIds = [] } = {}) {
  const pool = requirePool();
  if (!pool) return { deletedOrders: 0, deletedServices: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orders = orderIds.map(Number).filter(Number.isInteger);
    const services = serviceIds.map(Number).filter(Number.isInteger);
    if (orders.length) {
      await client.query(`DELETE FROM product_stock_movements WHERE order_id = ANY($1::int[])`, [orders]);
      await client.query(`DELETE FROM orders_files WHERE order_id = ANY($1::int[])`, [orders]);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [orders]);
    }
    if (services.length) {
      await client.query(`DELETE FROM services_files WHERE service_id = ANY($1::int[])`, [services]);
      await client.query(`DELETE FROM services WHERE id = ANY($1::int[])`, [services]);
    }
    await client.query('COMMIT');
    return { deletedOrders: orders.length, deletedServices: services.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Atendentes com nomes de pessoas para a demo de triagem.
 * Renomeia Acol/Admin de teste e cria extras fictícios.
 */
export async function ensureDemoTriageAttendants(pool) {
  const db = pool || requirePool();
  if (!db) return { assume: null, transfer: null, extras: [] };
  const ownPool = !pool;
  try {
    const attendants = [
      {
        email: 'acolhimento@kunk-api.test',
        code: 'ACOL-TEST',
        name: 'Sofia',
        lastName: 'Ribeiro',
        permissions: ['Acolhimento'],
        avatar: 'https://i.pravatar.cc/150?u=sofia-ribeiro-kunk',
      },
      {
        email: 'admin@kunk-api.test',
        code: 'ADMIN-TEST',
        name: 'Carlos',
        lastName: 'Mendes',
        permissions: ['Administrador'],
        avatar: 'https://i.pravatar.cc/150?u=carlos-mendes-kunk',
      },
      {
        email: 'lia.araujo@demo.kunk.local',
        code: 'DEMO-LIA',
        name: 'Lia',
        lastName: 'Araújo',
        permissions: ['Acolhimento'],
        avatar: 'https://i.pravatar.cc/150?u=lia-araujo-kunk',
      },
      {
        email: 'pedro.almeida@demo.kunk.local',
        code: 'DEMO-PEDRO',
        name: 'Pedro',
        lastName: 'Almeida',
        permissions: ['Acolhimento'],
        avatar: 'https://i.pravatar.cc/150?u=pedro-almeida-kunk',
      },
    ];

    for (const att of attendants) {
      const existing = await db.query(`SELECT id FROM system_users WHERE email = $1`, [att.email]);
      if (existing.rows[0]) {
        await db.query(
          `UPDATE system_users
           SET name = $1,
               last_name = $2,
               status = 'active',
               permissions = $3,
               internal_code = COALESCE(NULLIF(internal_code, ''), $4),
               avatar_url = $5
           WHERE id = $6`,
          [
            att.name,
            att.lastName,
            JSON.stringify(att.permissions),
            att.code,
            att.avatar,
            existing.rows[0].id,
          ]
        );
      } else {
        await db.query(
          `INSERT INTO system_users (
             email, password, name, last_name, permissions, status, internal_code, avatar_url, date_created
           )
           VALUES (
             $1,
             (SELECT password FROM system_users WHERE email = 'acolhimento@kunk-api.test' LIMIT 1),
             $2, $3, $4, 'active', $5, $6, NOW()
           )`,
          [
            att.email,
            att.name,
            att.lastName,
            JSON.stringify(att.permissions),
            att.code,
            att.avatar,
          ]
        );
      }
    }

    return {
      assume: { code: 'ACOL-TEST', name: 'Sofia Ribeiro' },
      transfer: { code: 'ADMIN-TEST', name: 'Carlos Mendes' },
      extras: [
        { code: 'DEMO-LIA', name: 'Lia Araújo' },
        { code: 'DEMO-PEDRO', name: 'Pedro Almeida' },
      ],
    };
  } finally {
    if (ownPool) await db.end();
  }
}

/**
 * Preflight da demo de triagem (status Concluído):
 * - apaga todos os reception com status `done`
 * - cria contatos concluídos novos, com Ana Silva **não** sendo o mais recente
 * - o reception de Ana Silva fica sem `associate_code` para o passo “Linkar”
 * - garante atendentes com nomes de pessoas (não Admin/Acol Test)
 */
export async function prepareTriageConcluidoDemo({
  attendantCode = 'ADMIN-TEST',
  associateEmail = process.env.DEMO_ASSOCIATE_EMAIL || 'associado@example.test',
} = {}) {
  const pool = requirePool();
  if (!pool) return null;
  try {
    const attendants = await ensureDemoTriageAttendants(pool);
    const deleted = await pool.query(`DELETE FROM reception WHERE status = 'done'`);

    const { rows: associates } = await pool.query(
      `SELECT user_code, associate_name, associate_last_name, email_account
       FROM users
       WHERE status = 'Associado'
         AND user_code IS NOT NULL
         AND (
           lower(email_account) = lower($1)
           OR (associate_name ILIKE 'Ana' AND associate_last_name ILIKE 'Silva')
         )
       ORDER BY CASE WHEN lower(email_account) = lower($1) THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [associateEmail]
    );
    const associate = associates[0];
    if (!associate?.user_code) {
      throw new Error(
        `Associado Ana Silva não encontrado (${associateEmail}). Rode o seed ou defina DEMO_ASSOCIATE_EMAIL.`
      );
    }

    async function insertDone({
      name,
      lastName,
      email,
      hoursAgo,
      attendant,
      phoneSuffix,
    }) {
      const code = randomUUID();
      const fullName = `${name} ${lastName}`;
      const { rows } = await pool.query(
        `INSERT INTO reception (
           date_created, name, last_name, email, phone, help_topic, is_associate,
           message, code, chat_id, status, associate_name, associate_code,
           date_updated, avatar_url, patient_name, attendant, tags,
           completion_reason, is_prescriber, full_name, is_sample
         ) VALUES (
           NOW() - ($1::numeric * interval '1 hour'), $2, $3, $4, $5, $6, 'false',
           $7, $8::uuid, NULL, 'done', $9, NULL,
           NOW() - ($1::numeric * interval '1 hour'), NULL, $10, $11, $12::jsonb,
           'Atendido', 'false', $13, true
         )
         RETURNING id, name, last_name, email, status, attendant, code, date_created`,
        [
          hoursAgo,
          name,
          lastName,
          email,
          `1199${String(800000 + phoneSuffix).slice(0, 6)}`,
          'informação',
          'Contato concluído preparado para a demo de triagem.',
          code,
          fullName,
          fullName,
          attendant,
          JSON.stringify([{ tag: 'demo' }]),
          fullName,
        ]
      );
      return rows[0];
    }

    const stamp = Date.now();
    // Ana Silva fica mais antiga (não é o mais recente na lista -date_created).
    // Atendentes distintos nos cards para o AvatarGroup mostrar nomes de pessoas.
    const ana = await insertDone({
      name: 'Ana',
      lastName: 'Silva',
      email: `triagem-done-ana-${stamp}@demo.kunk.local`,
      hoursAgo: 5,
      attendant: attendants.transfer.code,
      phoneSuffix: 1,
    });
    const newer = [
      await insertDone({
        name: 'Ricardo',
        lastName: 'Fila',
        email: `triagem-done-ricardo-${stamp}@demo.kunk.local`,
        hoursAgo: 1,
        attendant: 'DEMO-LIA',
        phoneSuffix: 2,
      }),
      await insertDone({
        name: 'Camila',
        lastName: 'Espera',
        email: `triagem-done-camila-${stamp}@demo.kunk.local`,
        hoursAgo: 0,
        attendant: 'DEMO-PEDRO',
        phoneSuffix: 3,
      }),
    ];

    const associateName = [associate.associate_name, associate.associate_last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Ana Silva';

    return {
      deleted: deleted.rowCount || 0,
      contacts: [ana, ...newer],
      primary: ana,
      searchName: 'Ana Silva',
      associate: {
        user_code: associate.user_code,
        name: associateName,
        email: associate.email_account,
        search: 'Ana Silva',
      },
      attendants,
      transferAttendantCode: attendants.transfer.code,
      transferAttendantName: attendants.transfer.name,
    };
  } finally {
    await pool.end();
  }
}
