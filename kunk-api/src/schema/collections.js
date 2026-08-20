'use strict';

/** Collections do schema alvo — espelha target-schema.sql */
const TARGET_TABLES = [
  'files',
  'users',
  'system_users',
  'orders',
  'orders_files',
  'institutional_clients',
  'products',
  'professionals',
  'reception',
  'reports',
  'services',
  'services_files',
  'tags',
  'users_api',
  'users_files',
];

const SENSITIVE_FIELDS = {
  system_users: ['password', 'session_token', 'utalk_token'],
  users: ['account_password', 'session_token', 'password_reset_token'],
  users_api: ['token'],
};

const READONLY_FIELDS = {
  files: ['id', 'created_at', 'is_sample', 'storage_path', 'storage_driver', 'storage_key'],
  users: ['id', 'is_sample', 'session_expires', 'last_activity', 'is_session_active', 'password_reset_expires'],
  system_users: ['id', 'is_sample'],
  orders: ['id', 'is_sample'],
  orders_files: ['id', 'is_sample'],
  institutional_clients: ['id', 'client_code', 'is_sample'],
  products: ['id', 'is_sample'],
  professionals: ['id', 'is_sample'],
  reception: ['id', 'is_sample'],
  reports: ['id', 'is_sample'],
  services: ['id', 'is_sample'],
  services_files: ['id', 'is_sample'],
  tags: ['id', 'is_sample'],
  users_api: ['id', 'is_sample', 'token_prefix', 'scopes'],
  users_files: ['id', 'is_sample'],
};

/** Campos graváveis no create, dropados no PATCH (funil / identidade). */
const READONLY_ON_UPDATE = {
  users: [
    'user_code',
    'status',
    'associate_status',
    'invalid_fields',
    'responsible_code',
    'patient_user_code',
    'adhesion_term',
  ],
};

const SEARCHABLE = {
  users: ['associate_name', 'associate_last_name', 'email_account', 'associate_cpf', 'mobile_number', 'fullname'],
  system_users: ['name', 'last_name', 'email', 'cpf'],
  orders: ['associate_name', 'order_code', 'status', 'tracking_code'],
  institutional_clients: [
    'company_name', 'company_trade_name', 'company_cnpj', 'representative_name',
    'representative_last_name', 'representative_cpf', 'representative_email', 'company_email',
  ],
  products: ['name', 'sku', 'batch', 'category'],
  professionals: ['name', 'last_name', 'email', 'cpf', 'specialty'],
  reception: ['name', 'last_name', 'email', 'phone', 'associate_name', 'full_name'],
  reports: ['name', 'type', 'created_by'],
  services: ['name', 'associate_name', 'professional_name', 'status'],
  tags: ['tag', 'contexts'],
  files: ['filename', 'mime_type'],
  users_api: ['email'],
  orders_files: [],
  services_files: [],
  users_files: [],
};

const COLUMNS = {
  files: ['id', 'filename', 'mime_type', 'storage_path', 'storage_driver', 'storage_key', 'created_at', 'is_sample'],
  users: [
    'id', 'status', 'sort', 'date_created', 'date_updated', 'associate_name', 'associate_last_name',
    'gender', 'nationality', 'associate_rg_issuer', 'marital_status', 'street', 'street_number',
    'complement', 'neighborhood', 'proof_of_address', 'reason_treatment_text', 'responsible_type',
    'city', 'state', 'cep', 'email_account', 'account_password', 'user_code', 'rg_proof', 'associate_cpf',
    'associate_rg', 'mobile_number', 'associate_status', 'prescription', 'responsible_code',
    'documents_folder_id', 'rg_patient_proof', 'patient_user_code', 'adhesion_term', 'invalid_fields',
    'ciap_codes', 'associate_birth_date', 'preferred_products', 'date_prescription',
    'annotations', 'handbook', 'created_date', 'avatar_url',
    'prescriber', 'delivery_address', 'prescriber_code',
    'session_token', 'session_expires', 'last_activity', 'is_session_active', 'fullname',
    'password_reset_token', 'password_reset_expires', 'is_sample',
  ],
  system_users: [
    'id', 'date_created', 'date_updated', 'name', 'last_name', 'status', 'user_code', 'permissions',
    'email', 'password', 'cpf', 'rg', 'birth_date', 'gender', 'nationality', 'marital_status',
    'mobile_number', 'street', 'neighborhood', 'city', 'state', 'cep', 'pix_key', 'commission_value',
    'transactions', 'commission_total', 'avatar_url', 'utalk_id', 'utalk_token', 'session_token',
    'session_expires', 'last_activity', 'is_session_active', 'internal_code', 'is_sample',
  ],
  orders: [
    'id', 'sort', 'date_created', 'date_updated', 'status', 'total', 'payment_method', 'tracking_code',
    'delivery_price', 'associate_name', 'receiver_name', 'order_code', 'user_code', 'items',
    'created_date', 'discount', 'details', 'donation',
    'prescriber', 'payment_link', 'user', 'carrier_order_code', 'payment_code', 'order_notes', 'tags',
    'delivery_notes', 'address', 'whatsapp_message', 'prescriber_code',
    'payment_date', 'custom_payment', 'production_owner',
    'tracking_code_date', 'last_tracking_date',
    'address_validation', 'created_by_user_code',
    'freight_carrier', 'freight_option', 'dce',
    'institutional_client_id', 'institutional_client_code',
    'stock_debited_at',
    'soucannabis_order_id', 'soucannabis_synced_at', 'soucannabis_sync_error', 'external_payment_info',
    'external_delivery_type', 'is_sample',
  ],
  orders_files: ['id', 'order_id', 'file_id', 'is_sample'],
  institutional_clients: [
    'id', 'client_code', 'status', 'sort', 'date_created', 'date_updated', 'annotations',
    'is_company', 'company_name', 'company_trade_name', 'company_cnpj', 'company_email',
    'company_phone', 'representative_name', 'representative_last_name', 'representative_cpf',
    'representative_email', 'representative_mobile', 'street', 'street_number', 'complement',
    'neighborhood', 'city', 'state', 'cep', 'delivery_address', 'is_sample',
  ],
  products: [
    'id', 'status', 'sort', 'user_created', 'date_created', 'user_updated', 'date_updated', 'name',
    'sku', 'type', 'unit', 'concentration', 'price', 'amount', 'category', 'photo', 'batch', 'is_sample',
  ],
  professionals: [
    'id', 'sort', 'date_created', 'name', 'last_name', 'type', 'services_description', 'phone',
    'state', 'city', 'cpf', 'email', 'specialty', 'active', 'is_prescriber', 'is_collaborator',
    'professional_code', 'fingerprint', 'contest_reports', 'met_us', 'recipient_id',
    'donation_balance', 'calendar_id', 'consultation_price', 'is_sample',
  ],
  reception: [
    'id', 'date_created', 'name', 'last_name', 'email', 'phone', 'help_topic', 'is_associate',
    'message', 'code', 'chat_id', 'status', 'associate_name', 'associate_code', 'date_updated',
    'avatar_url', 'patient_name', 'attendant', 'tags', 'completion_reason', 'is_prescriber',
    'full_name', 'is_sample',
  ],
  reports: [
    'id', 'date_created', 'date_updated', 'name', 'report_code', 'query_config', 'sql_query', 'type',
    'dashboard_queries', 'layout_positions', 'chart_config', 'created_by', 'tags', 'column_maps',
    'embedded_report_codes', 'favorites', 'is_sample',
  ],
  services: [
    'id', 'sort', 'type', 'date_created', 'name', 'professional_id', 'status', 'price', 'associate_name',
    'associate_user_code', 'associate_email', 'professional_name', 'event_link', 'consultation_date',
    'payment_link', 'event_id', 'price_paid', 'donation', 'booking_group_code', 'patient_name',
    'patient_user_code',
    'professional_email', 'service_code', 'observations', 'payment_type', 'tags', 'created_by_user_code',
    'payment_code', 'payment_info', 'commission_validation', 'is_sample',
  ],
  services_files: ['id', 'service_id', 'file_id', 'is_sample'],
  tags: ['id', 'tag', 'contexts', 'color', 'is_sample'],
  users_api: ['id', 'email', 'token', 'token_prefix', 'scopes', 'is_sample'],
  users_files: ['id', 'user_id', 'file_id', 'doc_type', 'side', 'subject', 'doc_kind', 'is_sample'],
};

const PK = {
  files: { name: 'id', type: 'uuid' },
  users: { name: 'id', type: 'serial' },
  system_users: { name: 'id', type: 'serial' },
  orders: { name: 'id', type: 'serial' },
  orders_files: { name: 'id', type: 'serial' },
  institutional_clients: { name: 'id', type: 'serial' },
  products: { name: 'id', type: 'serial' },
  professionals: { name: 'id', type: 'serial' },
  reception: { name: 'id', type: 'serial' },
  reports: { name: 'id', type: 'serial' },
  services: { name: 'id', type: 'serial' },
  services_files: { name: 'id', type: 'serial' },
  tags: { name: 'id', type: 'serial' },
  users_api: { name: 'id', type: 'serial' },
  users_files: { name: 'id', type: 'serial' },
};

/** Colunas que precisam de aspas no SQL (reservadas) */
const QUOTED_COLUMNS = new Set(['user']);

function quoteIdent(name) {
  if (QUOTED_COLUMNS.has(name)) return `"${name}"`;
  return name;
}

function getCollection(name) {
  if (!TARGET_TABLES.includes(name)) return null;
  return {
    name,
    columns: COLUMNS[name],
    pk: PK[name],
    sensitive: SENSITIVE_FIELDS[name] || [],
    readonly: READONLY_FIELDS[name] || [],
    readonlyOnUpdate: READONLY_ON_UPDATE[name] || [],
    searchable: SEARCHABLE[name] || [],
  };
}

function stripSensitive(collectionName, row) {
  if (!row) return row;
  const sensitive = SENSITIVE_FIELDS[collectionName] || [];
  const out = { ...row };
  for (const field of sensitive) {
    delete out[field];
  }
  return out;
}

function isKnownColumn(collectionName, column) {
  return (COLUMNS[collectionName] || []).includes(column);
}

module.exports = {
  TARGET_TABLES,
  SENSITIVE_FIELDS,
  READONLY_FIELDS,
  READONLY_ON_UPDATE,
  SEARCHABLE,
  COLUMNS,
  PK,
  quoteIdent,
  getCollection,
  stripSensitive,
  isKnownColumn,
};
