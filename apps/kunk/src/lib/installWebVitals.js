import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import { createWebVitalSender, isWebVitalsLocalHost } from '@kunk/api-client';

/**
 * Bind Core Web Vitals collectors. Import `web-vitals` from the app (not api-client)
 * so Vite resolves the package from the app node_modules / Docker volume.
 */
export function installWebVitalsReporter({ app, baseUrl } = {}) {
  if (typeof window === 'undefined') return;
  if (window.__kunkWebVitalsInstalled) return;
  if (isWebVitalsLocalHost()) return;

  window.__kunkWebVitalsInstalled = true;
  const send = createWebVitalSender({ app, baseUrl });
  onCLS(send);
  onINP(send);
  onLCP(send);
  onFCP(send);
  onTTFB(send);
}
