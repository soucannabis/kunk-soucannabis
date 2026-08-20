'use strict';

module.exports = {
  TAGS_ALL: 'tags:all',
  tagsContext: (ctx) => `tags:ctx:${ctx || 'all'}`,
  PRODUCTS_CATALOG: 'products:catalog:all',
  ATTENDANTS: 'kunk-users:attendants',
  PROFESSIONALS_PRESCRIBERS: 'professionals:prescribers',
  SOUCANNABIS_PRODUCTS: 'soucannabis_orders:products',
  SOUCANNABIS_TAGS: 'soucannabis_orders:tags',
  CACHE_ENABLED: 'meta:cache.enabled',
};
