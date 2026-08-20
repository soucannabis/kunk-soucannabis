import React, { useEffect } from 'react';
import {
  getPublicConfig,
  mergePublicConfigFromApi,
  resolveBrandingLogoUrl,
  isPlaceholderLogo,
} from '@kunk/config';
import { applyAssociationFavicon } from '../lib/applyAssociationFavicon.js';

function resolveFaviconLogo(merged) {
  const href = resolveBrandingLogoUrl(
    merged?.associationLogoSquare,
    merged?.associationLogo,
    merged?.associationLogoMenu,
  );
  if (!href || isPlaceholderLogo(href)) return '';
  return href;
}

/** Loads branding and sets favicon on all Admin routes. */
export function AdminFavicon({ api }) {
  useEffect(() => {
    if (!api?.get) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/config/public?system=registration');
        if (cancelled) return;
        const merged = mergePublicConfigFromApi(getPublicConfig(), res?.data?.values || {});
        applyAssociationFavicon(resolveFaviconLogo(merged));
      } catch {
        if (!cancelled) applyAssociationFavicon('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return null;
}
