import React from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import { rememberAdminRoute } from '../lib/lastRoute.js';
import { dismissStoragePrompt, isStoragePromptDismissed } from '../lib/storageConfig.js';
import {
  EMAIL_CONFIG_PATH,
  dismissEmailPrompt,
  isEmailPromptDismissed,
} from '../lib/emailModuleConfig.js';
import { loadExternalServices } from '../lib/externalServicesConfig.js';
import {
  EXT_FREIGHT_SLUGS,
  EXT_OTHER_SLUGS,
  EXT_SERVICE_LABELS,
  deriveExternalServiceStatus,
  deriveShippingStatus,
} from '../lib/externalServiceStatus.js';
import { ExternalServiceStatusIcon } from '../components/ExternalServiceStatus.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { useInstallStatus } from '../lib/installStatus.jsx';
import {
  getPublicConfig,
  mergePublicConfigFromApi,
  resolvePlacementLogo,
  isPlaceholderLogo,
} from '@kunk/config';

export function RequireAdmin({ children }) {
  const { user, loading, hasRequiredRole } = useOperatorAuth();
  const { needsInstall, canInstallSample, loading: installLoading } = useInstallStatus();
  const location = useLocation();

  if (loading || installLoading || needsInstall == null) {
    return <AdminLoader label="Carregando sessão…" className="admin-loader--viewport" />;
  }
  if (needsInstall || canInstallSample) {
    return <Navigate to="/instalacao" replace />;
  }
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!hasRequiredRole) {
    return <Navigate to="/sem-permissao" replace />;
  }
  return children;
}

function StoragePromptModal({ open, onYes, onNo }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configurar armazenamento">
      <div className="modal-card">
        <h2 style={{ marginTop: 0 }}>Armazenamento em nuvem</h2>
        <p>
          O sistema está usando disco local para arquivos. Recomendamos configurar um bucket
          (Amazon S3 ou Google Cloud Storage) para maior resiliência e backups.
        </p>
        <p className="muted">Deseja configurar o armazenamento em nuvem agora?</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={onNo}>
            Não
          </button>
          <button type="button" className="btn btn-primary" onClick={onYes}>
            Sim
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailPromptModal({ open, onLater, onConfigure }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configurar módulo de e-mail">
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Módulo de e-mail</h2>
        <p>
          O envio de e-mails está desativado. Recomendamos ativar esse módulo para convites de
          operadores, redefinição de senha, assinatura de documentos e outras notificações.
        </p>
        <p className="muted">
          Ative o módulo e configure o SMTP em Serviços externos → E-mail quando quiser usar os
          fluxos que dependem de e-mail.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1rem',
          }}
        >
          <button type="button" className="btn" onClick={onLater}>
            Configurar depois
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfigure}>
            Configurar
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtNavLink({ to, end, status, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `admin-nav-ext-link${isActive ? ' active' : ''}`}
    >
      {status ? (
        <ExternalServiceStatusIcon kind={status.kind} label={status.label} />
      ) : (
        <span className="ext-status-dot ext-status-dot--disabled" aria-hidden="true" />
      )}
      <span>{children}</span>
    </NavLink>
  );
}

function NavIcon({ name, size = 15 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className: 'admin-nav-icon',
  };
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'book':
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case 'building':
      return (
        <svg {...props}>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
          <path d="M6 12h12" />
          <path d="M6 16h12" />
          <path d="M10 6h.01" />
          <path d="M14 6h.01" />
          <path d="M10 10h.01" />
          <path d="M14 10h.01" />
          <path d="M2 22h20" />
        </svg>
      );
    case 'database':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'apps':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'plug':
      return (
        <svg {...props}>
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a6 6 0 0 1-12 0V8z" />
        </svg>
      );
    case 'wrench':
      return (
        <svg {...props}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    default:
      return null;
  }
}

const OFFICIAL_DOCS_URL = 'https://kunksoucannabis.ong.br/';

function TopNavLink({ to, href, end, icon, children, external }) {
  if (external && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="admin-nav-link-icon"
        data-testid="admin-nav-docs-external"
      >
        <NavIcon name={icon} />
        <span>{children}</span>
      </a>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `admin-nav-link-icon${isActive ? ' active' : ''}`}
    >
      <NavIcon name={icon} />
      <span>{children}</span>
    </NavLink>
  );
}

function pathMatches(pathname, prefixes = []) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const EXTERNOS_ALSO_OPEN = ['transportadoras'];
const EMPTY_ALSO_OPEN = [];
const EMPTY_MATCH = [];

/** Seções / grupos / subgrupos — todos fechados por padrão. */
function NavFold({
  id,
  label,
  level = 'section',
  icon,
  openMap,
  setOpenMap,
  match = EMPTY_MATCH,
  /** Prefixos que forçam abertura (default = match). Separado do destaque is-active. */
  openMatch,
  /** Ao abrir este fold, também abre estes ids (ex.: Transportadoras dentro de Serviços externos). */
  alsoOpen = EMPTY_ALSO_OPEN,
  children,
}) {
  const location = useLocation();
  const open = Boolean(openMap[id]);
  const active = pathMatches(location.pathname, match);
  const shouldOpen = pathMatches(location.pathname, openMatch ?? match);
  const prevShouldOpenRef = React.useRef(false);

  // Só auto-abre ao entrar na rota (false → true). Se o usuário fechar manualmente
  // enquanto ainda está na seção, não força reabrir a cada re-render.
  React.useEffect(() => {
    const entered = shouldOpen && !prevShouldOpenRef.current;
    prevShouldOpenRef.current = shouldOpen;
    if (!entered) return;
    setOpenMap((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!next[id]) {
        next[id] = true;
        changed = true;
      }
      for (const childId of alsoOpen) {
        if (!next[childId]) {
          next[childId] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [shouldOpen, id, alsoOpen, setOpenMap]);

  function toggle() {
    setOpenMap((prev) => {
      const nextOpen = !prev[id];
      const next = { ...prev, [id]: nextOpen };
      if (nextOpen) {
        for (const childId of alsoOpen) {
          next[childId] = true;
        }
      }
      return next;
    });
  }

  const foldClass =
    level === 'section'
      ? 'admin-nav-section admin-nav-fold'
      : level === 'group'
        ? 'admin-nav-group admin-nav-fold'
        : 'admin-nav-subgroup admin-nav-fold';

  return (
    <div className={`admin-nav-fold-block admin-nav-fold-block--${level}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`${foldClass}${active ? ' is-active' : ''}`}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="admin-nav-fold-main">
          {level === 'section' && icon ? <NavIcon name={icon} /> : null}
          <span className="admin-nav-fold-label">{label}</span>
        </span>
        <span className="admin-nav-fold-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? <div className="admin-nav-fold-body">{children}</div> : null}
    </div>
  );
}

export function AdminShell({ api }) {
  const { user, logout } = useOperatorAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showStoragePrompt, setShowStoragePrompt] = React.useState(false);
  const [emailModuleActive, setEmailModuleActive] = React.useState(null);
  const [emailPromptOpen, setEmailPromptOpen] = React.useState(false);
  const [extStatuses, setExtStatuses] = React.useState({});
  const [navOpen, setNavOpen] = React.useState({});
  const [menuLogo, setMenuLogo] = React.useState({ url: '', format: 'square', width: 40, height: 40 });

  const onEmailConfigPage = location.pathname === EMAIL_CONFIG_PATH;

  React.useEffect(() => {
    if (!api?.get) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/config/public?system=registration');
        if (cancelled) return;
        const merged = mergePublicConfigFromApi(getPublicConfig(), res?.data?.values || {});
        const placement = resolvePlacementLogo({
          placements: merged.associationLogoPlacements,
          app: 'admin',
          surface: 'menu',
          square: merged.associationLogoSquare,
          rectangular: merged.associationLogoRectangular,
          legacy: merged.associationLogo,
        });
        const url = isPlaceholderLogo(placement.url) ? '' : placement.url;
        if (!cancelled) {
          setMenuLogo({
            url,
            format: placement.format,
            width: placement.width,
            height: placement.height,
          });
        }
      } catch {
        /* keep empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  React.useEffect(() => {
    rememberAdminRoute(location.pathname, location.search);
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('.admin-main');
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  const refreshExtStatuses = React.useCallback(async () => {
    if (!api) return;
    try {
      const res = await loadExternalServices(api);
      const next = {};
      for (const s of res.services || []) {
        next[s.service] = deriveExternalServiceStatus(s);
      }
      next.envio = deriveShippingStatus(res.store_incomplete);
      setExtStatuses(next);

      const emailService = (res.services || []).find((s) => s.service === 'email');
      const active = emailService ? Boolean(emailService.enabled) : false;
      setEmailModuleActive(active);

      // Com sample data, o modal de SMTP atrapalha demos — não exibir.
      let hasSampleData = false;
      try {
        const sampleRes = await api.getSampleDataSummary();
        hasSampleData = Number(sampleRes.data?.total || 0) > 0;
      } catch {
        /* ignore — endpoint pode falhar sem schema/seed */
      }

      if (!active && !hasSampleData && !isEmailPromptDismissed()) {
        setEmailPromptOpen(true);
      } else {
        setEmailPromptOpen(false);
      }
    } catch {
      /* menu continua sem dots coloridos */
    }
  }, [api]);

  React.useEffect(() => {
    refreshExtStatuses();
  }, [refreshExtStatuses, location.pathname]);

  React.useEffect(() => {
    function onChanged() {
      refreshExtStatuses();
    }
    window.addEventListener('kunk:external-services-changed', onChanged);
    return () => window.removeEventListener('kunk:external-services-changed', onChanged);
  }, [refreshExtStatuses]);

  React.useEffect(() => {
    if (!api || isStoragePromptDismissed()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getStorageStatus();
        const driver = res.data?.driver || 'local';
        if (!cancelled && driver === 'local') {
          setShowStoragePrompt(true);
        }
      } catch {
        /* ignore — seed SQL pode ainda não ter sido aplicado */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  function onStorageYes() {
    setShowStoragePrompt(false);
    navigate('/armazenamento');
  }

  function onStorageNo() {
    dismissStoragePrompt();
    setShowStoragePrompt(false);
  }

  function onEmailLater() {
    dismissEmailPrompt();
    setEmailPromptOpen(false);
  }

  function onEmailConfigure() {
    setEmailPromptOpen(false);
    navigate(EMAIL_CONFIG_PATH);
  }

  const emailPromptDismissed = isEmailPromptDismissed();
  const showEmailModal = emailPromptOpen && emailModuleActive === false && !onEmailConfigPage;
  const showStorageModal =
    showStoragePrompt && (emailModuleActive === true || emailPromptDismissed);

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">
          {menuLogo.url ? (
            <div className="brand-logo-wrap">
              <img
                className={`brand-logo brand-logo--${menuLogo.format}`}
                src={menuLogo.url}
                alt=""
                style={{ width: menuLogo.width, height: 'auto' }}
              />
            </div>
          ) : null}
          <span className="brand-text">Kunk Admin</span>
        </div>

        <TopNavLink to="/home" icon="home">
          Home
        </TopNavLink>
        <TopNavLink href={OFFICIAL_DOCS_URL} icon="book" external>
          Documentação
        </TopNavLink>

        <TopNavLink to="/dados-associacao" icon="building">
          Dados da associação
        </TopNavLink>
        <TopNavLink to="/dados" icon="database">
          Banco de dados
        </TopNavLink>

        <NavFold
          id="aplicativos"
          label="Aplicativos"
          level="section"
          icon="apps"
          openMap={navOpen}
          setOpenMap={setNavOpen}
          match={['/sistema-cadastro', '/kunk', '/triagem', '/loja', '/aparencia']}
        >
          <NavFold
            id="kunk"
            label="Kunk"
            level="group"
            openMap={navOpen}
            setOpenMap={setNavOpen}
            match={['/kunk', '/triagem', '/loja', '/aparencia']}
          >
            <div className="admin-nav-nested">
              <NavFold
                id="triagem"
                label="Triagem"
                level="subgroup"
                openMap={navOpen}
                setOpenMap={setNavOpen}
                match={['/triagem']}
              >
                <div className="admin-nav-nested">
                  <NavLink to="/triagem/formulario" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Formulário
                  </NavLink>
                  <NavLink to="/triagem/status" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Status da fila
                  </NavLink>
                  <NavLink to="/triagem/modulos" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Módulos
                  </NavLink>
                </div>
              </NavFold>
              <NavFold
                id="profissionais"
                label="Profissionais"
                level="subgroup"
                openMap={navOpen}
                setOpenMap={setNavOpen}
                match={['/kunk/configuracao-profissionais']}
              >
                <div className="admin-nav-nested">
                  <NavLink
                    to="/kunk/configuracao-profissionais"
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    Configurações
                  </NavLink>
                </div>
              </NavFold>
              <NavFold
                id="loja"
                label="Loja"
                level="subgroup"
                openMap={navOpen}
                setOpenMap={setNavOpen}
                match={['/loja']}
              >
                <div className="admin-nav-nested">
                  <NavLink to="/loja/status-pedidos" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Status dos pedidos
                  </NavLink>
                </div>
              </NavFold>
              <NavFold
                id="kunk-configuracoes"
                label="Configurações"
                level="subgroup"
                openMap={navOpen}
                setOpenMap={setNavOpen}
                match={[
                  '/kunk/permissoes',
                  '/kunk/ciap2',
                  '/kunk/aparencia',
                  '/kunk/importacao',
                ]}
              >
                <div className="admin-nav-nested">
                  <NavLink to="/kunk/permissoes" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Permissões de acesso
                  </NavLink>
                  <NavLink to="/kunk/ciap2" className={({ isActive }) => (isActive ? 'active' : '')}>
                    CIAP-2
                  </NavLink>
                  <NavLink to="/kunk/aparencia" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Aparência
                  </NavLink>
                  <NavLink to="/kunk/importacao" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Importação de dados
                  </NavLink>
                </div>
              </NavFold>
            </div>
          </NavFold>
          <NavFold
            id="cadastro"
            label="Sistema de cadastro"
            level="group"
            openMap={navOpen}
            setOpenMap={setNavOpen}
            match={['/sistema-cadastro']}
          >
            <div className="admin-nav-nested">
              <NavLink to="/sistema-cadastro" className={({ isActive }) => (isActive ? 'active' : '')}>
                Configurações
              </NavLink>
            </div>
          </NavFold>
        </NavFold>

        <NavFold
          id="externos"
          label="Serviços externos"
          level="section"
          icon="plug"
          openMap={navOpen}
          setOpenMap={setNavOpen}
          match={['/servicos-externos']}
          alsoOpen={EXTERNOS_ALSO_OPEN}
        >
          <NavLink to="/servicos-externos" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Visão geral
          </NavLink>
          <NavFold
            id="transportadoras"
            label="Transportadoras"
            level="group"
            openMap={navOpen}
            setOpenMap={setNavOpen}
            match={[
              '/servicos-externos/envio',
              ...EXT_FREIGHT_SLUGS.map((s) => `/servicos-externos/${s}`),
            ]}
            openMatch={['/servicos-externos']}
          >
            <div className="admin-nav-nested">
              <ExtNavLink to="/servicos-externos/envio" status={extStatuses.envio}>
                Dados de envio
              </ExtNavLink>
              {EXT_FREIGHT_SLUGS.map((slug) => (
                <ExtNavLink key={slug} to={`/servicos-externos/${slug}`} status={extStatuses[slug]}>
                  {EXT_SERVICE_LABELS[slug] || slug}
                </ExtNavLink>
              ))}
            </div>
          </NavFold>
          {EXT_OTHER_SLUGS.map((slug) => (
            <ExtNavLink key={slug} to={`/servicos-externos/${slug}`} status={extStatuses[slug]}>
              {EXT_SERVICE_LABELS[slug] || slug}
            </ExtNavLink>
          ))}
        </NavFold>

        <NavFold
          id="configs"
          label="Configurações do sistema"
          level="section"
          icon="settings"
          openMap={navOpen}
          setOpenMap={setNavOpen}
          match={['/armazenamento', '/cache']}
        >
          <NavLink to="/armazenamento" className={({ isActive }) => (isActive ? 'active' : '')}>
            Armazenamento e Backup
          </NavLink>
          <NavLink to="/cache" className={({ isActive }) => (isActive ? 'active' : '')}>
            Cache
          </NavLink>
        </NavFold>

        <NavFold
          id="webmaster"
          label="Webmaster"
          level="section"
          icon="wrench"
          openMap={navOpen}
          setOpenMap={setNavOpen}
          match={['/usuarios', '/credenciais-suporte', '/acesso-api', '/webhooks', '/erros-sistema', '/web-vitals']}
        >
          <NavLink to="/usuarios" className={({ isActive }) => (isActive ? 'active' : '')}>
            Usuários
          </NavLink>
          <NavLink to="/credenciais-suporte" className={({ isActive }) => (isActive ? 'active' : '')}>
            Credenciais de suporte
          </NavLink>
          <NavLink to="/acesso-api" className={({ isActive }) => (isActive ? 'active' : '')}>
            API
          </NavLink>
          <NavLink to="/webhooks" className={({ isActive }) => (isActive ? 'active' : '')}>
            Webhooks
          </NavLink>
          <NavLink to="/erros-sistema" className={({ isActive }) => (isActive ? 'active' : '')}>
            Erros do sistema
          </NavLink>
          <NavLink to="/web-vitals" className={({ isActive }) => (isActive ? 'active' : '')}>
            Web Vitals
          </NavLink>
        </NavFold>

        <div style={{ flex: 1 }} />
        <div className="muted" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
          {user?.email || user?.name}
        </div>
        <button type="button" className="btn" onClick={onLogout}>
          Sair
        </button>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
      <EmailPromptModal
        open={showEmailModal}
        onLater={onEmailLater}
        onConfigure={onEmailConfigure}
      />
      <StoragePromptModal open={showStorageModal} onYes={onStorageYes} onNo={onStorageNo} />
    </div>
  );
}
