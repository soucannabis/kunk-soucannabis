/** Public Vite env helpers for association branding (no secrets). */

/** Env keys that stay on Vite/build only — never loaded from system_configs. */
export const BOOTSTRAP_ENV_KEYS = ['VITE_API_URL', 'VITE_URL'];

/** Parse env/config boolean strings (`true`/`1`/`yes`). */
export function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return Boolean(fallback);
}

/** Branding keys resolved via API (DB → env → hardcoded) for system=registration. */
export const BRANDING_ENV_KEYS = [
  'VITE_ASSOCIATION_NAME',
  'VITE_ASSOCIATION_FULL_NAME',
  'VITE_ASSOCIATION_EMAIL',
  'VITE_ASSOCIATION_PHONE',
  'VITE_ASSOCIATION_SITE',
  'VITE_ASSOCIATION_CNPJ',
  'VITE_ASSOCIATION_CITY',
  'VITE_ASSOCIATION_STATE',
  'VITE_ASSOCIATION_LOGO',
  'VITE_ASSOCIATION_LOGO_MENU',
  'VITE_ASSOCIATION_LOGO_SIZE',
  'VITE_ASSOCIATION_LOGO_SQUARE',
  'VITE_ASSOCIATION_LOGO_RECTANGULAR',
  'VITE_ASSOCIATION_LOGO_FORMAT',
  'VITE_ASSOCIATION_LOGO_PLACEMENTS',
  'VITE_WELCOME_TEXT',
  'VITE_COMPLETION_TEXT',
  'VITE_SHOW_TRIAGE_BUTTON',
  'VITE_TRIAGE_FORM_URL',
  'VITE_CONTACT_URL',
];

/** Active logo display format in apps. */
export const LOGO_FORMAT_SQUARE = 'square';
export const LOGO_FORMAT_RECTANGULAR = 'rectangular';
export const LOGO_FORMATS = [LOGO_FORMAT_SQUARE, LOGO_FORMAT_RECTANGULAR];

/** Fixed logo frames (CSS px). Crop export uses LOGO_EXPORT sizes. */
/** Primary square display (login / AuthLoginLayout). */
export const KUNK_LOGO_FRAME_SIZE = 162;
export const KUNK_LOGO_EXPORT_SIZE = 512;
/** Rectangular brand logo (3:1), separate from doc-sign term logo. */
export const KUNK_LOGO_RECT_ASPECT = 3;
/** Display size used on login / horizontal bars (matches AuthLoginLayout). */
export const KUNK_LOGO_RECT_FRAME_W = 500;
export const KUNK_LOGO_RECT_FRAME_H = Math.round(500 / KUNK_LOGO_RECT_ASPECT);
export const KUNK_LOGO_RECT_EXPORT_W = 900;
export const KUNK_LOGO_RECT_EXPORT_H = 300;

/**
 * @param {unknown} value
 * @returns {'square'|'rectangular'}
 */
export function normalizeLogoFormat(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === LOGO_FORMAT_RECTANGULAR || raw === 'rect' || raw === 'horizontal') {
    return LOGO_FORMAT_RECTANGULAR;
  }
  return LOGO_FORMAT_SQUARE;
}

/** Apps that show association branding (login + interior menu). */
export const BRANDING_APPS = ['kunk', 'registration', 'docsign', 'admin'];
export const BRANDING_SURFACES = ['login', 'menu'];

export const BRANDING_APP_LABELS = {
  kunk: 'Kunk',
  registration: 'Cadastramento',
  docsign: 'Assinatura de termos',
  admin: 'Admin',
};

export const BRANDING_SURFACE_LABELS = {
  login: 'Login',
  menu: 'Menu',
};

/**
 * Default width (px) per app/surface — mirrors legacy getBrandLogoFrameStyle sizes.
 * @type {Record<string, { login: number, menu: number }>}
 */
export const LOGO_PLACEMENT_DEFAULT_WIDTHS = {
  kunk: { login: KUNK_LOGO_FRAME_SIZE, menu: 120 },
  registration: { login: KUNK_LOGO_FRAME_SIZE, menu: 40 },
  docsign: { login: KUNK_LOGO_FRAME_SIZE, menu: 66 },
  admin: { login: 72, menu: 40 },
};

/** Clamp logo display width (px). */
export const LOGO_WIDTH_MIN = 24;
export const LOGO_WIDTH_MAX = 640;

/**
 * Height from width + format (square 1:1, rectangular 3:1).
 * @param {unknown} format
 * @param {unknown} width
 * @returns {number}
 */
export function logoHeightForWidth(format, width) {
  const w = clampLogoWidth(width);
  if (normalizeLogoFormat(format) === LOGO_FORMAT_RECTANGULAR) {
    return Math.max(1, Math.round(w / KUNK_LOGO_RECT_ASPECT));
  }
  return w;
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function clampLogoWidth(value, fallback = KUNK_LOGO_FRAME_SIZE) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LOGO_WIDTH_MAX, Math.max(LOGO_WIDTH_MIN, Math.round(n)));
}

/**
 * Build default placements, optionally seeding format from legacy global format.
 * @param {unknown} [legacyFormat]
 * @returns {Record<string, { login: { format: string, width: number }, menu: { format: string, width: number } }>}
 */
export function defaultLogoPlacements(legacyFormat) {
  const format = normalizeLogoFormat(legacyFormat);
  /** @type {Record<string, { login: { format: string, width: number }, menu: { format: string, width: number } }>} */
  const out = {};
  for (const app of BRANDING_APPS) {
    const widths = LOGO_PLACEMENT_DEFAULT_WIDTHS[app];
    out[app] = {
      login: { format, width: widths.login },
      menu: { format, width: widths.menu },
    };
  }
  return out;
}

/**
 * Normalize placements JSON (string or object). Missing apps/surfaces get defaults.
 * @param {unknown} raw
 * @param {unknown} [legacyFormat]
 * @returns {ReturnType<typeof defaultLogoPlacements>}
 */
export function normalizeLogoPlacements(raw, legacyFormat) {
  const defaults = defaultLogoPlacements(legacyFormat);
  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return defaults;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return defaults;
    }
  }
  if (!parsed || typeof parsed !== 'object') return defaults;

  /** @type {ReturnType<typeof defaultLogoPlacements>} */
  const out = {};
  for (const app of BRANDING_APPS) {
    const src = parsed[app] && typeof parsed[app] === 'object' ? parsed[app] : {};
    const def = defaults[app];
    out[app] = {
      login: {
        format: normalizeLogoFormat(src.login?.format ?? def.login.format),
        width: clampLogoWidth(src.login?.width, def.login.width),
      },
      menu: {
        format: normalizeLogoFormat(src.menu?.format ?? def.menu.format),
        width: clampLogoWidth(src.menu?.width, def.menu.width),
      },
    };
  }
  return out;
}

/**
 * Serialize placements for system_configs storage.
 * @param {unknown} placements
 * @returns {string}
 */
export function stringifyLogoPlacements(placements) {
  return JSON.stringify(normalizeLogoPlacements(placements));
}

/**
 * Resolve logo URL + frame for an app surface from placements + assets.
 * @param {{
 *   placements?: unknown,
 *   app?: string,
 *   surface?: 'login'|'menu'|string,
 *   square?: unknown,
 *   rectangular?: unknown,
 *   legacy?: unknown,
 *   legacyFormat?: unknown,
 * }} [opts]
 * @returns {{ url: string, format: 'square'|'rectangular', width: number, height: number }}
 */
export function resolvePlacementLogo(opts = {}) {
  const placements = normalizeLogoPlacements(opts.placements, opts.legacyFormat);
  const app = BRANDING_APPS.includes(opts.app) ? opts.app : 'kunk';
  const surface = BRANDING_SURFACES.includes(opts.surface) ? opts.surface : 'login';
  const slot = placements[app][surface];
  const active = resolveActiveBrandingLogo({
    format: slot.format,
    square: opts.square,
    rectangular: opts.rectangular,
    legacy: opts.legacy,
  });
  const width = clampLogoWidth(slot.width, LOGO_PLACEMENT_DEFAULT_WIDTHS[app][surface]);
  const height = logoHeightForWidth(active.format, width);
  return {
    url: active.url,
    format: active.format,
    width,
    height,
  };
}

/** Defaults for association identity (Admin → Dados da associação). */
export const ASSOCIATION_DATA_DEFAULTS = {
  associationName: '',
  associationFullName: '',
  associationEmail: '',
  associationPhone: '',
  associationSite: '',
  associationCnpj: '',
  associationCity: '',
  associationState: '',
};

/** Form field → env key for association identity configs. */
export const ASSOCIATION_DATA_CONFIG_TO_ENV = {
  associationName: 'VITE_ASSOCIATION_NAME',
  associationFullName: 'VITE_ASSOCIATION_FULL_NAME',
  associationEmail: 'VITE_ASSOCIATION_EMAIL',
  associationPhone: 'VITE_ASSOCIATION_PHONE',
  associationSite: 'VITE_ASSOCIATION_SITE',
  associationCnpj: 'VITE_ASSOCIATION_CNPJ',
  associationCity: 'VITE_ASSOCIATION_CITY',
  associationState: 'VITE_ASSOCIATION_STATE',
};

export const ASSOCIATION_DATA_ENV_KEYS = Object.values(ASSOCIATION_DATA_CONFIG_TO_ENV);

/** Defaults for registration funnel copy (Admin → Sistema de cadastro). */
export const REGISTRATION_SYSTEM_DEFAULTS = {
  welcomeText:
    'Ao continuar, você preencherá seus dados pessoais, enviará documentos de identidade e assinará o termo de adesão. Depois poderá anexar receitas, exames ou laudos e agendar uma consulta com a associação. O processo é simples e leva poucos minutos — tenha em mãos RG ou CNH e, se tiver, receitas e laudos médicos.',
  completionText:
    'Obrigado por concluir seu cadastro. Abra uma solicitação de contato pelo botão abaixo. Em breve entraremos em contato com você.',
  showTriageButton: true,
  triageFormUrl: '/contato',
};

/** Form field → env key for registration system configs. */
export const REGISTRATION_SYSTEM_CONFIG_TO_ENV = {
  welcomeText: 'VITE_WELCOME_TEXT',
  completionText: 'VITE_COMPLETION_TEXT',
  showTriageButton: 'VITE_SHOW_TRIAGE_BUTTON',
  triageFormUrl: 'VITE_TRIAGE_FORM_URL',
};

export const REGISTRATION_SYSTEM_ENV_KEYS = Object.values(REGISTRATION_SYSTEM_CONFIG_TO_ENV);

/** Defaults for Admin → API access feature flag. */
export const API_ACCESS_DEFAULTS = {
  enabled: false,
};

export const API_ACCESS_CONFIG_KEY = 'api.enabled';
export const API_ACCESS_CONFIG_SYSTEM = 'api';

/** Collections grantable on API tokens (mirrors kunk-api RBAC api role minus users_api). */
export const API_TOKEN_COLLECTIONS = [
  'users',
  'system_users',
  'orders',
  'services',
  'products',
  'institutional_clients',
  'professionals',
  'reception',
  'tags',
  'reports',
  'files',
  'orders_files',
  'services_files',
  'users_files',
  'system_activity',
];

export const API_TOKEN_ACTIONS = [
  { key: 'read', label: 'Ler' },
  { key: 'write', label: 'Escrever' },
  { key: 'delete', label: 'Excluir' },
];

/** Human labels for API token collections in Admin. */
export const API_TOKEN_COLLECTION_LABELS = {
  users: 'Associados',
  system_users: 'Usuários do sistema',
  orders: 'Pedidos',
  services: 'Atendimentos',
  products: 'Produtos',
  institutional_clients: 'Clientes institucionais',
  professionals: 'Profissionais',
  reception: 'Recepção',
  tags: 'Tags',
  reports: 'Relatórios',
  files: 'Arquivos',
  orders_files: 'Arquivos de pedidos',
  services_files: 'Arquivos de serviços',
  users_files: 'Arquivos de associados',
  system_activity: 'Atividade do sistema',
};

/** Outbound webhook subscriptions (Admin → /webhooks). */
export const WEBHOOK_TABLES = ['users', 'orders', 'services', 'reception'];

export const WEBHOOK_ACTIONS = [
  { key: 'create', label: 'Criar' },
  { key: 'update', label: 'Atualizar' },
  { key: 'delete', label: 'Excluir' },
];

export const WEBHOOK_TABLE_LABELS = {
  users: 'Associados',
  orders: 'Pedidos',
  services: 'Atendimentos',
  reception: 'Triagem',
};

/** Appearance keys resolved via API for system=kunk (operational app). */
export const KUNK_BRANDING_ENV_KEYS = [
  'VITE_KUNK_TITLE',
  'VITE_KUNK_LOGO',
  'VITE_KUNK_BG_MODE',
  'VITE_KUNK_BG_COLOR',
  'VITE_KUNK_BG_IMAGE',
  'VITE_KUNK_MENU_BG',
  'VITE_KUNK_MENU_TEXT',
  'VITE_KUNK_MENU_HOVER_BG',
  'VITE_KUNK_MENU_HOVER_TEXT',
  'VITE_KUNK_DEFAULT_THEME',
  'VITE_KUNK_DARK_BG',
  'VITE_KUNK_DARK_PRIMARY',
  'VITE_KUNK_DARK_ACCENT',
  'VITE_KUNK_DARK_ACCENT_HOVER',
  'VITE_KUNK_LIGHT_BG',
  'VITE_KUNK_LIGHT_PRIMARY',
  'VITE_KUNK_LIGHT_ACCENT',
  'VITE_KUNK_LIGHT_ACCENT_HOVER',
];

export const PUBLIC_ENV_KEYS = [...BOOTSTRAP_ENV_KEYS, ...BRANDING_ENV_KEYS];

const ENV_TO_CONFIG = {
  VITE_ASSOCIATION_NAME: 'associationName',
  VITE_ASSOCIATION_FULL_NAME: 'associationFullName',
  VITE_ASSOCIATION_EMAIL: 'associationEmail',
  VITE_ASSOCIATION_PHONE: 'associationPhone',
  VITE_ASSOCIATION_SITE: 'associationSite',
  VITE_ASSOCIATION_CNPJ: 'associationCnpj',
  VITE_ASSOCIATION_CITY: 'associationCity',
  VITE_ASSOCIATION_STATE: 'associationState',
  VITE_ASSOCIATION_LOGO: 'associationLogo',
  VITE_ASSOCIATION_LOGO_MENU: 'associationLogoMenu',
  VITE_ASSOCIATION_LOGO_SIZE: 'associationLogoSize',
  VITE_ASSOCIATION_LOGO_SQUARE: 'associationLogoSquare',
  VITE_ASSOCIATION_LOGO_RECTANGULAR: 'associationLogoRectangular',
  VITE_ASSOCIATION_LOGO_FORMAT: 'associationLogoFormat',
  VITE_ASSOCIATION_LOGO_PLACEMENTS: 'associationLogoPlacements',
  VITE_WELCOME_TEXT: 'welcomeText',
  VITE_COMPLETION_TEXT: 'completionText',
  VITE_SHOW_TRIAGE_BUTTON: 'showTriageButton',
  VITE_TRIAGE_FORM_URL: 'triageFormUrl',
  VITE_CONTACT_URL: 'contactUrl',
};

const ENV_TO_KUNK_CONFIG = {
  VITE_KUNK_TITLE: 'title',
  VITE_KUNK_LOGO: 'logo',
  VITE_KUNK_BG_MODE: 'bgMode',
  VITE_KUNK_BG_COLOR: 'bgColor',
  VITE_KUNK_BG_IMAGE: 'bgImage',
  VITE_KUNK_MENU_BG: 'menuBg',
  VITE_KUNK_MENU_TEXT: 'menuText',
  VITE_KUNK_MENU_HOVER_BG: 'menuHoverBg',
  VITE_KUNK_MENU_HOVER_TEXT: 'menuHoverText',
  VITE_KUNK_DEFAULT_THEME: 'defaultTheme',
  VITE_KUNK_DARK_BG: 'darkBg',
  VITE_KUNK_DARK_PRIMARY: 'darkPrimary',
  VITE_KUNK_DARK_ACCENT: 'darkAccent',
  VITE_KUNK_DARK_ACCENT_HOVER: 'darkAccentHover',
  VITE_KUNK_LIGHT_BG: 'lightBg',
  VITE_KUNK_LIGHT_PRIMARY: 'lightPrimary',
  VITE_KUNK_LIGHT_ACCENT: 'lightAccent',
  VITE_KUNK_LIGHT_ACCENT_HOVER: 'lightAccentHover',
};

/**
 * Frame dimensions for a logo format + UI variant.
 * When `widthOverride` is set, height follows format aspect (square 1:1, rect 3:1).
 * @param {unknown} format
 * @param {'default'|'sidebar'|'login'|'shell'|'nav'|'admin'} [variant]
 * @param {number} [widthOverride]
 * @returns {{ format: 'square'|'rectangular', width: number, height: number }}
 */
export function getBrandLogoFrameStyle(format, variant = 'default', widthOverride) {
  const fmt = normalizeLogoFormat(format);
  if (widthOverride != null && Number.isFinite(Number(widthOverride))) {
    const width = clampLogoWidth(widthOverride);
    return { format: fmt, width, height: logoHeightForWidth(fmt, width) };
  }
  if (fmt === LOGO_FORMAT_RECTANGULAR) {
    const scale =
      variant === 'login' || variant === 'default' ? 1
        : variant === 'shell' ? 0.75
          : variant === 'nav' ? 0.55
            : variant === 'admin' ? 1.1
              : variant === 'sidebar' ? 1
                : 1;
    return {
      format: fmt,
      width: Math.round(KUNK_LOGO_RECT_FRAME_W * scale),
      height: Math.round(KUNK_LOGO_RECT_FRAME_H * scale),
    };
  }
  // Absolute targets keep menu/shell/nav sizes stable while FRAME_SIZE = login.
  const sizeByVariant = {
    login: KUNK_LOGO_FRAME_SIZE,
    default: KUNK_LOGO_FRAME_SIZE,
    sidebar: 120,
    shell: 66,
    nav: 40,
    admin: 72,
  };
  const size = sizeByVariant[variant] ?? KUNK_LOGO_FRAME_SIZE;
  return { format: fmt, width: size, height: size };
}

/**
 * Resolve which logo URL/format to show in apps.
 * @param {{
 *   format?: unknown,
 *   square?: unknown,
 *   rectangular?: unknown,
 *   legacy?: unknown,
 * }} [opts]
 * @returns {{ url: string, format: 'square'|'rectangular' }}
 */
export function resolveActiveBrandingLogo(opts = {}) {
  const format = normalizeLogoFormat(opts.format);
  const square = resolveBrandingLogoUrl(opts.square, opts.legacy);
  const rectangular = resolveBrandingLogoUrl(opts.rectangular);
  if (format === LOGO_FORMAT_RECTANGULAR) {
    if (rectangular) return { url: rectangular, format: LOGO_FORMAT_RECTANGULAR };
    if (square) return { url: square, format: LOGO_FORMAT_SQUARE };
    return { url: '', format: LOGO_FORMAT_RECTANGULAR };
  }
  if (square) return { url: square, format: LOGO_FORMAT_SQUARE };
  if (rectangular) return { url: rectangular, format: LOGO_FORMAT_RECTANGULAR };
  return { url: '', format: LOGO_FORMAT_SQUARE };
}

/** Hardcoded defaults for Kunk appearance (mirrors SQL seed). */
export const KUNK_APPEARANCE_DEFAULTS = {
  title: 'Kunk',
  logo: '',
  logoFormat: LOGO_FORMAT_SQUARE,
  logoSquare: '',
  logoRectangular: '',
  bgMode: 'color',
  bgColor: '#2a3b2b',
  bgImage: '',
  menuBg: '#5a7a5b',
  menuText: '#ffffff',
  menuHoverBg: '#ffffff',
  menuHoverText: '#2a3b2b',
  defaultTheme: 'dark',
  darkBg: '#2a3b2b',
  darkPrimary: '#5a7a5b',
  darkAccent: '#7A5B7A',
  darkAccentHover: '#684C68',
  lightBg: '#f5f5f5',
  lightPrimary: '#5a7a5b',
  lightAccent: '#7A5B7A',
  lightAccentHover: '#684C68',
};

/** Map camelCase config prop → env key (for admin save). */
export const KUNK_CONFIG_TO_ENV = Object.fromEntries(
  Object.entries(ENV_TO_KUNK_CONFIG).map(([envKey, prop]) => [prop, envKey]),
);

/** Default options for “Como podemos ajudar?” (help_topic select). */
export const TRIAGE_DEFAULT_HELP_TOPIC_OPTIONS = [
  'Preciso de óleo / produto',
  'Renovação de receita',
  'Agendamento / consulta',
  'Dúvidas sobre cadastro',
  'Outro',
];

/** Defaults for triage (system=triage). */
export const TRIAGE_DEFAULT_FORM_FIELDS = [
  { id: 'name', enabled: true, required: true, label: 'Nome', order: 1 },
  { id: 'last_name', enabled: true, required: true, label: 'Sobrenome', order: 2 },
  { id: 'email', enabled: true, required: true, label: 'E-mail', order: 3 },
  { id: 'phone', enabled: true, required: true, label: 'Telefone', order: 4 },
  {
    id: 'help_topic',
    enabled: true,
    required: true,
    label: 'Como podemos ajudar?',
    order: 5,
    type: 'select',
    options: [...TRIAGE_DEFAULT_HELP_TOPIC_OPTIONS],
  },
  { id: 'message', enabled: true, required: true, label: 'Mensagem', order: 6 },
  { id: 'patient_name', enabled: false, required: true, label: 'Nome do paciente', order: 7 },
];

/** Normalize a select option (string or { label, enabled }). */
export function normalizeTriageSelectOption(o) {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return {
      label: String(o.label ?? o.value ?? '').trim(),
      enabled: o.enabled !== false,
    };
  }
  return { label: String(o ?? '').trim(), enabled: true };
}

export function normalizeTriageSelectOptions(options) {
  return (Array.isArray(options) ? options : []).map(normalizeTriageSelectOption);
}

/** Labels for public selects; by default only enabled options. */
export function triageSelectOptionLabels(options, { enabledOnly = true } = {}) {
  return normalizeTriageSelectOptions(options)
    .filter((o) => o.label && (!enabledOnly || o.enabled))
    .map((o) => o.label);
}

/** Ensure help_topic is a select; drop removed form fields (e.g. is_associate, option2). */
export function normalizeTriageFormFields(fields) {
  const list = Array.isArray(fields) ? fields : [];
  return list
    .filter((f) => f && f.id !== 'is_associate' && f.id !== 'option2')
    .map((f) => {
      const field = f.id === 'option1' ? { ...f, id: 'help_topic' } : { ...f };
      if (field.id !== 'help_topic' && field.type !== 'select') return field;
      const raw = Array.isArray(field.options) && field.options.length
        ? field.options
        : (field.id === 'help_topic' ? TRIAGE_DEFAULT_HELP_TOPIC_OPTIONS : []);
      const options = normalizeTriageSelectOptions(raw).filter((o) => o.label);
      return {
        ...field,
        type: 'select',
        options: options.length
          ? options
          : (field.id === 'help_topic'
            ? TRIAGE_DEFAULT_HELP_TOPIC_OPTIONS.map((label) => ({ label, enabled: true }))
            : options),
      };
    });
}

/** Curated MUI icon names for triage status (id = @mui/icons-material export). */
export const TRIAGE_STATUS_ICON_OPTIONS = [
  { id: 'AccessTimeFilled', label: 'Relógio preenchido', material: 'access_time_filled' },
  { id: 'AccessTime', label: 'Relógio', material: 'access_time' },
  { id: 'Schedule', label: 'Agenda', material: 'schedule' },
  { id: 'HourglassEmpty', label: 'Ampulheta', material: 'hourglass_empty' },
  { id: 'Pending', label: 'Pendente', material: 'pending' },
  { id: 'PlayCircle', label: 'Em andamento', material: 'play_circle' },
  { id: 'PauseCircle', label: 'Pausado', material: 'pause_circle' },
  { id: 'CheckCircle', label: 'Concluído', material: 'check_circle' },
  { id: 'TaskAlt', label: 'Tarefa ok', material: 'task_alt' },
  { id: 'DoneAll', label: 'Tudo feito', material: 'done_all' },
  { id: 'Cancel', label: 'Cancelado', material: 'cancel' },
  { id: 'Warning', label: 'Atenção', material: 'warning' },
  { id: 'PriorityHigh', label: 'Prioridade', material: 'priority_high' },
  { id: 'Flag', label: 'Bandeira', material: 'flag' },
  { id: 'Star', label: 'Estrela', material: 'star' },
  { id: 'Person', label: 'Pessoa', material: 'person' },
  { id: 'SupportAgent', label: 'Atendente', material: 'support_agent' },
  { id: 'Chat', label: 'Chat', material: 'chat' },
  { id: 'Mail', label: 'E-mail', material: 'mail' },
  { id: 'Phone', label: 'Telefone', material: 'phone' },
  { id: 'Inbox', label: 'Caixa de entrada', material: 'inbox' },
  { id: 'Sync', label: 'Sincronizar', material: 'sync' },
];

export const TRIAGE_DEFAULT_STATUS_ICON = 'AccessTime';
export const TRIAGE_DEFAULT_STATUS_COLOR = '#5c6bc0';

export const TRIAGE_DEFAULT_STATUSES = [
  {
    id: 'waiting',
    value: 'waiting',
    label: 'Espera',
    order: 1,
    is_default_entry: true,
    is_terminal: false,
    system: true,
    icon: 'AccessTimeFilled',
    color: '#7A5B7A',
  },
  {
    id: 'done',
    value: 'done',
    label: 'Concluído',
    order: 99,
    is_default_entry: false,
    is_terminal: true,
    system: true,
    icon: 'CheckCircle',
    color: '#2e7d32',
  },
];

const TRIAGE_STATUS_ICON_IDS = new Set(TRIAGE_STATUS_ICON_OPTIONS.map((o) => o.id));

/** Fill missing icon/color on a status (legacy configs). */
export function normalizeTriageStatus(status) {
  if (!status || typeof status !== 'object') return status;
  const next = { ...status };
  const iconOk = next.icon && TRIAGE_STATUS_ICON_IDS.has(String(next.icon));
  if (!iconOk) {
    if (next.is_default_entry) next.icon = 'AccessTimeFilled';
    else if (next.is_terminal) next.icon = 'CheckCircle';
    else next.icon = TRIAGE_DEFAULT_STATUS_ICON;
  }
  const color = String(next.color || '').trim();
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
    if (next.is_default_entry) next.color = '#7A5B7A';
    else if (next.is_terminal) next.color = '#2e7d32';
    else next.color = TRIAGE_DEFAULT_STATUS_COLOR;
  } else {
    next.color = color;
  }
  return next;
}

export function normalizeTriageStatuses(statuses) {
  return (Array.isArray(statuses) ? statuses : []).map(normalizeTriageStatus);
}

export const TRIAGE_CONFIG_KEYS = {
  formFields: 'triage.form.fields',
  customFields: 'triage.form.custom_fields',
  statuses: 'triage.statuses',
  associateDocs: 'triage.module.associate_docs',
  publicFormEnabled: 'triage.public_form_enabled',
  formTheme: 'triage.form.theme',
  formTitle: 'triage.form.title',
  formSubtitle: 'triage.form.subtitle',
  successTitle: 'triage.form.success_title',
  successSubtitle: 'triage.form.success_subtitle',
};

/** Textos padrão do formulário público de triagem. */
export const TRIAGE_DEFAULT_COPY = {
  formTitle: 'Fila de acolhimento',
  formSubtitle: 'Preencha para entrar na fila de contato do acolhimento',
  successTitle: 'Você entrou na fila',
  successSubtitle: 'Em breve a equipe de acolhimento entrará em contato.',
};

export function parseJsonConfig(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

export function parseBoolConfig(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).toLowerCase().trim();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

/** Texto configurável: trim; vazio → fallback. */
export function normalizeTriageText(raw, fallback = '') {
  const value = String(raw ?? '').trim();
  return value || String(fallback || '');
}

/** Tema visual do formulário público: `dark` (padrão) ou `light`. */
export function normalizeTriageFormTheme(raw, fallback = 'dark') {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'light' || value === 'claro') return 'light';
  if (value === 'dark' || value === 'escuro') return 'dark';
  return fallback === 'light' ? 'light' : 'dark';
}

export function getTriageDefaults() {
  return {
    formFields: TRIAGE_DEFAULT_FORM_FIELDS.map((f) => ({
      ...f,
      options: Array.isArray(f.options) ? [...f.options] : f.options,
    })),
    customFields: [],
    statuses: TRIAGE_DEFAULT_STATUSES.map((s) => ({ ...s })),
    associateDocs: false,
    publicFormEnabled: true,
    formTheme: 'dark',
    formTitle: TRIAGE_DEFAULT_COPY.formTitle,
    formSubtitle: TRIAGE_DEFAULT_COPY.formSubtitle,
    successTitle: TRIAGE_DEFAULT_COPY.successTitle,
    successSubtitle: TRIAGE_DEFAULT_COPY.successSubtitle,
  };
}

/**
 * Merge triage public/admin resolved values into defaults.
 * @param {Record<string, string>|null|undefined} apiValues key → raw string
 */
export function mergeTriageConfigFromApi(apiValues) {
  const defaults = getTriageDefaults();
  if (!apiValues || typeof apiValues !== 'object') return defaults;
  const keys = TRIAGE_CONFIG_KEYS;
  return {
    formFields: normalizeTriageFormFields(
      parseJsonConfig(apiValues[keys.formFields], defaults.formFields),
    ),
    customFields: parseJsonConfig(apiValues[keys.customFields], defaults.customFields),
    statuses: normalizeTriageStatuses(
      parseJsonConfig(apiValues[keys.statuses], defaults.statuses),
    ),
    associateDocs: parseBoolConfig(apiValues[keys.associateDocs], defaults.associateDocs),
    publicFormEnabled: parseBoolConfig(
      apiValues[keys.publicFormEnabled],
      defaults.publicFormEnabled,
    ),
    formTheme: normalizeTriageFormTheme(apiValues[keys.formTheme], defaults.formTheme),
    formTitle: normalizeTriageText(apiValues[keys.formTitle], defaults.formTitle),
    formSubtitle: normalizeTriageText(apiValues[keys.formSubtitle], defaults.formSubtitle),
    successTitle: normalizeTriageText(apiValues[keys.successTitle], defaults.successTitle),
    successSubtitle: normalizeTriageText(apiValues[keys.successSubtitle], defaults.successSubtitle),
  };
}

export function getEnabledFormFields(triageConfig) {
  const cfg = triageConfig || getTriageDefaults();
  const standard = (cfg.formFields || [])
    .filter((f) => f && f.enabled !== false)
    .map((f) => ({ ...f, source: 'standard' }));
  const custom = (cfg.customFields || [])
    .filter((f) => f && f.enabled !== false)
    .map((f) => ({ ...f, source: 'custom' }));
  return [...standard, ...custom].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getEntryStatusValue(statuses = TRIAGE_DEFAULT_STATUSES) {
  const entry = (statuses || []).find((s) => s.is_default_entry);
  return entry?.value || 'waiting';
}

export function getTerminalStatusValue(statuses = TRIAGE_DEFAULT_STATUSES) {
  const terminal = (statuses || []).find((s) => s.is_terminal);
  return terminal?.value || 'done';
}

/** Default order statuses (payment toggle + SC approval). Extra statuses via admin. */
export const ORDER_DEFAULT_STATUSES = [
  {
    id: 'awaiting_payment',
    value: 'Aguardando pagamento',
    label: 'Aguardando pagamento',
    order: 1,
    system: true,
    is_awaiting: true,
    color: '#c9a227',
  },
  {
    id: 'payment_done',
    value: 'Pagamento concluído',
    label: 'Pagamento concluído',
    order: 2,
    system: true,
    is_paid: true,
    color: '#2e7d32',
  },
  {
    id: 'awaiting_approval',
    value: 'Aguardando aprovação',
    label: 'Aguardando aprovação',
    order: 3,
    system: true,
    is_awaiting_approval: true,
    color: '#1565c0',
  },
];

export const ORDER_STATUS_AWAITING = 'Aguardando pagamento';
export const ORDER_STATUS_PAID = 'Pagamento concluído';
export const ORDER_STATUS_AWAITING_APPROVAL = 'Aguardando aprovação';

export const STORE_ORDER_STATUS_KEY = 'store.order_statuses';

export function normalizeOrderStatuses(statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  if (!list.length) return ORDER_DEFAULT_STATUSES.map((s) => ({ ...s }));
  return list
    .filter((s) => s && s.value)
    .map((s, i) => ({
      id: s.id || `st_${i}`,
      value: String(s.value),
      label: String(s.label || s.value),
      order: Number(s.order) || i + 1,
      system: Boolean(s.system),
      is_awaiting: Boolean(s.is_awaiting),
      is_paid: Boolean(s.is_paid),
      is_awaiting_approval: Boolean(s.is_awaiting_approval),
      color: s.color || '#5c6bc0',
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getOrderStatusDefaults() {
  return { statuses: ORDER_DEFAULT_STATUSES.map((s) => ({ ...s })) };
}

export function mergeOrderStatusesFromApi(raw) {
  const parsed = parseJsonConfig(raw, ORDER_DEFAULT_STATUSES);
  return normalizeOrderStatuses(parsed);
}

export function getAwaitingPaymentValue(statuses = ORDER_DEFAULT_STATUSES) {
  const row = (statuses || []).find((s) => s.is_awaiting);
  return row?.value || ORDER_STATUS_AWAITING;
}

export function getPaidStatusValue(statuses = ORDER_DEFAULT_STATUSES) {
  const row = (statuses || []).find((s) => s.is_paid);
  return row?.value || ORDER_STATUS_PAID;
}

export function getAwaitingApprovalValue(statuses = ORDER_DEFAULT_STATUSES) {
  const row = (statuses || []).find((s) => s.is_awaiting_approval);
  return row?.value || ORDER_STATUS_AWAITING_APPROVAL;
}

export function isAllowedOrderStatus(status, statuses = ORDER_DEFAULT_STATUSES) {
  const v = String(status || '');
  return (statuses || []).some((s) => String(s.value) === v);
}

export function getPublicConfig(env = import.meta.env) {
  return {
    apiUrl: env.VITE_API_URL || '/api/v1',
    appUrl: env.VITE_URL || 'http://localhost:4255',
    associationName: env.VITE_ASSOCIATION_NAME || ASSOCIATION_DATA_DEFAULTS.associationName || 'Kunk',
    associationFullName: env.VITE_ASSOCIATION_FULL_NAME || ASSOCIATION_DATA_DEFAULTS.associationFullName,
    associationEmail: env.VITE_ASSOCIATION_EMAIL || ASSOCIATION_DATA_DEFAULTS.associationEmail,
    associationPhone: env.VITE_ASSOCIATION_PHONE || ASSOCIATION_DATA_DEFAULTS.associationPhone,
    associationSite: env.VITE_ASSOCIATION_SITE || ASSOCIATION_DATA_DEFAULTS.associationSite,
    associationCnpj: env.VITE_ASSOCIATION_CNPJ || ASSOCIATION_DATA_DEFAULTS.associationCnpj,
    associationCity: env.VITE_ASSOCIATION_CITY || ASSOCIATION_DATA_DEFAULTS.associationCity,
    associationState: env.VITE_ASSOCIATION_STATE || ASSOCIATION_DATA_DEFAULTS.associationState,
    associationLogo: env.VITE_ASSOCIATION_LOGO || '/logo.svg',
    associationLogoMenu: env.VITE_ASSOCIATION_LOGO_MENU || env.VITE_ASSOCIATION_LOGO || '/logo.svg',
    associationLogoSize: env.VITE_ASSOCIATION_LOGO_SIZE || '180px',
    associationLogoSquare: env.VITE_ASSOCIATION_LOGO_SQUARE || '',
    associationLogoRectangular: env.VITE_ASSOCIATION_LOGO_RECTANGULAR || '',
    associationLogoFormat: normalizeLogoFormat(env.VITE_ASSOCIATION_LOGO_FORMAT),
    associationLogoPlacements: normalizeLogoPlacements(
      env.VITE_ASSOCIATION_LOGO_PLACEMENTS,
      env.VITE_ASSOCIATION_LOGO_FORMAT,
    ),
    welcomeText: env.VITE_WELCOME_TEXT || REGISTRATION_SYSTEM_DEFAULTS.welcomeText,
    completionText: env.VITE_COMPLETION_TEXT || REGISTRATION_SYSTEM_DEFAULTS.completionText,
    showTriageButton: parseEnvBool(env.VITE_SHOW_TRIAGE_BUTTON, REGISTRATION_SYSTEM_DEFAULTS.showTriageButton),
    triageFormUrl: env.VITE_TRIAGE_FORM_URL || REGISTRATION_SYSTEM_DEFAULTS.triageFormUrl,
    contactUrl: env.VITE_CONTACT_URL || '',
  };
}

/**
 * Bootstrap + hardcoded defaults for Kunk operational appearance.
 * @param {ImportMetaEnv|Record<string, string|undefined>} [env]
 */
export function getKunkPublicConfig(env = import.meta.env) {
  const d = KUNK_APPEARANCE_DEFAULTS;
  return {
    apiUrl: env.VITE_API_URL || '/api/v1',
    appUrl: env.VITE_URL || 'http://localhost:4257',
    title: env.VITE_KUNK_TITLE || d.title,
    logo: env.VITE_KUNK_LOGO || d.logo,
    logoFormat: d.logoFormat,
    logoSquare: d.logoSquare,
    logoRectangular: d.logoRectangular,
    logoPlacements: defaultLogoPlacements(d.logoFormat),
    bgMode: env.VITE_KUNK_BG_MODE || d.bgMode,
    bgColor: env.VITE_KUNK_BG_COLOR || d.bgColor,
    bgImage: env.VITE_KUNK_BG_IMAGE || d.bgImage,
    menuBg: env.VITE_KUNK_MENU_BG || d.menuBg,
    menuText: env.VITE_KUNK_MENU_TEXT || d.menuText,
    menuHoverBg: env.VITE_KUNK_MENU_HOVER_BG || d.menuHoverBg,
    menuHoverText: env.VITE_KUNK_MENU_HOVER_TEXT || d.menuHoverText,
    defaultTheme: env.VITE_KUNK_DEFAULT_THEME || d.defaultTheme,
    darkBg: env.VITE_KUNK_DARK_BG || d.darkBg,
    darkPrimary: env.VITE_KUNK_DARK_PRIMARY || d.darkPrimary,
    darkAccent: env.VITE_KUNK_DARK_ACCENT || d.darkAccent,
    darkAccentHover: env.VITE_KUNK_DARK_ACCENT_HOVER || d.darkAccentHover,
    lightBg: env.VITE_KUNK_LIGHT_BG || d.lightBg,
    lightPrimary: env.VITE_KUNK_LIGHT_PRIMARY || d.lightPrimary,
    lightAccent: env.VITE_KUNK_LIGHT_ACCENT || d.lightAccent,
    lightAccentHover: env.VITE_KUNK_LIGHT_ACCENT_HOVER || d.lightAccentHover,
  };
}

/**
 * Merge resolved public config values from GET /config/public into a base config.
 * Only branding keys are applied; apiUrl/appUrl stay from Vite bootstrap.
 * @param {ReturnType<typeof getPublicConfig>} base
 * @param {Record<string, string>|null|undefined} apiValues map of env key → value
 */
export function mergePublicConfigFromApi(base, apiValues) {
  if (!apiValues || typeof apiValues !== 'object') return { ...base };
  const next = { ...base };
  for (const envKey of BRANDING_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(apiValues, envKey)) continue;
    const prop = ENV_TO_CONFIG[envKey];
    if (!prop) continue;
    const raw = apiValues[envKey];
    if (raw === undefined || raw === null) continue;
    if (prop === 'showTriageButton') {
      next[prop] = parseEnvBool(raw, REGISTRATION_SYSTEM_DEFAULTS.showTriageButton);
    } else if (prop === 'associationLogoFormat') {
      next[prop] = normalizeLogoFormat(raw);
    } else if (prop === 'associationLogoPlacements') {
      next[prop] = raw;
    } else {
      next[prop] = String(raw);
    }
  }
  if (!next.associationLogoMenu) {
    next.associationLogoMenu = next.associationLogo || '/logo.svg';
  }
  // Migração: logo legada vira square se square ainda vazio.
  if (!resolveBrandingLogoUrl(next.associationLogoSquare) && resolveBrandingLogoUrl(next.associationLogo)) {
    next.associationLogoSquare = next.associationLogo;
  }
  next.associationLogoPlacements = normalizeLogoPlacements(
    next.associationLogoPlacements,
    next.associationLogoFormat,
  );
  const kunkLogin = resolvePlacementLogo({
    placements: next.associationLogoPlacements,
    app: 'kunk',
    surface: 'login',
    square: next.associationLogoSquare,
    rectangular: next.associationLogoRectangular,
    legacy: next.associationLogo,
    legacyFormat: next.associationLogoFormat,
  });
  const kunkMenu = resolvePlacementLogo({
    placements: next.associationLogoPlacements,
    app: 'kunk',
    surface: 'menu',
    square: next.associationLogoSquare,
    rectangular: next.associationLogoRectangular,
    legacy: next.associationLogo,
    legacyFormat: next.associationLogoFormat,
  });
  next.associationLogoFormat = kunkLogin.format;
  if (kunkLogin.url) next.associationLogo = kunkLogin.url;
  if (kunkMenu.url) next.associationLogoMenu = kunkMenu.url;
  return next;
}

/** Placeholder bootstrap logo — never treat as association branding. */
export function isPlaceholderLogo(href) {
  const url = String(href || '').trim();
  if (!url) return true;
  const path = url.split('?')[0].toLowerCase();
  return path === '/logo.svg' || path.endsWith('/logo.svg');
}

/**
 * First usable branding logo URL from candidates (skips empty / placeholder).
 * @param {...unknown} candidates
 * @returns {string}
 */
export function resolveBrandingLogoUrl(...candidates) {
  for (const candidate of candidates) {
    const url = String(candidate || '').trim();
    if (url && !isPlaceholderLogo(url)) return url;
  }
  return '';
}

/**
 * Extract file id from `/api/v1/files/{id}/download` (or similar) URLs.
 * @param {unknown} href
 * @returns {string|null}
 */
export function extractFileIdFromDownloadUrl(href) {
  const match = String(href || '').match(/\/files\/([^/?#]+)\/download/i);
  return match?.[1] || null;
}

/**
 * Merge GET /config/public?system=kunk values into a Kunk appearance config.
 * @param {ReturnType<typeof getKunkPublicConfig>} base
 * @param {Record<string, string>|null|undefined} apiValues
 */
export function mergeKunkPublicConfigFromApi(base, apiValues) {
  if (!apiValues || typeof apiValues !== 'object') return { ...base };
  const next = { ...base };
  for (const envKey of KUNK_BRANDING_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(apiValues, envKey)) continue;
    const prop = ENV_TO_KUNK_CONFIG[envKey];
    if (!prop) continue;
    const raw = apiValues[envKey];
    if (raw === undefined || raw === null) continue;
    next[prop] = String(raw);
  }
  if (next.bgMode !== 'image' && next.bgMode !== 'color') {
    next.bgMode = KUNK_APPEARANCE_DEFAULTS.bgMode;
  }
  if (next.defaultTheme !== 'light' && next.defaultTheme !== 'dark') {
    next.defaultTheme = KUNK_APPEARANCE_DEFAULTS.defaultTheme;
  }
  return next;
}

/**
 * Apply association branding (square/rect/placements) onto a Kunk config object.
 * Default `logo` / `logoFormat` mirror kunk login placement for backward compat.
 * @param {ReturnType<typeof getKunkPublicConfig>} kunkConfig
 * @param {ReturnType<typeof getPublicConfig>|Record<string, unknown>} regConfig
 */
export function applyAssociationLogoToKunkConfig(kunkConfig, regConfig = {}) {
  const format = normalizeLogoFormat(
    regConfig.associationLogoFormat || kunkConfig.logoFormat,
  );
  const square = resolveBrandingLogoUrl(
    regConfig.associationLogoSquare,
    kunkConfig.logoSquare,
    kunkConfig.logo,
    regConfig.associationLogo,
  );
  const rectangular = resolveBrandingLogoUrl(
    regConfig.associationLogoRectangular,
    kunkConfig.logoRectangular,
  );
  const placements = normalizeLogoPlacements(
    regConfig.associationLogoPlacements ?? kunkConfig.logoPlacements,
    format,
  );
  const login = resolvePlacementLogo({
    placements,
    app: 'kunk',
    surface: 'login',
    square,
    rectangular,
    legacy: kunkConfig.logo,
    legacyFormat: format,
  });
  return {
    ...kunkConfig,
    logoFormat: login.format,
    logoSquare: square,
    logoRectangular: rectangular,
    logoPlacements: placements,
    logo: login.url || resolveBrandingLogoUrl(kunkConfig.logo) || '',
  };
}
