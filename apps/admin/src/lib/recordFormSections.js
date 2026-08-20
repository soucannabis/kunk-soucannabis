/**
 * Agrupamento de campos no formulário de edição (Dados → Registros).
 * Ordem: importância → tipo de dado; tags sempre por último.
 */

/** @typedef {{ id: string, title: string, fields: string[] }} FormSectionDef */

/** @type {Record<string, FormSectionDef[]>} */
export const RECORD_FORM_SECTIONS = {
  users: [
    {
      id: 'identity',
      title: 'Identificação',
      fields: [
        'associate_name',
        'associate_last_name',
        'fullname',
        'user_code',
        'associate_status',
        'status',
        'sort',
      ],
    },
    {
      id: 'contact',
      title: 'Contato',
      fields: ['email_account', 'mobile_number'],
    },
    {
      id: 'personal',
      title: 'Dados pessoais',
      fields: [
        'associate_cpf',
        'associate_rg',
        'associate_rg_issuer',
        'associate_birth_date',
        'gender',
        'nationality',
        'marital_status',
      ],
    },
    {
      id: 'address',
      title: 'Endereço',
      fields: [
        'street',
        'street_number',
        'complement',
        'neighborhood',
        'city',
        'state',
        'cep',
        'proof_of_address',
        'delivery_address',
      ],
    },
    {
      id: 'responsible',
      title: 'Responsável e vínculos',
      fields: ['responsible_type', 'responsible_code', 'patient_user_code'],
    },
    {
      id: 'treatment',
      title: 'Tratamento e clínica',
      fields: [
        'reason_treatment_text',
        'prescription',
        'date_prescription',
        'prescriber',
        'prescriber_code',
        'ciap_codes',
        'preferred_products',
        'handbook',
        'annotations',
      ],
    },
    {
      id: 'documents',
      title: 'Documentos e mídia',
      fields: [
        'rg_proof',
        'rg_patient_proof',
        'adhesion_term',
        'documents_folder_id',
        'avatar_url',
      ],
    },
    {
      id: 'session',
      title: 'Conta e sessão',
      fields: [
        'account_password',
        'session_token',
        'session_expires',
        'last_activity',
        'is_session_active',
        'password_reset_token',
        'password_reset_expires',
      ],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated', 'created_date', 'invalid_fields'],
    },
  ],

  system_users: [
    {
      id: 'identity',
      title: 'Identificação',
      fields: ['name', 'last_name', 'user_code', 'internal_code', 'status'],
    },
    {
      id: 'contact',
      title: 'Contato',
      fields: ['email', 'mobile_number'],
    },
    {
      id: 'personal',
      title: 'Dados pessoais',
      fields: ['cpf', 'rg', 'birth_date', 'gender', 'nationality', 'marital_status'],
    },
    {
      id: 'address',
      title: 'Endereço',
      fields: ['street', 'neighborhood', 'city', 'state', 'cep'],
    },
    {
      id: 'access',
      title: 'Acesso e permissões',
      fields: ['permissions', 'password'],
    },
    {
      id: 'finance',
      title: 'Financeiro',
      fields: ['pix_key', 'commission_value', 'commission_total', 'transactions'],
    },
    {
      id: 'integrations',
      title: 'Integrações',
      fields: ['utalk_id', 'utalk_token', 'avatar_url'],
    },
    {
      id: 'session',
      title: 'Sessão',
      fields: ['session_token', 'session_expires', 'last_activity', 'is_session_active'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated'],
    },
  ],

  orders: [
    {
      id: 'order',
      title: 'Pedido',
      fields: [
        'status',
        'order_code',
        'associate_name',
        'receiver_name',
        'user_code',
        'user',
        'sort',
      ],
    },
    {
      id: 'payment',
      title: 'Valores e pagamento',
      fields: [
        'total',
        'discount',
        'donation',
        'delivery_price',
        'payment_method',
        'payment_date',
        'custom_payment',
        'payment_link',
        'payment_code',
        'external_payment_info',
      ],
    },
    {
      id: 'delivery',
      title: 'Entrega e frete',
      fields: [
        'address',
        'address_validation',
        'tracking_code',
        'tracking_code_date',
        'last_tracking_date',
        'carrier_order_code',
        'freight_carrier',
        'freight_option',
        'delivery_notes',
        'external_delivery_type',
        'dce',
      ],
    },
    {
      id: 'items',
      title: 'Itens e detalhes',
      fields: ['items', 'details', 'order_notes', 'whatsapp_message'],
    },
    {
      id: 'production',
      title: 'Produção e prescritor',
      fields: ['production_owner', 'stock_debited_at', 'prescriber', 'prescriber_code'],
    },
    {
      id: 'external',
      title: 'Cliente institucional e sync',
      fields: [
        'institutional_client_id',
        'institutional_client_code',
        'soucannabis_order_id',
        'soucannabis_synced_at',
        'soucannabis_sync_error',
        'created_by_user_code',
      ],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated', 'created_date'],
    },
    {
      id: 'tags',
      title: 'Etiquetas',
      fields: ['tags'],
    },
  ],

  institutional_clients: [
    {
      id: 'status',
      title: 'Status',
      fields: ['status', 'sort'],
    },
    {
      id: 'company',
      title: 'Empresa',
      fields: [
        'is_company',
        'company_name',
        'company_trade_name',
        'company_cnpj',
        'company_email',
        'company_phone',
      ],
    },
    {
      id: 'representative',
      title: 'Representante',
      fields: [
        'representative_name',
        'representative_last_name',
        'representative_cpf',
        'representative_email',
        'representative_mobile',
      ],
    },
    {
      id: 'address',
      title: 'Endereço',
      fields: [
        'street',
        'street_number',
        'complement',
        'neighborhood',
        'city',
        'state',
        'cep',
        'delivery_address',
      ],
    },
    {
      id: 'notes',
      title: 'Observações',
      fields: ['annotations'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated'],
    },
  ],

  products: [
    {
      id: 'product',
      title: 'Produto',
      fields: ['name', 'sku', 'status', 'sort', 'type', 'category'],
    },
    {
      id: 'specs',
      title: 'Especificações',
      fields: ['unit', 'concentration', 'amount', 'batch', 'photo'],
    },
    {
      id: 'price',
      title: 'Preço',
      fields: ['price'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['user_created', 'user_updated', 'date_created', 'date_updated'],
    },
  ],

  professionals: [
    {
      id: 'identity',
      title: 'Identificação',
      fields: [
        'name',
        'last_name',
        'professional_code',
        'type',
        'specialty',
        'active',
        'sort',
      ],
    },
    {
      id: 'contact',
      title: 'Contato',
      fields: ['email', 'phone'],
    },
    {
      id: 'personal',
      title: 'Documentos',
      fields: ['cpf'],
    },
    {
      id: 'location',
      title: 'Localização',
      fields: ['city', 'state'],
    },
    {
      id: 'roles',
      title: 'Papéis e serviços',
      fields: ['is_prescriber', 'is_collaborator', 'services_description'],
    },
    {
      id: 'finance',
      title: 'Financeiro e agenda',
      fields: ['consultation_price', 'donation_balance', 'recipient_id', 'calendar_id'],
    },
    {
      id: 'other',
      title: 'Outros',
      fields: ['met_us', 'fingerprint', 'contest_reports'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created'],
    },
  ],

  reception: [
    {
      id: 'person',
      title: 'Pessoa',
      fields: ['name', 'last_name', 'full_name', 'email', 'phone', 'patient_name'],
    },
    {
      id: 'status',
      title: 'Status do acolhimento',
      fields: ['status', 'is_associate', 'is_prescriber', 'attendant', 'code'],
    },
    {
      id: 'associate',
      title: 'Associado',
      fields: ['associate_name', 'associate_code'],
    },
    {
      id: 'attendance',
      title: 'Atendimento',
      fields: ['help_topic', 'message', 'completion_reason', 'chat_id'],
    },
    {
      id: 'media',
      title: 'Mídia',
      fields: ['avatar_url'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated'],
    },
    {
      id: 'tags',
      title: 'Etiquetas',
      fields: ['tags'],
    },
  ],

  reports: [
    {
      id: 'report',
      title: 'Relatório',
      fields: ['name', 'type', 'report_code', 'created_by'],
    },
    {
      id: 'query',
      title: 'Consulta e gráfico',
      fields: ['query_config', 'sql_query', 'chart_config', 'column_maps'],
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      fields: [
        'dashboard_queries',
        'layout_positions',
        'embedded_report_codes',
        'favorites',
      ],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'date_updated'],
    },
    {
      id: 'tags',
      title: 'Etiquetas',
      fields: ['tags'],
    },
  ],

  services: [
    {
      id: 'service',
      title: 'Serviço',
      fields: ['name', 'type', 'status', 'service_code', 'sort'],
    },
    {
      id: 'associate',
      title: 'Associado e paciente',
      fields: [
        'associate_name',
        'associate_user_code',
        'associate_email',
        'patient_name',
        'patient_user_code',
      ],
    },
    {
      id: 'professional',
      title: 'Profissional',
      fields: ['professional_id', 'professional_name', 'professional_email'],
    },
    {
      id: 'schedule',
      title: 'Agendamento',
      fields: ['consultation_date', 'event_link', 'event_id', 'booking_group_code'],
    },
    {
      id: 'payment',
      title: 'Pagamento',
      fields: [
        'price',
        'price_paid',
        'donation',
        'payment_type',
        'payment_link',
        'payment_code',
        'payment_info',
        'commission_validation',
      ],
    },
    {
      id: 'notes',
      title: 'Observações',
      fields: ['observations'],
    },
    {
      id: 'system',
      title: 'Sistema',
      fields: ['date_created', 'created_by_user_code'],
    },
    {
      id: 'tags',
      title: 'Etiquetas',
      fields: ['tags'],
    },
  ],

  tags: [
    {
      id: 'tag',
      title: 'Etiqueta',
      fields: ['tag', 'color', 'contexts'],
    },
  ],
};

const TAG_FIELDS = new Set(['tags']);

/**
 * Heurística para collections sem mapa explícito.
 * @param {string[]} columns
 * @returns {FormSectionDef[]}
 */
function heuristicSections(columns) {
  const buckets = {
    identity: [],
    contact: [],
    personal: [],
    address: [],
    finance: [],
    dates: [],
    status: [],
    content: [],
    other: [],
    tags: [],
  };

  for (const col of columns) {
    if (TAG_FIELDS.has(col)) {
      buckets.tags.push(col);
      continue;
    }
    if (/^(name|last_name|first_name|full_?name|.*_code|sku|title)$/i.test(col)) {
      buckets.identity.push(col);
    } else if (/email|phone|mobile|whatsapp|avatar/i.test(col)) {
      buckets.contact.push(col);
    } else if (/cpf|rg|birth|gender|nationality|marital/i.test(col)) {
      buckets.personal.push(col);
    } else if (/address|street|neighborhood|city|state|cep|complement/i.test(col)) {
      buckets.address.push(col);
    } else if (/price|total|payment|discount|donation|commission|pix/i.test(col)) {
      buckets.finance.push(col);
    } else if (/^date_|_date$|created|updated|expires|activity/i.test(col)) {
      buckets.dates.push(col);
    } else if (/status|active|sort|type|option/i.test(col)) {
      buckets.status.push(col);
    } else if (/message|notes|observations|details|description|annotations/i.test(col)) {
      buckets.content.push(col);
    } else {
      buckets.other.push(col);
    }
  }

  /** @type {FormSectionDef[]} */
  const out = [];
  const push = (id, title, fields) => {
    if (fields.length) out.push({ id, title, fields });
  };
  push('identity', 'Identificação', buckets.identity);
  push('status', 'Status', buckets.status);
  push('contact', 'Contato', buckets.contact);
  push('personal', 'Dados pessoais', buckets.personal);
  push('address', 'Endereço', buckets.address);
  push('finance', 'Valores', buckets.finance);
  push('content', 'Conteúdo', buckets.content);
  push('dates', 'Datas', buckets.dates);
  push('other', 'Outros', buckets.other);
  push('tags', 'Etiquetas', buckets.tags);
  return out;
}

/**
 * Monta seções com apenas campos editáveis presentes, tags por último.
 * Campos não listados no mapa vão para "Outros" (antes das tags).
 *
 * @param {string} collection
 * @param {string[]} editableCols
 * @returns {{ id: string, title: string, fields: string[] }[]}
 */
export function buildRecordFormSections(collection, editableCols) {
  const available = new Set(editableCols);
  const defs = RECORD_FORM_SECTIONS[collection];

  if (!defs) {
    return heuristicSections(editableCols).filter((s) => s.fields.length);
  }

  const placed = new Set();
  /** @type {{ id: string, title: string, fields: string[] }[]} */
  const sections = [];

  for (const def of defs) {
    const fields = def.fields.filter((f) => available.has(f));
    if (!fields.length) continue;
    for (const f of fields) placed.add(f);
    sections.push({ id: def.id, title: def.title, fields });
  }

  const leftover = editableCols.filter((c) => !placed.has(c) && !TAG_FIELDS.has(c));
  const leftoverTags = editableCols.filter((c) => !placed.has(c) && TAG_FIELDS.has(c));

  if (leftover.length) {
    // Inserir "Outros" antes da seção de tags, se existir
    const tagsIdx = sections.findIndex((s) => s.id === 'tags');
    const otherSection = { id: 'other', title: 'Outros', fields: leftover };
    if (tagsIdx >= 0) sections.splice(tagsIdx, 0, otherSection);
    else sections.push(otherSection);
  }

  if (leftoverTags.length) {
    const existingTags = sections.find((s) => s.id === 'tags');
    if (existingTags) {
      for (const t of leftoverTags) {
        if (!existingTags.fields.includes(t)) existingTags.fields.push(t);
      }
    } else {
      sections.push({ id: 'tags', title: 'Etiquetas', fields: leftoverTags });
    }
  }

  // Garantir tags no final
  const tagsSection = sections.find((s) => s.id === 'tags');
  if (tagsSection) {
    const rest = sections.filter((s) => s.id !== 'tags');
    return [...rest, tagsSection];
  }

  return sections;
}
