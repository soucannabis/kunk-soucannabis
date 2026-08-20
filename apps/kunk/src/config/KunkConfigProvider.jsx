import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getKunkPublicConfig,
  mergeKunkPublicConfigFromApi,
  mergePublicConfigFromApi,
  getPublicConfig,
  applyAssociationLogoToKunkConfig,
} from '@kunk/config';

const STORAGE_KEY = 'selectedTheme';

const KunkConfigContext = createContext({
  config: getKunkPublicConfig(),
  configErrors: [],
  configReady: false,
  themeMode: 'dark',
  setThemeMode: () => {},
});

/**
 * Apply appearance tokens to :root based on config + active theme mode.
 * @param {ReturnType<typeof getKunkPublicConfig>} config
 * @param {'dark'|'light'} themeMode
 */
export function applyKunkAppearanceVars(config, themeMode) {
  const root = document.documentElement;
  const isLight = themeMode === 'light';

  const appBg = isLight ? config.lightBg : config.darkBg;
  const primary = isLight ? config.lightPrimary : config.darkPrimary;
  const accent = isLight ? config.lightAccent : config.darkAccent;
  const accentHover = isLight ? config.lightAccentHover : config.darkAccentHover;

  const useImage = config.bgMode === 'image' && Boolean(config.bgImage);

  root.dataset.theme = themeMode;
  root.style.setProperty('--kunk-app-bg', useImage ? 'transparent' : appBg);
  root.style.setProperty('--kunk-menu-bg', config.menuBg || primary);
  root.style.setProperty('--kunk-menu-text', config.menuText);
  root.style.setProperty('--kunk-menu-hover-bg', config.menuHoverBg);
  root.style.setProperty('--kunk-menu-hover-text', config.menuHoverText);
  root.style.setProperty('--kunk-primary', primary);
  root.style.setProperty('--kunk-accent', accent);
  root.style.setProperty('--kunk-accent-hover', accentHover);
  root.style.setProperty('--kunk-bg-image', useImage ? `url(${config.bgImage})` : 'none');

  if (useImage) {
    document.body.style.backgroundImage = `url(${config.bgImage})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundColor = appBg;
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundAttachment = '';
    document.body.style.backgroundColor = appBg;
  }
}

function resolveInitialTheme(defaultTheme) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    // Legacy legado values
    if (saved === 'light-mode') return 'light';
    if (saved === 'default') return 'dark';
  } catch {
    /* ignore */
  }
  return defaultTheme === 'light' ? 'light' : 'dark';
}

export function KunkConfigProvider({ api, children }) {
  const bootstrap = useMemo(() => getKunkPublicConfig(), []);
  const [config, setConfig] = useState(bootstrap);
  const [configErrors, setConfigErrors] = useState([]);
  const [configReady, setConfigReady] = useState(false);
  const [themeMode, setThemeModeState] = useState(() =>
    resolveInitialTheme(bootstrap.defaultTheme),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kunkResult, regResult] = await Promise.allSettled([
          api.get('/config/public?system=kunk'),
          api.get('/config/public?system=registration'),
        ]);
        if (cancelled) return;

        let merged = bootstrap;
        let errors = [];
        if (kunkResult.status === 'fulfilled') {
          const data = kunkResult.value?.data || {};
          merged = mergeKunkPublicConfigFromApi(bootstrap, data.values);
          errors = Array.isArray(data.errors) ? data.errors : [];
        }

        if (regResult.status === 'fulfilled') {
          const regMerged = mergePublicConfigFromApi(
            getPublicConfig(),
            regResult.value?.data?.values,
          );
          const name = String(regMerged.associationName || '').trim();
          if (name) merged = { ...merged, title: name, associationName: name };
          else merged = { ...merged, associationName: '' };
          merged = applyAssociationLogoToKunkConfig(merged, regMerged);
        }

        // Uma única atualização: logo/título já presentes quando configReady vira true
        setConfig(merged);
        setConfigErrors(errors);
        setConfigReady(true);
        // Only apply admin default if user has no stored preference
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (!saved) {
            setThemeModeState(merged.defaultTheme === 'light' ? 'light' : 'dark');
          }
        } catch {
          /* ignore */
        }
      } catch {
        if (cancelled) return;
        setConfig(bootstrap);
        setConfigErrors([]);
        setConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, bootstrap]);

  useEffect(() => {
    applyKunkAppearanceVars(config, themeMode);
  }, [config, themeMode]);

  useEffect(() => {
    const name = String(config.associationName || '').trim();
    document.title = name ? `Kunk - ${name}` : 'Kunk';
  }, [config.associationName]);

  useEffect(() => {
    const href = String(config.logoSquare || '').trim();
    let link = document.querySelector("link[rel='icon']");
    if (!href) {
      if (link) link.remove();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      document.head.appendChild(link);
    }
    const path = href.split('?')[0].toLowerCase();
    const type = path.endsWith('.svg')
      ? 'image/svg+xml'
      : path.endsWith('.ico')
        ? 'image/x-icon'
        : path.endsWith('.jpg') || path.endsWith('.jpeg')
          ? 'image/jpeg'
          : path.endsWith('.webp')
            ? 'image/webp'
            : 'image/png';
    link.setAttribute('type', type);
    link.setAttribute('href', href);
  }, [config.logoSquare]);

  const setThemeMode = useCallback((mode) => {
    const next = mode === 'light' ? 'light' : 'dark';
    setThemeModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ config, configErrors, configReady, themeMode, setThemeMode }),
    [config, configErrors, configReady, themeMode, setThemeMode],
  );

  return (
    <KunkConfigContext.Provider value={value}>
      {children}
    </KunkConfigContext.Provider>
  );
}

export function useKunkConfig() {
  return useContext(KunkConfigContext);
}
