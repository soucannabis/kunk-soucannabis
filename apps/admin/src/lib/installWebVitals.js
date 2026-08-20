import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import { createWebVitalSender, isWebVitalsLocalHost } from '@kunk/api-client';

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
