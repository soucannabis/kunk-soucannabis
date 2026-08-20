/**
 * Client-side role_pages helpers (mirrors kunk-api/src/utils/rolePages.js).
 */

export function allowedPagesForRoles(rolePages, roles = []) {
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

export function filterMenuSections(sections, allowedPageIds) {
  if (!allowedPageIds || allowedPageIds.includes('*')) return sections;
  const allow = new Set(allowedPageIds);
  return sections
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => !item.id || allow.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}
