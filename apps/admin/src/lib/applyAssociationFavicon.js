/**
 * Apply association logo as document favicon (square preferred).
 * @param {string} href
 */
export function applyAssociationFavicon(href) {
  const url = String(href || '').trim();
  let link = document.querySelector("link[rel='icon']");
  if (!url) {
    if (link) link.setAttribute('href', '/favicon.svg');
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    document.head.appendChild(link);
  }
  const lower = url.split('?')[0].toLowerCase();
  const type = lower.endsWith('.svg')
    ? 'image/svg+xml'
    : lower.endsWith('.ico')
      ? 'image/x-icon'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';
  link.setAttribute('type', type);
  link.setAttribute('href', url);
}
