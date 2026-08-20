'use strict';

/**
 * Resolve allowed page ids for the user's roles.
 * Default: ['*'] (all pages).
 */
function allowedPagesForRoles(rolePages, roles = []) {
  if (!rolePages || typeof rolePages !== 'object') return ['*'];
  const list = Array.isArray(roles) ? roles : [];
  const allowed = new Set();
  let hasStar = false;
  for (const role of list) {
    const pages = rolePages[role];
    if (!pages || pages.includes('*')) {
      hasStar = true;
      break;
    }
    pages.forEach((p) => allowed.add(p));
  }
  if (hasStar || allowed.size === 0) return ['*'];
  return [...allowed];
}

function filterMenuSections(sections, allowedPageIds) {
  if (!allowedPageIds || allowedPageIds.includes('*')) return sections;
  const allow = new Set(allowedPageIds);
  return sections
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => !item.id || allow.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}

function canAccessPage(allowedPageIds, pageId) {
  if (!allowedPageIds || allowedPageIds.includes('*')) return true;
  return allowedPageIds.includes(pageId);
}

module.exports = { allowedPagesForRoles, filterMenuSections, canAccessPage };
