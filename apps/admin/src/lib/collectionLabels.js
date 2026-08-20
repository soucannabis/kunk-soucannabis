/** Collections shown in Dados (no file tables). Labels in Portuguese. */
export const HIDDEN_COLLECTIONS = new Set([
  'files',
  'orders_files',
  'services_files',
  'users_files',
  'users_api',
]);

export const COLLECTION_LABELS = {
  users: 'Associados',
  system_users: 'Operadores',
  orders: 'Pedidos',
  institutional_clients: 'Clientes institucionais',
  products: 'Produtos',
  professionals: 'Profissionais',
  reception: 'Acolhimento',
  reports: 'Relatórios',
  services: 'Serviços',
  tags: 'Etiquetas',
};

/** Lucide-style icon keys used by CollectionIcon in DataPages. */
export const COLLECTION_ICONS = {
  users: 'users',
  system_users: 'user',
  orders: 'package',
  institutional_clients: 'building',
  products: 'flask',
  professionals: 'stethoscope',
  reception: 'clipboard',
  reports: 'file-text',
  services: 'clipboard-check',
  tags: 'tag',
};

export function collectionLabel(name) {
  if (COLLECTION_LABELS[name]) return COLLECTION_LABELS[name];
  if (!name) return '';
  const pretty = String(name).replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export function collectionIcon(name) {
  return COLLECTION_ICONS[name] || 'table';
}

export function isDadosCollection(name) {
  return Boolean(name) && !HIDDEN_COLLECTIONS.has(name);
}
