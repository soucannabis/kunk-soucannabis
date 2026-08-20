'use strict';

/**
 * Gera e grava sample data fictício com TODOS os campos do target-schema.sql.
 *
 * Uso:
 *   node sample-data/seed.js
 *   node sample-data/seed.js --generate
 *   node sample-data/seed.js --no-truncate
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const manifest = require('./manifest.json');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
/** Sample preenche listas; associado e token de API ficam sem senha/credencial. */
const SAMPLE_CREATED_BY = 'sample-seed';

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
/** Alinhado a triage.statuses OSS (`waiting` / `done`). */
const RECEPTION_STATUSES = ['waiting', 'waiting', 'waiting', 'done', 'waiting'];
const CIAP = ['A98', 'P76', 'L18', 'N01', 'R74', 'T90', 'K86'];
/** Alinhado a GENDER_OPTIONS em @kunk/forms (GenderSelect do cadastramento). */
const GENDER_OPTIONS = [
  'homem-cis',
  'mulher-cis',
  'homem-trans',
  'mulher-trans',
  'travesti',
  'nao-binario',
  'outro',
];

/**
 * Combinações canônicas de `status` + `associate_status` (+ invalid_fields)
 * alinhadas ao funil OSS / filtros da lista de associados.
 * Labels UI: Não preencheu · Apenas preencheu · Documentos enviados · Termo criado · Associado · Problema no cadastro.
 * Pacientes (`status=patient`) ficam fora desta lista.
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

const PRODUCT_CATALOG = [
  { name: 'Linha CBD', sku: 'KNK-CBD', type: 'oil', unit: 'ml', concentration: 300, price: 247.9, category: 'cbd', amount: 12 },
  { name: 'Linha THC', sku: 'KNK-THC', type: 'oil', unit: 'ml', concentration: 100, price: 389.5, category: 'thc', amount: 14 },
  { name: 'Linha CBG', sku: 'KNK-CBG', type: 'oil', unit: 'ml', concentration: 200, price: 198.0, category: 'cbg', amount: 11 },
  { name: 'Linha CBC', sku: 'KNK-CBC', type: 'oil', unit: 'ml', concentration: 150, price: 312.4, category: 'cbc', amount: 15 },
  { name: 'Linha CBN', sku: 'KNK-CBN', type: 'oil', unit: 'ml', concentration: 250, price: 165.9, category: 'cbn', amount: 10 },
];

/** Colunas que precisam de aspas no SQL */
const QUOTED = new Set(['user']);

function uuid() {
  return crypto.randomUUID();
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function fakeCpf(n) {
  const base = String(90000000000 + n).padStart(11, '0');
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${base.slice(9)}`;
}

function fakePhone(n) {
  const ddd = 11 + (n % 80);
  const num = String(900000000 + n).slice(-9);
  return `+55${ddd}${num}`;
}

function fakeCep(n) {
  const raw = String(10000000 + (n % 89999999)).padStart(8, '0');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function dateOnlyDaysAgo(n) {
  return daysAgo(n).slice(0, 10);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function quoteCol(name) {
  return QUOTED.has(name) ? `"${name}"` : name;
}

function serializeValue(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

async function buildDataset(countsOverride = null) {
  const counts = { ...manifest.counts, ...(countsOverride || {}) };

  const files = Array.from({ length: counts.files }, (_, i) => ({
    id: uuid(),
    filename: `demo-doc-${String(i + 1).padStart(2, '0')}.pdf`,
    mime_type: 'application/pdf',
    storage_path: `sample-data/assets/demo-doc-${String(i + 1).padStart(2, '0')}.pdf`,
    created_at: daysAgo(30 - i),
  }));

  const professionals = Array.from({ length: counts.professionals }, (_, i) => {
    const first = pick(FIRST_NAMES, i + 11);
    const last = pick(LAST_NAMES, i + 13);
    const [city, state] = pick(CITIES, i);
    return {
      sort: i + 1,
      date_created: daysAgo(45 - i),
      name: first,
      last_name: last,
      type: i % 3 === 0 ? 'medic' : 'therapist',
      services_description: 'Atendimento clínico demo Kunk OSS',
      phone: fakePhone(300 + i),
      state,
      city,
      cpf: fakeCpf(300 + i),
      email: `pro${String(i + 1).padStart(2, '0')}@demo.kunk.local`,
      specialty: pick(['clínica geral', 'psiquiatria', 'dor', 'neurologia', 'integrativa'], i),
      active: 1,
      is_prescriber: i % 2 === 0 ? 'true' : 'false',
      is_collaborator: i < 4 ? 'true' : 'false',
      professional_code: uuid(),
      fingerprint: `fp-demo-${i + 1}`,
      contest_reports: { demo: true, specialty_rank: i + 1 },
      met_us: pick(['indicação', 'evento', 'site', 'parceiro'], i),
      recipient_id: `rcp-demo-${i + 1}`,
      donation_balance: 50 * (i + 1),
      calendar_id: `cal-demo-${i + 1}`,
    };
  });

  const products = PRODUCT_CATALOG.slice(0, counts.products).map((p, i) => ({
    status: 'published',
    sort: i + 1,
    user_created: uuid(),
    date_created: daysAgo(90 - i),
    user_updated: uuid(),
    date_updated: daysAgo(i % 20),
    name: p.name,
    sku: p.sku,
    type: p.type,
    unit: p.unit,
    concentration: p.concentration,
    price: p.price,
    amount: p.amount,
    category: p.category,
    photo: files[i % files.length].id,
    batch: `LOT-DEMO-${String(i + 1).padStart(3, '0')}`,
  }));

  const tags = [
    { tag: 'urgente', contexts: 'orders', color: '#C62828' },
    { tag: 'retirada', contexts: 'orders', color: '#1565C0' },
    { tag: 'primeiro-pedido', contexts: 'orders', color: '#2E7D32' },
    { tag: 'retorno', contexts: 'services', color: '#6A1B9A' },
    { tag: 'teleconsulta', contexts: 'services', color: '#00838F' },
    { tag: 'novo-contato', contexts: 'reception', color: '#EF6C00' },
    { tag: 'follow-up', contexts: 'reception', color: '#455A64' },
    { tag: 'demo', contexts: 'orders,services,reception', color: '#546E7A' },
  ].slice(0, counts.tags);

  const users = Array.from({ length: counts.users }, (_, i) => {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i * 3);
    const [city, state] = pick(CITIES, i);
    const pro = professionals[i % professionals.length];
    const userCode = uuid();
    const isPatientLink = i >= 80;
    const product = products[i % products.length];
    const kind = isPatientLink
      ? { status: 'patient', associate_status: null, invalid_fields: null }
      : pickAssociateStatusKind(i);
    const isAssociado = kind.status === 'Associado';

    return {
      status: kind.status,
      sort: i + 1,
      date_created: daysAgo(100 - (i % 90)),
      date_updated: daysAgo(i % 30),
      associate_name: first,
      associate_last_name: last,
      gender: pick(GENDER_OPTIONS, i),
      nationality: 'Brasileira',
      associate_rg_issuer: pick(['SSP/SP', 'SSP/PR', 'SSP/MG', 'SSP/RS'], i),
      marital_status: pick(['solteiro', 'casado', 'união estável', 'divorciado'], i),
      street: `Rua Demo ${100 + i}`,
      street_number: String(10 + (i % 90)),
      complement: i % 3 === 0 ? `Apto ${i + 1}` : `Casa`,
      neighborhood: pick(['Centro Demo', 'Jardim Sample', 'Vila Teste', 'Bairro Norte'], i),
      proof_of_address: `proof-address-${i + 1}.pdf`,
      reason_treatment_text: 'Motivo de tratamento fictício para sample-data (sem dado clínico real).',
      responsible_type: isPatientLink ? 'paciente' : pick(['titular', 'responsável'], i),
      city,
      state,
      cep: fakeCep(i + 1),
      email_account: `associate${String(i + 1).padStart(3, '0')}@demo.kunk.local`,
      account_password: null,
      user_code: userCode,
      rg_proof: `rg-proof-${i + 1}.pdf`,
      associate_cpf: fakeCpf(i + 1),
      associate_rg: `${String(1000000 + i)}`,
      mobile_number: fakePhone(i + 1),
      associate_status: kind.associate_status,
      invalid_fields: kind.invalid_fields,
      prescription: `prescription-${i + 1}.pdf`,
      documents_folder_id: `docs-user-${i + 1}`,
      rg_patient_proof: isPatientLink ? `rg-patient-${i + 1}.pdf` : `rg-self-${i + 1}.pdf`,
      adhesion_term: isAssociado ? uuid() : null,
      ciap_codes: `${pick(CIAP, i)};${pick(CIAP, i + 3)}`,
      associate_birth_date: `19${70 + (i % 30)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      preferred_products: product.sku,
      date_prescription: dateOnlyDaysAgo(20 + (i % 40)),
      created_date: daysAgo(100 - (i % 90)),
      avatar_url: `https://cdn.demo.kunk.local/avatars/user-${i + 1}.png`,
      prescriber: `${pro.name} ${pro.last_name}`,
      delivery_address: {
        street: `Rua Demo ${100 + i}`,
        number: String(10 + (i % 90)),
        complement: i % 3 === 0 ? `Apto ${i + 1}` : 'Sem complemento',
        neighborhood: 'Centro Demo',
        city,
        state,
        cep: fakeCep(i + 1),
        country: 'BR',
      },
      prescriber_code: String(pro.professional_code),
      session_token: null,
      session_expires: null,
      last_activity: daysAgo(i % 14),
      is_session_active: false,
      fullname: `${first} ${last}`,
      patient_user_code: null,
      responsible_code: null,
    };
  });

  for (let i = 80; i < Math.min(100, users.length); i++) {
    const responsible = users[i - 80];
    if (!users[i] || !responsible) break;
    users[i].status = 'patient';
    users[i].responsible_type = 'paciente';
    users[i].responsible_code = responsible.user_code;
    users[i].patient_user_code = null;
    users[i].associate_status = null;
    users[i].invalid_fields = null;
    users[i].adhesion_term = null;
    responsible.patient_user_code = users[i].user_code;
    responsible.responsible_type = 'another';
  }

  const orders = Array.from({ length: counts.orders }, (_, i) => {
    const user = users[i % users.length];
    const pro = professionals[i % professionals.length];
    const p1 = products[i % products.length];
    const p2 = products[(i + 3) % products.length];
    const qty1 = 1 + (i % 3);
    const qty2 = i % 2 === 0 ? 1 : 0;
    const items = [
      {
        sku: p1.sku,
        name: p1.name,
        quantity: qty1,
        concentration_mg: p1.concentration,
        unit: p1.unit,
        price: p1.price,
        batch: p1.batch,
        category: p1.category,
      },
    ];
    if (qty2) {
      items.push({
        sku: p2.sku,
        name: p2.name,
        quantity: qty2,
        concentration_mg: p2.concentration,
        unit: p2.unit,
        price: p2.price,
        batch: p2.batch,
        category: p2.category,
      });
    }
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const delivery = 15 + (i % 5) * 3;
    const status = pick(ORDER_STATUSES, i);
    const paid = ['Pagamento concluído', 'Em produção', 'Produção Finalizada', 'Enviado', 'Entregue'].includes(status);
    const shipped = ['Enviado', 'Entregue'].includes(status);

    return {
      sort: i + 1,
      date_created: daysAgo(50 - (i % 45)),
      date_updated: daysAgo(i % 20),
      status,
      total: Math.round((subtotal + delivery) * 100) / 100,
      payment_method: pick(['pix', 'credit_card', 'boleto'], i),
      tracking_code: shipped ? `BRDEMO${100000 + i}` : `PENDING-${100000 + i}`,
      delivery_price: delivery,
      associate_name: user.fullname,
      order_code: uuid(),
      user_code: String(user.user_code),
      items,
      created_date: daysAgo(50 - (i % 45)),
      discount: i % 7 === 0 ? 10 : 0,
      details: 'Pedido demo sample-data com todos os campos preenchidos.',
      donation: i % 4 === 0 ? 20 : 0,
      prescriber: `${pro.name} ${pro.last_name}`,
      payment_link: `https://pay.demo.kunk.local/o/${i + 1}`,
      _user_index: i % users.length,
      carrier_order_code: shipped ? `CARRIER-${7000 + i}` : `CARRIER-PENDING-${7000 + i}`,
      payment_code: paid ? `PAY-${8000 + i}` : `PAY-PENDING-${8000 + i}`,
      order_notes: 'Observação interna fictícia do pedido.',
      tags: ['demo', ...(i % 3 === 0 ? ['urgente'] : [])],
      delivery_notes: shipped ? 'Entregar em horário comercial (demo).' : 'Aguardando despacho.',
      address: user.delivery_address,
      whatsapp_message: 'Mensagem WhatsApp fictícia do pedido demo.',
      prescriber_code: String(pro.professional_code),
      payment_date: paid ? daysAgo(40 - (i % 30)) : daysAgo(50),
      custom_payment: {
        method: paid ? 'pix' : 'pending',
        installments: paid ? 1 : 0,
        gateway: 'demo-gateway',
      },
      production_owner: null,
      tracking_code_date: shipped ? daysAgo(10 - (i % 8)) : daysAgo(50),
      last_tracking_date: shipped ? daysAgo(5 - (i % 4)) : daysAgo(50),
      address_validation: null,
      created_by_user_code: 'KNK-ADMIN',
    };
  });

  const services = Array.from({ length: counts.services }, (_, i) => {
    const user = users[i % users.length];
    const pro = professionals[i % professionals.length];
    const status = pick(SERVICE_STATUSES, i);
    const price = 150 + (i % 5) * 50;
    return {
      sort: i + 1,
      type: pick(['consulta', 'retorno', 'avaliação'], i),
      date_created: daysAgo(30 - (i % 25)),
      name: `Atendimento demo #${i + 1}`,
      professional_id: pro.professional_code,
      status,
      price,
      associate_name: user.fullname,
      associate_user_code: user.user_code,
      associate_email: user.email_account,
      professional_name: `${pro.name} ${pro.last_name}`,
      event_link: null,
      consultation_date: daysAgo(20 - (i % 15)),
      payment_link: `https://pay.demo.kunk.local/s/${i + 1}`,
      event_id: null,
      price_paid: status === 'Pagamento Concluído' ? price : 0,
      donation: i % 5 === 0 ? 30 : 0,
      booking_group_code: uuid(),
      patient_name: user.fullname,
      professional_email: pro.email,
      service_code: uuid(),
      observations: 'Agendamento fictício com campos completos (sample-data).',
      payment_type: pick(['pix', 'credit_card', 'cash'], i),
      tags: [{ tag: 'demo' }, { tag: 'teleconsulta' }],
      created_by_user_code: 'KNK-ACOL',
      payment_code: `SVCPAY-${i + 1}`,
      payment_info: {
        demo: true,
        gateway: 'demo-gateway',
        paid: status === 'Pagamento Concluído',
      },
    };
  });

  const reception = Array.from({ length: counts.reception }, (_, i) => {
    const first = pick(FIRST_NAMES, i + 5);
    const last = pick(LAST_NAMES, i + 9);
    const status = pick(RECEPTION_STATUSES, i);
    const user = users[i % users.length];
    return {
      date_created: daysAgo(20 - i),
      name: first,
      last_name: last,
      email: `reception${String(i + 1).padStart(2, '0')}@demo.kunk.local`,
      phone: fakePhone(400 + i),
      help_topic: pick(['informação', 'cadastro', 'agendamento'], i),
      is_associate: i % 3 === 0 ? 'true' : 'false',
      message: 'Contato fictício de acolhimento com todos os campos (sample-data).',
      code: uuid(),
      chat_id: `chat-demo-${i + 1}`,
      status,
      associate_name: i % 3 === 0 ? user.fullname : `${first} ${last}`,
      // associate_code só quando vinculado a um users.user_code real (nunca LEAD-*)
      associate_code: i % 3 === 0 ? String(user.user_code) : null,
      date_updated: daysAgo(10 - (i % 8)),
      avatar_url: `https://cdn.demo.kunk.local/avatars/reception-${i + 1}.png`,
      patient_name: i % 2 === 0 ? `${first} ${last}` : user.fullname,
      attendant: i % 2 === 0 ? 'Lia Acolhimento' : 'Admin Demo',
      tags: [{ tag: 'demo' }, { tag: 'novo-contato' }],
      completion_reason: status === 'done' ? 'Atendido' : null,
      is_prescriber: i % 4 === 0 ? 'true' : 'false',
      full_name: `${first} ${last}`,
    };
  });

  const reports = [
    {
      date_created: daysAgo(10),
      date_updated: daysAgo(1),
      name: 'Pedidos por status (demo)',
      report_code: uuid(),
      query_config: { source: 'orders', group_by: 'status' },
      sql_query: '-- sample only; execução livre bloqueada na API',
      type: 'table',
      dashboard_queries: { orders_by_status: true },
      layout_positions: { x: 0, y: 0, w: 6, h: 4 },
      chart_config: { type: 'bar', stacked: false },
      created_by: SAMPLE_CREATED_BY,
      tags: [{ tag: 'demo' }],
      column_maps: { status: 'Status', count: 'Total' },
      embedded_report_codes: [],
      favorites: { users: [] },
    },
    {
      date_created: daysAgo(9),
      date_updated: daysAgo(2),
      name: 'Associados ativos (demo)',
      report_code: uuid(),
      query_config: { source: 'users', filter: { status: 'active' } },
      sql_query: '-- sample only',
      type: 'table',
      dashboard_queries: { active_users: true },
      layout_positions: { x: 6, y: 0, w: 6, h: 4 },
      chart_config: { type: 'pie' },
      created_by: SAMPLE_CREATED_BY,
      tags: [{ tag: 'demo' }],
      column_maps: { fullname: 'Nome', status: 'Status' },
      embedded_report_codes: [],
      favorites: { users: [] },
    },
    {
      date_created: daysAgo(8),
      date_updated: daysAgo(3),
      name: 'Dashboard operacional (demo)',
      report_code: uuid(),
      query_config: { widgets: ['orders', 'services', 'reception'] },
      sql_query: '-- sample only',
      type: 'dashboard',
      dashboard_queries: { orders: true, services: true, reception: true },
      layout_positions: { x: 0, y: 4, w: 12, h: 6 },
      chart_config: { type: 'mixed' },
      created_by: SAMPLE_CREATED_BY,
      tags: [{ tag: 'demo' }],
      column_maps: {},
      embedded_report_codes: [],
      favorites: { users: [] },
    },
  ].slice(0, counts.reports);

  const users_api = [];

  const icFixturePath = path.join(FIXTURES_DIR, 'institutional_clients.json');
  const institutional_clients = (
    fs.existsSync(icFixturePath)
      ? JSON.parse(fs.readFileSync(icFixturePath, 'utf8'))
      : []
  )
    .slice(0, counts.institutional_clients || 10)
    .map((row, i) => ({
      ...row,
      date_created: row.date_created || daysAgo(20 - i),
      date_updated: row.date_updated || daysAgo(Math.max(0, 5 - i)),
    }));

  return {
    files,
    users,
    institutional_clients,
    professionals,
    products,
    tags,
    orders,
    services,
    reception,
    reports,
    users_api,
    _counts: counts,
  };
}

function markSampleRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => ({ ...row, is_sample: true }));
}

function writeFixtures(dataset) {
  ensureDir(FIXTURES_DIR);
  for (const [key, value] of Object.entries(dataset)) {
    if (key.startsWith('_') || !Array.isArray(value)) continue;
    const marked = markSampleRows(value);
    fs.writeFileSync(path.join(FIXTURES_DIR, `${key}.json`), JSON.stringify(marked, null, 2));
  }
  console.log(`Fixtures written to ${FIXTURES_DIR}`);
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
  console.log('Tables truncated (system_users preservada — operadores não são seed)');
}

async function insertObject(client, table, row, { returning = 'id' } = {}) {
  const payload = { ...row, is_sample: true };
  const entries = Object.entries(payload).filter(([k, v]) => !k.startsWith('_') && v !== undefined);
  const cols = entries.map(([k]) => quoteCol(k));
  const vals = entries.map(([, v]) => serializeValue(v));
  const ph = vals.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING ${returning}`;
  const result = await client.query(sql, vals);
  return result.rows[0];
}

async function seedDatabase(dataset, { truncate, writeFixtures: shouldWriteFixtures = true } = {}) {
  const { resolvePgUrl } = require('../src/config/env');
  const databaseUrl = resolvePgUrl();
  if (!databaseUrl) throw new Error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) is required');

  const counts = dataset._counts || manifest.counts;
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (truncate) await truncateAll(client);

    for (const f of dataset.files) {
      await insertObject(client, 'files', f, { returning: 'id' });
    }
    console.log(`files: ${dataset.files.length}`);

    const userIds = [];
    for (const row of dataset.users) {
      const inserted = await insertObject(client, 'users', row);
      userIds.push(inserted.id);
    }
    console.log(`users: ${userIds.length} (all columns)`);

    for (const row of dataset.institutional_clients || []) {
      await insertObject(client, 'institutional_clients', row);
    }
    console.log(`institutional_clients: ${(dataset.institutional_clients || []).length}`);

    for (const row of dataset.professionals) {
      await insertObject(client, 'professionals', row);
    }
    console.log(`professionals: ${dataset.professionals.length}`);

    for (const row of dataset.products) {
      await insertObject(client, 'products', row);
    }
    console.log(`products: ${dataset.products.length}`);

    for (const row of dataset.tags) {
      await insertObject(client, 'tags', row);
    }
    console.log(`tags: ${dataset.tags.length}`);

    const orderIds = [];
    for (const order of dataset.orders) {
      const payload = { ...order, user: userIds[order._user_index] };
      delete payload._user_index;
      const inserted = await insertObject(client, 'orders', payload);
      orderIds.push(inserted.id);
    }
    console.log(`orders: ${orderIds.length}`);

    const serviceIds = [];
    for (const row of dataset.services) {
      const inserted = await insertObject(client, 'services', row);
      serviceIds.push(inserted.id);
    }
    console.log(`services: ${serviceIds.length}`);

    for (const row of dataset.reception) {
      await insertObject(client, 'reception', row);
    }
    console.log(`reception: ${dataset.reception.length}`);

    for (const row of dataset.reports) {
      await insertObject(client, 'reports', row);
    }
    console.log(`reports: ${dataset.reports.length}`);

    for (const row of dataset.users_api) {
      await insertObject(client, 'users_api', row);
    }
    console.log(`users_api: ${dataset.users_api.length}`);

    const users_files = [];
    const usersFilesN = Math.min(counts.users_files || 0, userIds.length, dataset.files.length || 1);
    for (let i = 0; i < usersFilesN; i++) {
      const row = { user_id: userIds[i], file_id: dataset.files[i % dataset.files.length].id };
      users_files.push(row);
      await insertObject(client, 'users_files', row);
    }
    console.log(`users_files: ${users_files.length}`);

    const orders_files = [];
    const ordersFilesN = Math.min(counts.orders_files || 0, orderIds.length, dataset.files.length || 1);
    for (let i = 0; i < ordersFilesN; i++) {
      const row = { order_id: orderIds[i], file_id: dataset.files[i % dataset.files.length].id };
      orders_files.push(row);
      await insertObject(client, 'orders_files', row);
    }
    console.log(`orders_files: ${orders_files.length}`);

    const services_files = [];
    const servicesFilesN = Math.min(counts.services_files || 0, serviceIds.length, dataset.files.length || 1);
    for (let i = 0; i < servicesFilesN; i++) {
      const row = { service_id: serviceIds[i], file_id: dataset.files[i % dataset.files.length].id };
      services_files.push(row);
      await insertObject(client, 'services_files', row);
    }
    console.log(`services_files: ${services_files.length}`);

    if (shouldWriteFixtures) {
      ensureDir(FIXTURES_DIR);
      fs.writeFileSync(path.join(FIXTURES_DIR, 'users_files.json'), JSON.stringify(markSampleRows(users_files), null, 2));
      fs.writeFileSync(path.join(FIXTURES_DIR, 'orders_files.json'), JSON.stringify(markSampleRows(orders_files), null, 2));
      fs.writeFileSync(path.join(FIXTURES_DIR, 'services_files.json'), JSON.stringify(markSampleRows(services_files), null, 2));
    }
    // Validação: users deve ter todas as colunas do schema preenchidas (exceto id e session_*)
    const colCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    const sample = await client.query('SELECT * FROM users WHERE id = $1', [userIds[0]]);
    const row = sample.rows[0];
    const optionalEmpty = new Set([
      'invalid_fields',
      'annotations',
      'handbook',
      'responsible_code',
      'patient_user_code',
    ]);
    const missing = [];
    for (const { column_name: col } of colCheck.rows) {
      if (col === 'id') continue;
      if (optionalEmpty.has(col)) continue;
      if (row[col] === null || row[col] === undefined) missing.push(col);
    }
    if (missing.length) {
      console.warn(`Atenção: users ainda com NULL em: ${missing.join(', ')}`);
    } else {
      console.log('Validação users: campos preenchidos (sem invalid_fields, annotations, handbook).');
    }

    await client.query('COMMIT');

    const summary = await client.query(`
      SELECT 'users' AS t, COUNT(*)::int AS c FROM users
      UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
      UNION ALL SELECT 'institutional_clients', COUNT(*)::int FROM institutional_clients
      UNION ALL SELECT 'professionals', COUNT(*)::int FROM professionals
      UNION ALL SELECT 'products', COUNT(*)::int FROM products
      UNION ALL SELECT 'services', COUNT(*)::int FROM services
      UNION ALL SELECT 'reception', COUNT(*)::int FROM reception
      UNION ALL SELECT 'tags', COUNT(*)::int FROM tags
      UNION ALL SELECT 'reports', COUNT(*)::int FROM reports
      UNION ALL SELECT 'files', COUNT(*)::int FROM files
      ORDER BY t
    `);
    console.log('\nContagens no banco:');
    for (const r of summary.rows) console.log(`  ${r.t}: ${r.c}`);
    return Object.fromEntries(summary.rows.map((r) => [r.t, r.c]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Contagens reduzidas para instalação demo pós-bootstrap. */
const SMALL_COUNTS = {
  users: 12,
  institutional_clients: 2,
  professionals: 3,
  products: 5,
  tags: 4,
  orders: 8,
  services: 5,
  reception: 5,
  reports: 2,
  files: 3,
  users_files: 3,
  orders_files: 2,
  services_files: 2,
  users_api: 0,
};

/**
 * Instala sample data pequeno sem truncar (preserva system_users e logo da instalação).
 * Delega ao serviço da API (mesmo entrypoint do install-sample).
 */
async function seedSmallSample() {
  return require('../src/services/seedSmallSample').seedSmallSample();
}

async function main() {
  const args = process.argv.slice(2);
  const generateOnly = args.includes('--generate');
  const noTruncate = args.includes('--no-truncate');

  console.log('Building full-field fictional sample dataset…');
  const dataset = await buildDataset();

  ensureDir(FIXTURES_DIR);
  writeFixtures(dataset);

  const assetsDir = path.join(__dirname, 'assets');
  ensureDir(assetsDir);
  fs.writeFileSync(
    path.join(assetsDir, 'README.md'),
    '# Assets demo\n\nPaths em `files.storage_path` são placeholders.\n'
  );

  if (generateOnly) {
    console.log('Generate-only mode — banco não alterado.');
    return;
  }

  await seedDatabase(dataset, { truncate: !noTruncate, writeFixtures: true });
  console.log('\nSample data completo instalado (sem operadores, sem senha de associado, sem token de API).');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildDataset,
  seedDatabase,
  seedSmallSample,
  SMALL_COUNTS,
  ASSOCIATE_STATUS_KINDS,
  pickAssociateStatusKind,
};