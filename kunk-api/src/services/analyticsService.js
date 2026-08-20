'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const professionalTypesConfig = require('./professionalTypesConfig');

const GROUP_BY_ALLOWED = new Set(['day', 'week', 'month', 'year']);
const DEFAULT_GROUP_BY = 'month';
const RANKING_LIMIT = 20;

const AGE_BRACKETS = [
  { label: '0-17', min: 0, max: 18 },
  { label: '18-24', min: 18, max: 25 },
  { label: '25-34', min: 25, max: 35 },
  { label: '35-44', min: 35, max: 45 },
  { label: '45-54', min: 45, max: 55 },
  { label: '55-64', min: 55, max: 65 },
  { label: '65+', min: 65, max: null },
];

const BR_STATE_NAME_TO_UF = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

const COMPLETION_ORDER = new Set(['pedido', 'order', 'orders']);
const COMPLETION_SERVICE = new Set(['servico', 'serviço', 'service', 'services']);

function normalizeTextNoAccents(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeBrazilStateToUf(raw) {
  if (raw == null) return '';
  const original = String(raw).trim();
  if (!original) return '';
  const compact = original.toUpperCase().replace(/[^A-Z]/g, '');
  if (/^[A-Z]{2}$/.test(compact)) return compact;
  const key = normalizeTextNoAccents(original).replace(/\s+/g, ' ');
  return BR_STATE_NAME_TO_UF[key] || original.toUpperCase();
}

function normalizeGenderValue(raw) {
  const cleaned = raw == null ? '' : String(raw).trim();
  const key = cleaned.toLowerCase();
  if (!key) return 'Não Informado';
  if (['masculino', 'homem-cis', 'homem cis', 'sou homem', 'homem hetero', 'homem'].includes(key)) {
    return 'Homem Cis';
  }
  if (['mulher', 'mulher-cis', 'mulher cis', 'feminino'].includes(key)) {
    return 'Mulher Cis';
  }
  if (['mulher trans', 'mulher-trans'].includes(key)) return 'Mulher Trans';
  if (['homem trans', 'homem-trans'].includes(key)) return 'Homem Trans';
  if (['nao-binario', 'não binário', 'nao binario', 'mulher não binária', 'mulher nao binaria'].includes(key)) {
    return 'Não Binário';
  }
  if (['outro', 'homossexual'].includes(key)) return 'Outro';
  return cleaned;
}

function ageYearsFromBirth(birthDate, now = new Date()) {
  if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime())) return null;
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

function ageBracketLabel(age) {
  if (age == null) return 'Sem data';
  for (const b of AGE_BRACKETS) {
    if (b.max == null) {
      if (age >= b.min) return b.label;
    } else if (age >= b.min && age < b.max) {
      return b.label;
    }
  }
  return 'Sem data';
}

function parseListParam(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1, 0, 0, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function parsePeriod(queryParams = {}) {
  const defaults = defaultPeriod();
  let start = queryParams.start ? String(queryParams.start).slice(0, 10) : defaults.start;
  let end = queryParams.end ? String(queryParams.end).slice(0, 10) : defaults.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'start/end devem ser YYYY-MM-DD');
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  let groupBy = String(queryParams.group_by || DEFAULT_GROUP_BY).toLowerCase();
  if (!GROUP_BY_ALLOWED.has(groupBy)) groupBy = DEFAULT_GROUP_BY;
  return {
    start,
    end,
    group_by: groupBy,
    startTs: `${start}T00:00:00.000Z`,
    endTs: `${end}T23:59:59.999Z`,
  };
}

function tagsJsonExpr(column) {
  return `CASE
    WHEN jsonb_typeof(COALESCE(${column}, '[]'::jsonb)) = 'array' THEN COALESCE(${column}, '[]'::jsonb)
    ELSE '[]'::jsonb
  END`;
}

function pushTagsFilter(where, params, tags, column) {
  const list = parseListParam(tags);
  for (const tag of list) {
    where.push(`${tagsJsonExpr(column)} @> $${params.push(JSON.stringify([tag]))}::jsonb`);
  }
  return list;
}

function pushStatusFilter(where, params, status, column = 'status') {
  const list = parseListParam(status);
  if (list.length === 1) {
    where.push(`${column} = $${params.push(list[0])}`);
  } else if (list.length > 1) {
    where.push(`${column} = ANY($${params.push(list)}::text[])`);
  }
  return list;
}

function seriesFromRows(rows, { key = 'key', value = 'value' } = {}) {
  return (rows || []).map((r) => ({
    name: r[key] == null || r[key] === '' ? '—' : String(r[key]),
    value: Number(r[value]) || 0,
  }));
}

function mergeStateSeries(rows) {
  const map = new Map();
  for (const s of seriesFromRows(rows)) {
    const uf = normalizeBrazilStateToUf(s.name);
    if (!uf || uf === '—') continue;
    map.set(uf, (map.get(uf) || 0) + s.value);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function formatBucketLabel(bucket, groupBy) {
  if (!bucket) return '—';
  const d = bucket instanceof Date ? bucket : new Date(bucket);
  if (Number.isNaN(d.getTime())) return String(bucket);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (groupBy === 'year') return String(y);
  if (groupBy === 'month') return `${y}-${m}`;
  if (groupBy === 'week') {
    // ISO-ish label from truncated week start
    return `${y}-${m}-${day}`;
  }
  return `${y}-${m}-${day}`;
}

async function queryByDate(table, dateExpr, period, extraWhere = [], extraParams = []) {
  const params = [...extraParams, period.startTs, period.endTs];
  const startIdx = extraParams.length + 1;
  const endIdx = extraParams.length + 2;
  const where = [
    ...extraWhere,
    `${dateExpr} IS NOT NULL`,
    `${dateExpr} >= $${startIdx}`,
    `${dateExpr} <= $${endIdx}`,
  ];
  const sql = `
    SELECT date_trunc('${period.group_by}', ${dateExpr}) AS bucket, COUNT(*)::int AS value
    FROM ${table}
    WHERE ${where.join(' AND ')}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const result = await query(sql, params);
  return (result.rows || []).map((r) => ({
    name: formatBucketLabel(r.bucket, period.group_by),
    value: Number(r.value) || 0,
    sortKey: r.bucket ? new Date(r.bucket).toISOString() : null,
  }));
}

function buildServicesWhere(queryParams, period, alias = '') {
  const p = alias ? `${alias}.` : '';
  const params = [];
  const where = [];
  const dateExpr = `COALESCE(${p}consultation_date, ${p}date_created)`;

  pushStatusFilter(where, params, queryParams.status, `${p}status`);
  pushTagsFilter(where, params, queryParams.tags, `${p}tags`);

  const types = parseListParam(queryParams.type);
  if (types.length === 1) {
    where.push(`${p}type = $${params.push(types[0])}`);
  } else if (types.length > 1) {
    where.push(`${p}type = ANY($${params.push(types)}::text[])`);
  }

  if (queryParams.professional_id) {
    where.push(`${p}professional_id = $${params.push(String(queryParams.professional_id))}`);
  }

  where.push(`${dateExpr} IS NOT NULL`);
  where.push(`${dateExpr} >= $${params.push(period.startTs)}`);
  where.push(`${dateExpr} <= $${params.push(period.endTs)}`);

  return { where, params, dateExpr, whereSql: where.join(' AND ') };
}

function buildOrdersWhere(queryParams, period, alias = '') {
  const p = alias ? `${alias}.` : '';
  const params = [];
  const where = [];
  const dateExpr = `COALESCE(${p}created_date, ${p}date_created)`;

  pushStatusFilter(where, params, queryParams.status, `${p}status`);
  pushTagsFilter(where, params, queryParams.tags, `${p}tags`);
  where.push(`${dateExpr} IS NOT NULL`);
  where.push(`${dateExpr} >= $${params.push(period.startTs)}`);
  where.push(`${dateExpr} <= $${params.push(period.endTs)}`);

  return { where, params, dateExpr, whereSql: where.join(' AND ') };
}

/* ---------- Associates ---------- */

/**
 * Default: todos os usuários que não são paciente (paridade com lista de Associados).
 * "Associado" aceita legado (`Associado`) e OSS (`active`).
 */
function pushAssociatesStatusFilter(where, params, statusRaw) {
  const statusList = parseListParam(statusRaw);
  if (statusList.length === 0) {
    where.push(`status IS DISTINCT FROM 'patient'`);
    return;
  }
  const expanded = [];
  for (const s of statusList) {
    const key = String(s).trim();
    if (!key) continue;
    if (key === 'Associado' || key.toLowerCase() === 'associado') {
      expanded.push('Associado', 'active');
    } else if (key === 'Paciente' || key.toLowerCase() === 'paciente') {
      expanded.push('patient');
    } else {
      expanded.push(key);
    }
  }
  const unique = [...new Set(expanded)];
  if (unique.length === 1) {
    where.push(`status = $${params.push(unique[0])}`);
  } else if (unique.length > 1) {
    where.push(`status = ANY($${params.push(unique)}::text[])`);
  }
}

async function getAssociatesAnalytics(queryParams = {}) {
  const period = parsePeriod(queryParams);
  const params = [];
  const where = [];
  const dateExpr = 'COALESCE(created_date, date_created)';

  pushAssociatesStatusFilter(where, params, queryParams.status);

  where.push(`${dateExpr} >= $${params.push(period.startTs)}`);
  where.push(`${dateExpr} <= $${params.push(period.endTs)}`);

  const whereSql = where.join(' AND ');
  const baseParams = params.slice(0, -2);
  const baseWhere = where.slice(0, -2);

  const [totalRes, byDate, byStateRes, genderAgeRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM users WHERE ${whereSql}`, params),
    queryByDate('users', dateExpr, period, baseWhere, baseParams),
    query(
      `SELECT UPPER(TRIM(COALESCE(state, ''))) AS key, COUNT(*)::int AS value
       FROM users WHERE ${whereSql}
       GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT ${RANKING_LIMIT}`,
      params
    ),
    query(`SELECT gender, associate_birth_date FROM users WHERE ${whereSql}`, params),
  ]);

  const genderCounts = new Map();
  const ageCounts = new Map(AGE_BRACKETS.map((b) => [b.label, 0]));
  ageCounts.set('Sem data', 0);
  const now = new Date();
  for (const row of genderAgeRes.rows || []) {
    const g = normalizeGenderValue(row.gender);
    genderCounts.set(g, (genderCounts.get(g) || 0) + 1);
    let birth = null;
    if (row.associate_birth_date) {
      birth = new Date(row.associate_birth_date);
      if (Number.isNaN(birth.getTime())) birth = null;
    }
    const label = ageBracketLabel(ageYearsFromBirth(birth, now));
    ageCounts.set(label, (ageCounts.get(label) || 0) + 1);
  }

  const preferredGender = [
    'Homem Cis',
    'Mulher Cis',
    'Mulher Trans',
    'Homem Trans',
    'Não Binário',
    'Outro',
    'Não Informado',
  ];
  const byGender = [
    ...preferredGender.filter((k) => genderCounts.has(k)).map((k) => ({ name: k, value: genderCounts.get(k) })),
    ...[...genderCounts.entries()]
      .filter(([k]) => !preferredGender.includes(k))
      .map(([name, value]) => ({ name, value })),
  ];

  const byAgeOrdered = [
    ...AGE_BRACKETS.map((b) => ({ name: b.label, value: ageCounts.get(b.label) || 0 })),
    ...(ageCounts.get('Sem data') ? [{ name: 'Sem data', value: ageCounts.get('Sem data') }] : []),
  ];

  return {
    period: { start: period.start, end: period.end, group_by: period.group_by },
    kpis: { total: Number(totalRes.rows[0]?.total) || 0 },
    series: {
      by_date: byDate,
      by_state: mergeStateSeries(byStateRes.rows),
      by_age: byAgeOrdered,
      by_gender: byGender,
    },
    rankings: {},
  };
}

/* ---------- Services ---------- */

async function getServicesAnalytics(queryParams = {}) {
  const period = parsePeriod(queryParams);
  const plain = buildServicesWhere(queryParams, period, '');
  const aliased = buildServicesWhere(queryParams, period, 's');

  const [typesCfg, reportSettings] = await Promise.all([
    professionalTypesConfig.loadProfessionalTypes(),
    professionalTypesConfig.loadReportSettings(),
  ]);
  const typeMap = Object.fromEntries((typesCfg || []).map((t) => [t.id, t]));
  const deduct = Boolean(reportSettings?.deduct_donation_from_payable);

  const baseWhere = plain.where.slice(0, -2);
  const baseParams = plain.params.slice(0, -2);

  const [kpiRes, byDate, byTypeRes, byProRes, topAssocRes, feeAggRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(COALESCE(donation, 0)), 0)::float AS donations_sum,
         COALESCE(AVG(COALESCE(donation, 0)), 0)::float AS donations_avg
       FROM services WHERE ${plain.whereSql}`,
      plain.params
    ),
    queryByDate('services', plain.dateExpr, period, baseWhere, baseParams),
    query(
      `SELECT COALESCE(NULLIF(TRIM(type), ''), '—') AS key, COUNT(*)::int AS value
       FROM services WHERE ${plain.whereSql}
       GROUP BY 1 ORDER BY value DESC`,
      plain.params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(professional_name), ''), COALESCE(NULLIF(TRIM(professional_id::text), ''), '—')) AS key,
              COUNT(*)::int AS value
       FROM services WHERE ${plain.whereSql}
       GROUP BY 1 ORDER BY value DESC LIMIT ${RANKING_LIMIT}`,
      plain.params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(associate_name), ''), COALESCE(NULLIF(TRIM(associate_user_code::text), ''), '—')) AS name,
              COALESCE(NULLIF(TRIM(associate_user_code::text), ''), '') AS code,
              COUNT(*)::int AS value
       FROM services WHERE ${plain.whereSql}
       GROUP BY 1, 2 ORDER BY value DESC LIMIT ${RANKING_LIMIT}`,
      plain.params
    ),
    query(
      `SELECT COALESCE(p.type, '') AS ptype,
              COUNT(*)::int AS cnt,
              COALESCE(SUM(COALESCE(s.price, 0)), 0)::float AS price_sum,
              COALESCE(SUM(COALESCE(s.donation, 0)), 0)::float AS donation_sum
       FROM services s
       LEFT JOIN professionals p ON p.professional_code = s.professional_id
       WHERE ${aliased.whereSql}
       GROUP BY 1`,
      aliased.params
    ),
  ]);

  let payableSum = 0;
  let feeSum = 0;
  for (const row of feeAggRes.rows || []) {
    const typeId = professionalTypesConfig.normalizeProfessionalTypeId(row.ptype) || null;
    const fee = Number(typeMap[typeId]?.association_fee) || 0;
    const cnt = Number(row.cnt) || 0;
    const priceSum = Number(row.price_sum) || 0;
    const donationSum = Number(row.donation_sum) || 0;
    const rowFee = fee * cnt;
    let payable = priceSum - rowFee;
    if (deduct) payable -= donationSum;
    if (payable < 0) payable = 0;
    payableSum += payable;
    feeSum += rowFee;
  }

  const kpi = kpiRes.rows[0] || {};
  return {
    period: { start: period.start, end: period.end, group_by: period.group_by },
    kpis: {
      total: Number(kpi.total) || 0,
      donations_sum: Number(kpi.donations_sum) || 0,
      donations_avg: Number(kpi.donations_avg) || 0,
      payable_sum: payableSum,
      association_fee_sum: feeSum,
    },
    series: {
      by_date: byDate,
      by_type: seriesFromRows(byTypeRes.rows),
      by_professional: seriesFromRows(byProRes.rows),
    },
    rankings: {
      top_associates: (topAssocRes.rows || []).map((r) => ({
        name: r.name || '—',
        code: r.code || null,
        value: Number(r.value) || 0,
      })),
    },
  };
}

/* ---------- Orders ---------- */

async function getOrdersAnalytics(queryParams = {}) {
  const period = parsePeriod(queryParams);
  const plain = buildOrdersWhere(queryParams, period, '');
  const aliased = buildOrdersWhere(queryParams, period, 'o');

  const baseWhere = plain.where.slice(0, -2);
  const baseParams = plain.params.slice(0, -2);

  const [kpiRes, byDate, byStateRes, topAssocRes, topProductsRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(COALESCE(donation, 0)), 0)::float AS donations_sum,
         COALESCE(SUM(COALESCE(discount, 0)), 0)::float AS discounts_sum,
         COALESCE(AVG(COALESCE(delivery_price, 0)), 0)::float AS freight_avg
       FROM orders WHERE ${plain.whereSql}`,
      plain.params
    ),
    queryByDate('orders', plain.dateExpr, period, baseWhere, baseParams),
    query(
      `SELECT UPPER(TRIM(COALESCE(address->>'state', ''))) AS key, COUNT(*)::int AS value
       FROM orders WHERE ${plain.whereSql}
       GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT ${RANKING_LIMIT}`,
      plain.params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(associate_name), ''), COALESCE(NULLIF(TRIM(user_code::text), ''), '—')) AS name,
              COALESCE(NULLIF(TRIM(user_code::text), ''), '') AS code,
              COUNT(*)::int AS value
       FROM orders WHERE ${plain.whereSql}
       GROUP BY 1, 2 ORDER BY value DESC LIMIT ${RANKING_LIMIT}`,
      plain.params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(item->>'name'), ''), COALESCE(NULLIF(TRIM(item->>'sku'), ''), '—')) AS name,
              COALESCE(SUM(COALESCE((item->>'quantity')::numeric, 1)), 0)::float AS value
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(COALESCE(o.items, '[]'::jsonb)) = 'array'
           THEN COALESCE(o.items, '[]'::jsonb) ELSE '[]'::jsonb END
       ) AS item
       WHERE ${aliased.whereSql}
       GROUP BY 1
       ORDER BY value DESC
       LIMIT ${RANKING_LIMIT}`,
      aliased.params
    ),
  ]);

  const kpi = kpiRes.rows[0] || {};
  return {
    period: { start: period.start, end: period.end, group_by: period.group_by },
    kpis: {
      total: Number(kpi.total) || 0,
      donations_sum: Number(kpi.donations_sum) || 0,
      discounts_sum: Number(kpi.discounts_sum) || 0,
      freight_avg: Number(kpi.freight_avg) || 0,
    },
    series: {
      by_date: byDate,
      by_state: mergeStateSeries(byStateRes.rows),
    },
    rankings: {
      top_associates: (topAssocRes.rows || []).map((r) => ({
        name: r.name || '—',
        code: r.code || null,
        value: Number(r.value) || 0,
      })),
      top_products: (topProductsRes.rows || []).map((r) => ({
        name: r.name || '—',
        value: Number(r.value) || 0,
      })),
    },
  };
}

/* ---------- Reception ---------- */

function classifyCompletionReason(raw) {
  const key = normalizeTextNoAccents(raw).replace(/\s+/g, ' ');
  if (COMPLETION_ORDER.has(key)) return 'order';
  if (COMPLETION_SERVICE.has(key)) return 'service';
  return 'other';
}

async function getReceptionAnalytics(queryParams = {}) {
  const period = parsePeriod(queryParams);
  const params = [];
  const where = [];
  const dateExpr = 'date_created';

  pushStatusFilter(where, params, queryParams.status);
  pushTagsFilter(where, params, queryParams.tags, 'tags');
  if (queryParams.attendant) {
    where.push(`attendant = $${params.push(String(queryParams.attendant))}`);
  }
  where.push(`${dateExpr} IS NOT NULL`);
  where.push(`${dateExpr} >= $${params.push(period.startTs)}`);
  where.push(`${dateExpr} <= $${params.push(period.endTs)}`);

  const whereSql = where.join(' AND ');
  const baseParams = params.slice(0, -2);
  const baseWhere = where.slice(0, -2);

  const [totalRes, byDate, byAttendantRes, reasonsRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM reception WHERE ${whereSql}`, params),
    queryByDate('reception', dateExpr, period, baseWhere, baseParams),
    query(
      `SELECT COALESCE(NULLIF(TRIM(attendant), ''), '—') AS key, COUNT(*)::int AS value
       FROM reception WHERE ${whereSql}
       GROUP BY 1 ORDER BY value DESC LIMIT ${RANKING_LIMIT}`,
      params
    ),
    query(
      `SELECT completion_reason, COUNT(*)::int AS value
       FROM reception WHERE ${whereSql}
       GROUP BY 1`,
      params
    ),
  ]);

  let toOrders = 0;
  let toServices = 0;
  for (const row of reasonsRes.rows || []) {
    const kind = classifyCompletionReason(row.completion_reason);
    if (kind === 'order') toOrders += Number(row.value) || 0;
    else if (kind === 'service') toServices += Number(row.value) || 0;
  }

  return {
    period: { start: period.start, end: period.end, group_by: period.group_by },
    kpis: {
      total: Number(totalRes.rows[0]?.total) || 0,
      to_orders: toOrders,
      to_services: toServices,
    },
    series: {
      by_date: byDate,
      by_attendant: seriesFromRows(byAttendantRes.rows),
    },
    rankings: {},
  };
}

module.exports = {
  getAssociatesAnalytics,
  getServicesAnalytics,
  getOrdersAnalytics,
  getReceptionAnalytics,
  parsePeriod,
  normalizeGenderValue,
  normalizeBrazilStateToUf,
  ageBracketLabel,
  ageYearsFromBirth,
  classifyCompletionReason,
  AGE_BRACKETS,
};
