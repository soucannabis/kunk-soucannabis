#!/usr/bin/env node
'use strict';

/**
 * Sample data massivo para teste de carga.
 *
 * Uso:
 *   cd kunk-api && npm run seed:load
 *   npm run seed:load -- --profile=smoke
 *   npm run seed:load -- --profile=large
 *   npm run seed:load -- --profile=medium --batch=500
 *   npm run seed:load -- --users=2000 --orders=4000
 *
 * Flags:
 *   --profile=smoke|medium|large|xlarge   Perfil de volumes (default: medium)
 *   --batch=N                             Tamanho do lote de INSERT (default: 250)
 *   --users=N --orders=N --services=N …   Sobrescreve contagens do perfil
 *   --no-truncate                         Não trunca (só anexar — emails únicos)
 *   --yes                                 Confirma perfil large/xlarge sem prompt
 */

const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const manifest = require('./manifest-load.json');

const SAMPLE_CREATED_BY = 'sample-seed';
const QUOTED = new Set(['user']);

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fábio', 'Gabriela', 'Hugo', 'Iris', 'João',
  'Karen', 'Lucas', 'Marina', 'Nuno', 'Olívia', 'Paulo', 'Queila', 'Rafael', 'Sofia', 'Tiago',
  'Úrsula', 'Vitor', 'Wanda', 'Xavier', 'Yasmin', 'Zeca', 'Beatriz', 'Caio', 'Débora', 'Eduardo',
];
const LAST_NAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Freitas', 'Gomes', 'Henrique', 'Ibrahim',
  'Junqueira', 'Klein', 'Lima', 'Mendes', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Ramos',
  'Silva', 'Teixeira', 'Uchoa', 'Vieira', 'Wagner', 'Xavier', 'Yamamoto', 'Zanetti',
];
const CITIES = [
  ['São Paulo', 'SP'], ['Campinas', 'SP'], ['Curitiba', 'PR'], ['Florianópolis', 'SC'],
  ['Belo Horizonte', 'MG'], ['Porto Alegre', 'RS'], ['Recife', 'PE'], ['Salvador', 'BA'],
  ['Brasília', 'DF'], ['Goiânia', 'GO'],
];
const ORDER_STATUSES = [
  'Aguardando pagamento', 'Pagamento concluído', 'Em produção', 'Produção Finalizada',
  'Adicionado no sistema', 'Enviado', 'Entregue', 'Cancelado',
];
const SERVICE_STATUSES = ['Aguardando Pagamento', 'Pagamento Concluído'];
const RECEPTION_STATUSES = ['waiting', 'waiting', 'waiting', 'done', 'waiting'];
const SERVICE_TAGS = ['retorno', 'teleconsulta', 'primeira-consulta', 'acompanhamento', 'presencial'];
const RECEPTION_TAGS = ['novo-contato', 'follow-up', 'agendamento', 'informação'];
const ORDER_TAGS = ['urgente', 'retirada', 'primeiro-pedido', 'demo'];
const TAG_CATALOG = [
  { tag: 'urgente', contexts: 'orders', color: '#C62828' },
  { tag: 'retirada', contexts: 'orders', color: '#1565C0' },
  { tag: 'primeiro-pedido', contexts: 'orders', color: '#2E7D32' },
  { tag: 'retorno', contexts: 'services', color: '#6A1B9A' },
  { tag: 'teleconsulta', contexts: 'services', color: '#00838F' },
  { tag: 'primeira-consulta', contexts: 'services', color: '#5a7a5b' },
  { tag: 'acompanhamento', contexts: 'services', color: '#7A5B7A' },
  { tag: 'presencial', contexts: 'services', color: '#c9a227' },
  { tag: 'novo-contato', contexts: 'reception', color: '#EF6C00' },
  { tag: 'follow-up', contexts: 'reception', color: '#455A64' },
  { tag: 'agendamento', contexts: 'reception', color: '#2e7d32' },
  { tag: 'informação', contexts: 'reception', color: '#1565c0' },
  { tag: 'demo', contexts: 'orders,services,reception', color: '#546E7A' },
];
const CIAP = ['A98', 'P76', 'L18', 'N01', 'R74', 'T90', 'K86'];
const GENDER_OPTIONS = [
  'homem-cis', 'mulher-cis', 'homem-trans', 'mulher-trans', 'travesti', 'nao-binario', 'outro',
];

/** Combinações canônicas do funil OSS (exclui patient).
 * Labels UI: Não preencheu · Apenas preencheu · Documentos enviados · Termo criado · Associado · Problema no cadastro.
 */
const ASSOCIATE_STATUS_KINDS = [
  { status: 'Associado', associate_status: 'concluido', invalid_fields: null },
  { status: 'Associado', associate_status: 'assinatura_termo', invalid_fields: null },
  { status: 'cadastro_criado', associate_status: 'cadastro_criado', invalid_fields: null },
  { status: 'cadastro_criado', associate_status: 'dados_pessoais', invalid_fields: null },
  { status: 'cadastro_criado', associate_status: 'documentos', invalid_fields: null },
  { status: 'cadastro_criado', associate_status: 'assinatura_termo', invalid_fields: null },
  {
    status: 'cadastro_criado',
    associate_status: 'dados_pessoais',
    invalid_fields: JSON.stringify(['associate_cpf', 'cep']),
  },
];

function pickAssociateStatusKind(i) {
  return ASSOCIATE_STATUS_KINDS[i % ASSOCIATE_STATUS_KINDS.length];
}

const PRODUCT_BASE = [
  { name: 'Linha CBD', sku: 'KNK-CBD', type: 'oil', unit: 'ml', concentration: 300, price: 247.9, category: 'cbd' },
  { name: 'Linha THC', sku: 'KNK-THC', type: 'oil', unit: 'ml', concentration: 100, price: 389.5, category: 'thc' },
  { name: 'Linha CBG', sku: 'KNK-CBG', type: 'oil', unit: 'ml', concentration: 200, price: 198.0, category: 'cbg' },
  { name: 'Linha CBC', sku: 'KNK-CBC', type: 'oil', unit: 'ml', concentration: 150, price: 312.4, category: 'cbc' },
  { name: 'Linha CBN', sku: 'KNK-CBN', type: 'oil', unit: 'ml', concentration: 250, price: 165.9, category: 'cbn' },
];

function uuid() {
  return crypto.randomUUID();
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function fakeCpf(n) {
  const base = String(90000000000 + (n % 8999999999)).padStart(11, '0');
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${base.slice(9)}`;
}

function fakePhone(n) {
  const ddd = 11 + (n % 80);
  const num = String(900000000 + (n % 100000000)).slice(-9);
  return `+55${ddd}${num}`;
}

function fakeCep(n) {
  const raw = String(10000000 + (n % 89999999)).padStart(8, '0');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - Math.abs(n));
  return d.toISOString();
}

function dateOnlyDaysAgo(n) {
  return daysAgo(n).slice(0, 10);
}

function serializeValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function quoteCol(name) {
  return QUOTED.has(name) ? `"${name}"` : name;
}

function parseArgs(argv) {
  const out = {
    profile: manifest.defaults.profile,
    batchSize: manifest.defaults.batchSize,
    patientRatio: manifest.defaults.patientRatio,
    noTruncate: false,
    yes: false,
    overrides: {},
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--no-truncate') out.noTruncate = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg.startsWith('--profile=')) out.profile = arg.slice('--profile='.length);
    else if (arg.startsWith('--batch=')) out.batchSize = Math.max(25, Number(arg.slice('--batch='.length)) || 250);
    else if (arg.startsWith('--patient-ratio=')) {
      out.patientRatio = Math.min(0.5, Math.max(0, Number(arg.slice('--patient-ratio='.length)) || 0.2));
    } else {
      const m = arg.match(/^--(users|orders|services|reception|institutional_clients|professionals|products|tags|files|reports)=(\d+)$/);
      if (m) out.overrides[m[1]] = Number(m[2]);
    }
  }
  return out;
}

function resolveCounts(args) {
  const profile = manifest.profiles[args.profile];
  if (!profile) {
    throw new Error(`Perfil inválido: ${args.profile}. Use: ${Object.keys(manifest.profiles).join(', ')}`);
  }
  const { description, ...counts } = profile;
  return {
    description,
    counts: { ...counts, ...args.overrides },
  };
}

async function truncateAll(client) {
  await client.query(`
    TRUNCATE TABLE
      orders_files, services_files, users_files,
      orders, services, reception, reports, tags, products, institutional_clients,
      professionals,
      users, users_api, files
    RESTART IDENTITY CASCADE
  `);
  console.log('Tabelas truncadas (system_users preservada — operadores não são seed)');
}

async function insertBatch(client, table, columns, rows) {
  if (!rows.length) return [];
  const colSql = columns.map(quoteCol).join(', ');
  const values = [];
  const tuples = rows.map((row) => {
    const ph = columns.map((col) => {
      values.push(serializeValue(row[col]));
      return `$${values.length}`;
    });
    return `(${ph.join(',')})`;
  });
  const sql = `INSERT INTO ${table} (${colSql}) VALUES ${tuples.join(',')} RETURNING id`;
  const result = await client.query(sql, values);
  return result.rows.map((r) => r.id);
}

async function insertBatches(client, table, columns, buildRow, total, batchSize, label) {
  const ids = [];
  const t0 = Date.now();
  for (let start = 0; start < total; start += batchSize) {
    const end = Math.min(start + batchSize, total);
    const chunk = [];
    for (let i = start; i < end; i++) chunk.push(buildRow(i));
    const batchIds = await insertBatch(client, table, columns, chunk);
    ids.push(...batchIds);
    if (end === total || end % (batchSize * 4) < batchSize) {
      process.stdout.write(`\r  ${label}: ${end}/${total}`);
    }
  }
  const ms = Date.now() - t0;
  console.log(`\r  ${label}: ${total}/${total} (${ms}ms)          `);
  return ids;
}

async function seedLoad(counts, { truncate, batchSize, patientRatio }) {
  const { resolvePgUrl } = require('../src/config/env');
  const databaseUrl = resolvePgUrl();
  if (!databaseUrl) throw new Error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) is required');

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const associateCount = Math.max(1, Math.floor(counts.users * (1 - patientRatio)));
  const patientCount = counts.users - associateCount;
  const userCodes = Array.from({ length: counts.users }, () => uuid());
  const associateCodes = userCodes.slice(0, associateCount);
  const professionalCodes = Array.from({ length: counts.professionals }, () => uuid());

  const products = Array.from({ length: counts.products }, (_, i) => {
    const base = pick(PRODUCT_BASE, i);
    const variant = Math.floor(i / PRODUCT_BASE.length) + 1;
    const sku = variant === 1 ? base.sku : `${base.sku}-V${variant}`;
    return {
      ...base,
      sku,
      name: variant === 1 ? base.name : `${base.name} v${variant}`,
      amount: 10 + (i % 6),
      batch: `LOAD-${1000 + i}`,
    };
  });

  try {
    await client.query('BEGIN');
    if (truncate) await truncateAll(client);

    // files
    const fileRows = Array.from({ length: counts.files }, (_, i) => ({
      id: uuid(),
      filename: `load-doc-${String(i + 1).padStart(4, '0')}.pdf`,
      mime_type: 'application/pdf',
      storage_path: `sample-data/assets/load-doc-${String(i + 1).padStart(4, '0')}.pdf`,
      storage_driver: 'local',
      storage_key: `load-doc-${String(i + 1).padStart(4, '0')}.pdf`,
      created_at: daysAgo(30 - (i % 30)),
      is_sample: true,
    }));
    await insertBatch(client, 'files', [
      'id', 'filename', 'mime_type', 'storage_path', 'storage_driver', 'storage_key', 'created_at', 'is_sample',
    ], fileRows);
    console.log(`  files: ${fileRows.length}`);

    // users
    const userCols = [
      'status', 'sort', 'date_created', 'date_updated', 'associate_name', 'associate_last_name',
      'gender', 'nationality', 'associate_rg_issuer', 'marital_status', 'street',
      'street_number', 'complement', 'neighborhood', 'proof_of_address', 'reason_treatment_text',
      'responsible_type', 'city', 'state', 'cep', 'email_account', 'account_password', 'user_code',
      'rg_proof', 'associate_cpf', 'associate_rg', 'mobile_number', 'associate_status', 'prescription',
      'responsible_code', 'documents_folder_id', 'rg_patient_proof', 'patient_user_code',
      'adhesion_term', 'invalid_fields', 'ciap_codes', 'associate_birth_date', 'preferred_products', 'date_prescription',
      'created_date', 'avatar_url', 'prescriber', 'delivery_address', 'prescriber_code',
      'session_token', 'session_expires', 'last_activity', 'is_session_active', 'fullname', 'is_sample',
    ];

    const userIds = await insertBatches(
      client,
      'users',
      userCols,
      (i) => {
        const isPatient = i >= associateCount;
        const first = pick(FIRST_NAMES, i);
        const last = pick(LAST_NAMES, i * 3);
        const [city, state] = pick(CITIES, i);
        const product = products[i % products.length];
        const proCode = professionalCodes[i % professionalCodes.length];
        const responsibleIdx = isPatient ? (i - associateCount) % associateCount : null;
        const patientIdx = !isPatient && i < patientCount ? associateCount + i : null;
        const kind = isPatient
          ? { status: 'patient', associate_status: null, invalid_fields: null }
          : pickAssociateStatusKind(i);
        const isAssociado = kind.status === 'Associado';

        return {
          status: kind.status,
          sort: i + 1,
          date_created: daysAgo(400 - (i % 365)),
          date_updated: daysAgo(i % 60),
          associate_name: first,
          associate_last_name: last,
          gender: pick(GENDER_OPTIONS, i),
          nationality: 'Brasileira',
          associate_rg_issuer: pick(['SSP/SP', 'SSP/PR', 'SSP/MG', 'SSP/RS'], i),
          marital_status: pick(['solteiro', 'casado', 'união estável', 'divorciado'], i),
          street: `Rua Load ${100 + (i % 9000)}`,
          street_number: String(10 + (i % 990)),
          complement: i % 3 === 0 ? `Apto ${i % 200}` : 'Casa',
          neighborhood: pick(['Centro', 'Jardim', 'Vila Norte', 'Industrial'], i),
          proof_of_address: `proof-${i + 1}.pdf`,
          reason_treatment_text: 'Motivo fictício para teste de carga.',
          responsible_type: isPatient ? 'paciente' : patientIdx != null ? 'another' : pick(['titular', 'responsável'], i),
          city,
          state,
          cep: fakeCep(i + 1),
          email_account: `load${String(i + 1).padStart(6, '0')}@load.kunk.local`,
          account_password: null,
          user_code: userCodes[i],
          rg_proof: `rg-${i + 1}.pdf`,
          associate_cpf: fakeCpf(i + 1),
          associate_rg: `${1000000 + i}`,
          mobile_number: fakePhone(i + 1),
          associate_status: kind.associate_status,
          prescription: `rx-${i + 1}.pdf`,
          responsible_code: isPatient ? userCodes[responsibleIdx] : null,
          documents_folder_id: `docs-${i + 1}`,
          rg_patient_proof: `rg-p-${i + 1}.pdf`,
          patient_user_code: patientIdx != null ? userCodes[patientIdx] : null,
          adhesion_term: isAssociado ? uuid() : null,
          invalid_fields: kind.invalid_fields,
          ciap_codes: `${pick(CIAP, i)};${pick(CIAP, i + 3)}`,
          associate_birth_date: `19${70 + (i % 30)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
          preferred_products: product.sku,
          date_prescription: dateOnlyDaysAgo(20 + (i % 40)),
          created_date: daysAgo(400 - (i % 365)),
          avatar_url: null,
          prescriber: `Dr Load ${(i % 50) + 1}`,
          delivery_address: {
            street: `Rua Load ${100 + (i % 9000)}`,
            number: String(10 + (i % 990)),
            city,
            state,
            cep: fakeCep(i + 1),
            country: 'BR',
          },
          prescriber_code: String(proCode),
          session_token: null,
          session_expires: null,
          last_activity: daysAgo(i % 30),
          is_session_active: false,
          fullname: `${first} ${last}`,
          is_sample: true,
        };
      },
      counts.users,
      batchSize,
      'users'
    );

    // institutional_clients
    await insertBatches(
      client,
      'institutional_clients',
      [
        'client_code', 'status', 'sort', 'date_created', 'date_updated', 'is_company',
        'company_name', 'company_trade_name', 'company_cnpj', 'company_email', 'company_phone',
        'representative_name', 'representative_last_name', 'representative_cpf',
        'representative_email', 'representative_mobile', 'street', 'street_number',
        'complement', 'neighborhood', 'city', 'state', 'cep', 'delivery_address', 'is_sample',
      ],
      (i) => {
        const first = pick(FIRST_NAMES, i + 2);
        const last = pick(LAST_NAMES, i + 4);
        const [city, state] = pick(CITIES, i);
        const isCompany = i % 2 === 0;
        return {
          client_code: uuid(),
          status: i % 11 === 0 ? 'inactive' : 'active',
          sort: i + 1,
          date_created: daysAgo(80 - (i % 60)),
          date_updated: daysAgo(i % 20),
          is_company: isCompany,
          company_name: isCompany ? `Instituição Load ${i + 1}` : null,
          company_trade_name: isCompany ? `Load ${i + 1}` : null,
          company_cnpj: isCompany ? `${String(10000000000000 + i).slice(0, 14)}` : null,
          company_email: isCompany ? `inst-load${String(i + 1).padStart(4, '0')}@load.kunk.local` : null,
          company_phone: isCompany ? fakePhone(3000 + i) : null,
          representative_name: first,
          representative_last_name: last,
          representative_cpf: fakeCpf(3000 + i),
          representative_email: `rep-load${String(i + 1).padStart(4, '0')}@load.kunk.local`,
          representative_mobile: fakePhone(3100 + i),
          street: `Av Institucional ${i + 1}`,
          street_number: String(100 + (i % 900)),
          complement: i % 3 === 0 ? `Sala ${i % 50}` : null,
          neighborhood: pick(['Centro', 'Jardim', 'Industrial'], i),
          city,
          state,
          cep: fakeCep(3000 + i),
          delivery_address: {
            street: `Av Institucional ${i + 1}`,
            number: String(100 + (i % 900)),
            city,
            state,
            cep: fakeCep(3000 + i),
            country: 'BR',
          },
          is_sample: true,
        };
      },
      counts.institutional_clients,
      batchSize,
      'institutional_clients'
    );

    // professionals
    await insertBatches(
      client,
      'professionals',
      [
        'sort', 'date_created', 'name', 'last_name', 'type', 'services_description', 'phone',
        'state', 'city', 'cpf', 'email', 'specialty', 'active', 'is_prescriber', 'is_collaborator',
        'professional_code', 'fingerprint', 'contest_reports', 'met_us', 'recipient_id',
        'donation_balance', 'calendar_id', 'is_sample',
      ],
      (i) => {
        const first = pick(FIRST_NAMES, i + 11);
        const last = pick(LAST_NAMES, i + 13);
        const [city, state] = pick(CITIES, i);
        return {
          sort: i + 1,
          date_created: daysAgo(45 - (i % 40)),
          name: first,
          last_name: last,
          type: i % 3 === 0 ? 'medic' : 'therapist',
          services_description: 'Atendimento clínico load-test',
          phone: fakePhone(4000 + i),
          state,
          city,
          cpf: fakeCpf(4000 + i),
          email: `pro-load${String(i + 1).padStart(4, '0')}@load.kunk.local`,
          specialty: pick(['clínica geral', 'psiquiatria', 'dor', 'neurologia', 'integrativa'], i),
          active: 1,
          is_prescriber: i % 2 === 0 ? 'true' : 'false',
          is_collaborator: i < 10 ? 'true' : 'false',
          professional_code: professionalCodes[i],
          fingerprint: `fp-load-${i + 1}`,
          contest_reports: { demo: true },
          met_us: pick(['indicação', 'evento', 'site', 'parceiro'], i),
          recipient_id: `rcp-load-${i + 1}`,
          donation_balance: 50 * ((i % 20) + 1),
          calendar_id: `cal-load-${i + 1}`,
          is_sample: true,
        };
      },
      counts.professionals,
      batchSize,
      'professionals'
    );

    // products
    await insertBatches(
      client,
      'products',
      [
        'status', 'sort', 'date_created', 'date_updated', 'name', 'sku', 'type', 'unit',
        'concentration', 'price', 'category', 'amount', 'batch', 'is_sample',
      ],
      (i) => {
        const p = products[i];
        return {
          status: 'published',
          sort: i + 1,
          date_created: daysAgo(90 - (i % 60)),
          date_updated: daysAgo(i % 15),
          name: p.name,
          sku: p.sku,
          type: p.type,
          unit: p.unit,
          concentration: p.concentration,
          price: p.price,
          category: p.category,
          amount: p.amount,
          batch: p.batch,
          is_sample: true,
        };
      },
      counts.products,
      batchSize,
      'products'
    );

    // tags
    await insertBatches(
      client,
      'tags',
      ['tag', 'contexts', 'color', 'is_sample'],
      (i) => {
        const base = TAG_CATALOG[i % TAG_CATALOG.length];
        const cycle = Math.floor(i / TAG_CATALOG.length);
        return {
          tag: cycle === 0 ? base.tag : `${base.tag}-${cycle + 1}`,
          contexts: base.contexts,
          color: base.color,
          is_sample: true,
        };
      },
      counts.tags,
      batchSize,
      'tags'
    );

    // orders — só associados (não pacientes)
    await insertBatches(
      client,
      'orders',
      [
        'sort', 'date_created', 'date_updated', 'status', 'total', 'payment_method', 'tracking_code',
        'delivery_price', 'associate_name', 'order_code', 'user_code', 'items', 'created_date',
        'discount', 'details', 'donation', 'prescriber', 'payment_link', 'user', 'carrier_order_code',
        'payment_code', 'order_notes', 'tags', 'delivery_notes', 'address', 'whatsapp_message',
        'prescriber_code', 'payment_date', 'custom_payment', 'production_owner', 'tracking_code_date',
        'last_tracking_date', 'address_validation', 'created_by_user_code', 'is_sample',
      ],
      (i) => {
        const assocIdx = i % associateCount;
        const userId = userIds[assocIdx];
        const userCode = associateCodes[assocIdx];
        const first = pick(FIRST_NAMES, assocIdx);
        const last = pick(LAST_NAMES, assocIdx * 3);
        const fullname = `${first} ${last}`;
        const p1 = products[i % products.length];
        const qty = 1 + (i % 3);
        const delivery = 15 + (i % 5) * 3;
        const status = pick(ORDER_STATUSES, i);
        const paid = ['Pagamento concluído', 'Em produção', 'Produção Finalizada', 'Enviado', 'Entregue'].includes(status);
        const shipped = ['Enviado', 'Entregue'].includes(status);
        const items = [{
          sku: p1.sku,
          name: p1.name,
          quantity: qty,
          concentration_mg: p1.concentration,
          unit: p1.unit,
          price: p1.price,
          batch: p1.batch,
          category: p1.category,
        }];
        const subtotal = p1.price * qty;
        const [city, state] = pick(CITIES, i);
        return {
          sort: i + 1,
          date_created: daysAgo(200 - (i % 180)),
          date_updated: daysAgo(i % 40),
          status,
          total: Math.round((subtotal + delivery) * 100) / 100,
          payment_method: pick(['pix', 'credit_card', 'boleto'], i),
          tracking_code: shipped ? `BRLOAD${100000 + i}` : `PENDING-${100000 + i}`,
          delivery_price: delivery,
          associate_name: fullname,
          order_code: uuid(),
          user_code: String(userCode),
          items,
          created_date: daysAgo(200 - (i % 180)),
          discount: i % 7 === 0 ? 10 : 0,
          details: 'Pedido fictício (load test).',
          donation: i % 4 === 0 ? 20 : 0,
          prescriber: `Dr Load ${(i % 50) + 1}`,
          payment_link: `https://pay.demo.kunk.local/o/load/${i + 1}`,
          user: userId,
          carrier_order_code: shipped ? `CARRIER-${7000 + i}` : null,
          payment_code: paid ? `PAY-${8000 + i}` : null,
          order_notes: 'Obs load-test',
          tags: [pick(ORDER_TAGS, i), ...(i % 3 === 0 ? ['urgente'] : [])].filter(
            (t, idx, arr) => arr.indexOf(t) === idx
          ),
          delivery_notes: shipped ? 'Horário comercial' : 'Aguardando',
          address: { street: `Rua Load ${assocIdx}`, city, state, cep: fakeCep(assocIdx), country: 'BR' },
          whatsapp_message: 'Msg load',
          prescriber_code: String(professionalCodes[i % professionalCodes.length]),
          payment_date: paid ? daysAgo(40 - (i % 30)) : null,
          custom_payment: { method: paid ? 'pix' : 'pending', gateway: 'demo' },
          production_owner: null,
          tracking_code_date: shipped ? daysAgo(10 - (i % 8)) : null,
          last_tracking_date: shipped ? daysAgo(5 - (i % 4)) : null,
          address_validation: null,
          created_by_user_code: 'KNK-ADMIN',
          is_sample: true,
        };
      },
      counts.orders,
      batchSize,
      'orders'
    );

    // services
    await insertBatches(
      client,
      'services',
      [
        'sort', 'type', 'date_created', 'name', 'professional_id', 'status', 'price',
        'associate_name', 'associate_user_code', 'associate_email', 'professional_name',
        'consultation_date', 'payment_link', 'price_paid', 'donation', 'booking_group_code',
        'patient_name', 'professional_email', 'service_code', 'observations', 'payment_type',
        'tags', 'created_by_user_code', 'payment_code', 'payment_info', 'is_sample',
      ],
      (i) => {
        const assocIdx = i % associateCount;
        const first = pick(FIRST_NAMES, assocIdx);
        const last = pick(LAST_NAMES, assocIdx * 3);
        const fullname = `${first} ${last}`;
        const status = pick(SERVICE_STATUSES, i);
        const price = 150 + (i % 5) * 50;
        const proIdx = i % counts.professionals;
        return {
          sort: i + 1,
          type: pick(['consulta', 'retorno', 'avaliação'], i),
          date_created: daysAgo(120 - (i % 100)),
          name: `Atendimento load #${i + 1}`,
          professional_id: professionalCodes[proIdx],
          status,
          price,
          associate_name: fullname,
          associate_user_code: associateCodes[assocIdx],
          associate_email: `load${String(assocIdx + 1).padStart(6, '0')}@load.kunk.local`,
          professional_name: `${pick(FIRST_NAMES, proIdx + 11)} ${pick(LAST_NAMES, proIdx + 13)}`,
          consultation_date: daysAgo(60 - (i % 50)),
          payment_link: `https://pay.demo.kunk.local/s/load/${i + 1}`,
          price_paid: status === 'Pagamento Concluído' ? price : 0,
          donation: i % 5 === 0 ? 30 : 0,
          booking_group_code: uuid(),
          patient_name: fullname,
          professional_email: `pro-load${String(proIdx + 1).padStart(4, '0')}@load.kunk.local`,
          service_code: uuid(),
          observations: 'Agendamento fictício (load test).',
          payment_type: pick(['pix', 'credit_card', 'cash'], i),
          tags: [
            { tag: pick(SERVICE_TAGS, i) },
            ...(i % 4 === 0 ? [{ tag: pick(SERVICE_TAGS, i + 2) }] : []),
          ].filter((t, idx, arr) => arr.findIndex((x) => x.tag === t.tag) === idx),
          created_by_user_code: 'KNK-ACOL',
          payment_code: `SVCPAY-LOAD-${i + 1}`,
          payment_info: { demo: true, paid: status === 'Pagamento Concluído' },
          is_sample: true,
        };
      },
      counts.services,
      batchSize,
      'services'
    );

    // reception
    await insertBatches(
      client,
      'reception',
      [
        'date_created', 'name', 'last_name', 'email', 'phone', 'help_topic',
        'is_associate', 'message', 'code', 'chat_id', 'status', 'associate_name',
        'associate_code', 'date_updated', 'patient_name', 'attendant', 'tags',
        'completion_reason', 'is_prescriber', 'full_name', 'is_sample',
      ],
      (i) => {
        const first = pick(FIRST_NAMES, i + 5);
        const last = pick(LAST_NAMES, i + 9);
        const status = pick(RECEPTION_STATUSES, i);
        const linked = i % 3 === 0;
        const assocIdx = i % associateCount;
        const assocName = `${pick(FIRST_NAMES, assocIdx)} ${pick(LAST_NAMES, assocIdx * 3)}`;
        return {
          date_created: daysAgo(90 - (i % 80)),
          name: first,
          last_name: last,
          email: `reception-load${String(i + 1).padStart(5, '0')}@load.kunk.local`,
          phone: fakePhone(5000 + i),
          help_topic: pick(['informação', 'cadastro', 'agendamento'], i),
          is_associate: linked ? 'true' : 'false',
          message: 'Contato fictício de acolhimento (load test).',
          code: uuid(),
          chat_id: `chat-load-${i + 1}`,
          status,
          associate_name: linked ? assocName : `${first} ${last}`,
          associate_code: linked ? String(associateCodes[assocIdx]) : null,
          date_updated: daysAgo(i % 20),
          patient_name: i % 2 === 0 ? `${first} ${last}` : assocName,
          attendant: i % 2 === 0 ? 'Lia Acolhimento' : 'Admin Demo',
          tags: [{ tag: pick(RECEPTION_TAGS, i) }],
          completion_reason: status === 'done' ? 'Atendido' : null,
          is_prescriber: i % 4 === 0 ? 'true' : 'false',
          full_name: `${first} ${last}`,
          is_sample: true,
        };
      },
      counts.reception,
      batchSize,
      'reception'
    );

    // reports
    await insertBatches(
      client,
      'reports',
      [
        'date_created', 'date_updated', 'name', 'report_code', 'query_config', 'sql_query',
        'type', 'dashboard_queries', 'layout_positions', 'chart_config', 'created_by', 'tags',
        'column_maps', 'embedded_report_codes', 'favorites', 'is_sample',
      ],
      (i) => ({
        date_created: daysAgo(10 - (i % 8)),
        date_updated: daysAgo(i % 5),
        name: `Relatório load #${i + 1}`,
        report_code: uuid(),
        query_config: { source: pick(['orders', 'users', 'services'], i), group_by: 'status' },
        sql_query: '-- load sample only',
        type: 'table',
        dashboard_queries: { load: true },
        layout_positions: { x: (i % 6) * 2, y: Math.floor(i / 6) * 4, w: 6, h: 4 },
        chart_config: { type: pick(['bar', 'pie', 'line'], i) },
        created_by: SAMPLE_CREATED_BY,
        tags: [{ tag: 'demo' }],
        column_maps: { status: 'Status', count: 'Total' },
        embedded_report_codes: [],
        favorites: { users: [] },
        is_sample: true,
      }),
      counts.reports,
      batchSize,
      'reports'
    );

    await client.query('COMMIT');

    const summary = await client.query(`
      SELECT 'users' AS t, COUNT(*)::int AS c FROM users
      UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
      UNION ALL SELECT 'services', COUNT(*)::int FROM services
      UNION ALL SELECT 'reception', COUNT(*)::int FROM reception
      UNION ALL SELECT 'institutional_clients', COUNT(*)::int FROM institutional_clients
      UNION ALL SELECT 'professionals', COUNT(*)::int FROM professionals
      UNION ALL SELECT 'products', COUNT(*)::int FROM products
      UNION ALL SELECT 'tags', COUNT(*)::int FROM tags
      UNION ALL SELECT 'files', COUNT(*)::int FROM files
      UNION ALL SELECT 'reports', COUNT(*)::int FROM reports
      ORDER BY t
    `);
    console.log('\nContagens no banco:');
    for (const r of summary.rows) console.log(`  ${r.t}: ${r.c}`);
    console.log(`  (associados: ${associateCount}, pacientes: ${patientCount})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const { description, counts } = resolveCounts(args);

  console.log('Sample data MASSIVO (teste de carga)');
  console.log(`Perfil: ${args.profile} — ${description}`);
  console.log('Volumes:', counts);
  console.log(`Batch: ${args.batchSize} | patientRatio: ${args.patientRatio}`);
  console.log(`Truncate: ${!args.noTruncate}`);

  if ((args.profile === 'large' || args.profile === 'xlarge') && !args.yes) {
    console.error('\nPerfis large/xlarge exigem --yes para confirmar (pode demorar e usar muita RAM/CPU).');
    console.error('Ex.: npm run seed:load -- --profile=large --yes');
    process.exit(1);
  }

  const t0 = Date.now();
  await seedLoad(counts, {
    truncate: !args.noTruncate,
    batchSize: args.batchSize,
    patientRatio: args.patientRatio,
  });
  console.log(`\nConcluído em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('Sample de carga instalado (sem operadores, sem senha de associado).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
