/** Layout declarativo dos blocos do Dashboard (inspirado no Painel Análise legado). */

export const ANALYTICS_TABS = [
  { id: 'associates', label: 'Associados' },
  { id: 'services', label: 'Atendimentos' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'reception', label: 'Triagem' },
];

export const PRESETS = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

/** group_by enviado à API conforme preset global (range customizado usa month). */
export const PRESET_TO_GROUP_BY = {
  day: 'day',
  week: 'day',
  month: 'day',
  year: 'month',
};

export const ASSOCIATE_STATUS_OPTIONS = [
  { value: 'Associado', label: 'Associado / ativo' },
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
  { value: 'patient', label: 'Paciente' },
  { value: 'published', label: 'published' },
];

export const SERVICE_STATUS_OPTIONS = [
  { value: 'Aguardando Pagamento', label: 'Aguardando Pagamento' },
  { value: 'Pagamento Concluído', label: 'Pagamento Concluído' },
  { value: 'Agendado', label: 'Agendado' },
  { value: 'Cancelado', label: 'Cancelado' },
];

export const ORDER_STATUS_OPTIONS = [
  { value: 'Aguardando pagamento', label: 'Aguardando pagamento' },
  { value: 'Pago', label: 'Pago' },
  { value: 'Em produção', label: 'Em produção' },
  { value: 'Enviado', label: 'Enviado' },
  { value: 'Entregue', label: 'Entregue' },
  { value: 'Cancelado', label: 'Cancelado' },
];

export const RECEPTION_STATUS_OPTIONS = [
  { value: 'waiting', label: 'Aguardando' },
  { value: 'done', label: 'Finalizado' },
];

/**
 * @typedef {object} AnalyticsBlockDef
 * @property {string} id
 * @property {'kpi'|'chart'|'ranking'} type
 * @property {string} title
 * @property {{ xs?: number, sm?: number, md?: number }} layout
 * @property {string} [kpiKey] path in data.kpis
 * @property {'currency'|'number'|'avg'} [kpiFormat]
 * @property {'line'|'bar'|'pie'} [chartVariant]
 * @property {string} [seriesKey] path in data.series
 * @property {string} [rankingKey] path in data.rankings
 * @property {string[]} [filterFields] local filter fields besides dates
 */

/** @type {Record<string, AnalyticsBlockDef[]>} */
export const ANALYTICS_BLOCKS = {
  associates: [
    {
      id: 'kpi-associates-total',
      type: 'kpi',
      title: 'Total de associados',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'total',
      kpiFormat: 'number',
      filterFields: ['status'],
    },
    {
      id: 'chart-associates-by-date',
      type: 'chart',
      title: 'Cadastros por data',
      layout: { xs: 12, md: 9 },
      chartVariant: 'line',
      seriesKey: 'by_date',
      filterFields: ['status'],
    },
    {
      id: 'chart-associates-by-state',
      type: 'chart',
      title: 'Associados por estado',
      layout: { xs: 12, md: 6 },
      chartVariant: 'bar',
      seriesKey: 'by_state',
      filterFields: ['status'],
    },
    {
      id: 'chart-associates-by-age',
      type: 'chart',
      title: 'Faixa etária',
      layout: { xs: 12, md: 6 },
      chartVariant: 'bar',
      seriesKey: 'by_age',
      filterFields: ['status'],
    },
    {
      id: 'chart-associates-by-gender',
      type: 'chart',
      title: 'Gênero',
      layout: { xs: 12, md: 6 },
      chartVariant: 'pie',
      seriesKey: 'by_gender',
      filterFields: ['status'],
    },
  ],
  services: [
    {
      id: 'kpi-services-total',
      type: 'kpi',
      title: 'Total de atendimentos',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'total',
      kpiFormat: 'number',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-services-donations',
      type: 'kpi',
      title: 'Total de doações',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'donations_sum',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-services-donations-avg',
      type: 'kpi',
      title: 'Média de doações',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'donations_avg',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-services-payable',
      type: 'kpi',
      title: 'Total pago aos médicos',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'payable_sum',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-services-fee',
      type: 'kpi',
      title: 'Total arrecadado (taxa)',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'association_fee_sum',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-services-by-date',
      type: 'chart',
      title: 'Atendimentos por data',
      layout: { xs: 12, md: 9 },
      chartVariant: 'line',
      seriesKey: 'by_date',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-services-by-type',
      type: 'chart',
      title: 'Atendimentos por tipo',
      layout: { xs: 12, md: 6 },
      chartVariant: 'bar',
      seriesKey: 'by_type',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-services-by-professional',
      type: 'chart',
      title: 'Atendimentos por profissional',
      layout: { xs: 12, md: 6 },
      chartVariant: 'bar',
      seriesKey: 'by_professional',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'ranking-services-associates',
      type: 'ranking',
      title: 'Associados com mais atendimentos',
      layout: { xs: 12, md: 6 },
      rankingKey: 'top_associates',
      filterFields: ['status', 'tags'],
    },
  ],
  orders: [
    {
      id: 'kpi-orders-total',
      type: 'kpi',
      title: 'Total de pedidos',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'total',
      kpiFormat: 'number',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-orders-donations',
      type: 'kpi',
      title: 'Total de doações',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'donations_sum',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-orders-discounts',
      type: 'kpi',
      title: 'Total de descontos',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'discounts_sum',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-orders-freight',
      type: 'kpi',
      title: 'Média de frete',
      layout: { xs: 12, sm: 6, md: 3 },
      kpiKey: 'freight_avg',
      kpiFormat: 'currency',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-orders-by-date',
      type: 'chart',
      title: 'Pedidos por data',
      layout: { xs: 12, md: 8 },
      chartVariant: 'line',
      seriesKey: 'by_date',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-orders-by-state',
      type: 'chart',
      title: 'Pedidos por estado',
      layout: { xs: 12, md: 4 },
      chartVariant: 'bar',
      seriesKey: 'by_state',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'ranking-orders-associates',
      type: 'ranking',
      title: 'Associados com mais pedidos',
      layout: { xs: 12, md: 6 },
      rankingKey: 'top_associates',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'ranking-orders-products',
      type: 'ranking',
      title: 'Produtos mais vendidos',
      layout: { xs: 12, md: 6 },
      rankingKey: 'top_products',
      filterFields: ['status', 'tags'],
    },
  ],
  reception: [
    {
      id: 'kpi-reception-total',
      type: 'kpi',
      title: 'Total de triagens',
      layout: { xs: 12, sm: 6, md: 4 },
      kpiKey: 'total',
      kpiFormat: 'number',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-reception-orders',
      type: 'kpi',
      title: 'Triagens → pedidos',
      layout: { xs: 12, sm: 6, md: 4 },
      kpiKey: 'to_orders',
      kpiFormat: 'number',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'kpi-reception-services',
      type: 'kpi',
      title: 'Triagens → atendimentos',
      layout: { xs: 12, sm: 6, md: 4 },
      kpiKey: 'to_services',
      kpiFormat: 'number',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-reception-by-date',
      type: 'chart',
      title: 'Triagens por período',
      layout: { xs: 12, md: 7 },
      chartVariant: 'line',
      seriesKey: 'by_date',
      filterFields: ['status', 'tags'],
    },
    {
      id: 'chart-reception-by-attendant',
      type: 'chart',
      title: 'Triagens por usuário Kunk',
      layout: { xs: 12, md: 5 },
      chartVariant: 'bar',
      seriesKey: 'by_attendant',
      filterFields: ['status', 'tags'],
    },
  ],
};

export function blocksForTab(tabId) {
  return ANALYTICS_BLOCKS[tabId] || [];
}

export function allBlockIds() {
  return Object.values(ANALYTICS_BLOCKS).flatMap((list) => list.map((b) => b.id));
}
