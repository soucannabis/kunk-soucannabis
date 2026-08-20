/** Staff roles allowed into the Kunk operational app (`/app/*`). */
export const KUNK_STAFF_ROLES = ['Administrador', 'Acolhimento', 'Produção'];

/** Roles that may use the operator auth cookie on this app (staff + portal profissional). */
export const KUNK_APP_ROLES = [...KUNK_STAFF_ROLES, 'Profissional'];

/**
 * Portuguese URL paths (legacy Kunk parity).
 * File/component names stay in English.
 */
export const PATHS = {
  registration: '/app/acolhimento/associados',
  services: '/app/acolhimento/servicos',
  triage: '/app/acolhimento/triagem',
  institutionalClients: '/app/acolhimento/clientesinstitucionais',
  orders: '/app/loja/pedidos',
  newOrder: '/app/loja/novo-pedido',
  products: '/app/loja/produtos',
  professionals: '/app/profissionais',
  /** @deprecated use PATHS.professionals */
  prescribers: '/app/prescritores',
  systemHistory: '/app/historico',
  tags: '/app/tags',
  servicesReport: '/app/relatorios/servicos',
  analyticsDashboard: '/app/relatorios/dashboard',
  professionalServicesReport: '/relatorio/servicos',
};

/**
 * Sidebar menu config (Portuguese labels + Portuguese paths).
 * Order matches the legacy Kunk sidebar (v1 filtered).
 */
export const MENU_SECTIONS = [
  {
    id: 'acolhimento',
    label: 'Acolhimento',
    items: [
      { id: 'associados', label: 'Associados', path: PATHS.registration },
      { id: 'servicos', label: 'Atendimentos', path: PATHS.services },
      { id: 'triagem', label: 'Triagem', path: PATHS.triage },
      {
        id: 'institutional-clients',
        label: 'Clientes Institucionais',
        path: PATHS.institutionalClients,
      },
    ],
  },
  {
    id: 'loja',
    label: 'Loja',
    items: [
      { id: 'pedidos', label: 'Pedidos', path: PATHS.orders },
      { id: 'produtos', label: 'Produtos', path: PATHS.products },
    ],
  },
  {
    id: 'profissionais',
    label: 'Profissionais',
    items: [{ id: 'profissionais', label: 'Profissionais', path: PATHS.professionals }],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    items: [
      { id: 'relatorios-dashboard', label: 'Dashboard', path: PATHS.analyticsDashboard },
      { id: 'relatorios-servicos', label: 'Atendimentos', path: PATHS.servicesReport },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { id: 'historico', label: 'Histórico do sistema', path: PATHS.systemHistory },
      { id: 'tags', label: 'Tags', path: PATHS.tags },
    ],
  },
];

/** Labels that must NOT appear in the v1 sidebar. */
export const REMOVED_MENU_LABELS = [
  'Painel geral',
  'Beeviral Analytics',
  'Webmaster',
  'Nibo Dashboard',
  'Pesquisas de Satisfação',
  'Matérias primas',
  'Serviço Social',
  'Cupons',
  'Pagamentos',
  'Sou Analytics',
  'Dashboards',
  'Usuários',
  'Usuários do sistema',
];

export function flattenMenuItems(sections = MENU_SECTIONS) {
  return sections.flatMap((section) => section.items);
}

export function getNavigablePaths(sections = MENU_SECTIONS, { isAdmin = true } = {}) {
  return flattenMenuItems(sections)
    .filter((item) => item.path && (!item.adminOnly || isAdmin))
    .map((item) => item.path);
}
