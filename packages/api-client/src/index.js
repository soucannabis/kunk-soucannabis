/**
 * HTTP client for kunk-api /v1 (browser, credentials include).
 */

export class ApiError extends Error {
  constructor(status, code, message, details = null, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.errors = errors;
  }
}

export {
  reportSystemError,
  shouldReportApiError,
  payloadFromError,
  installGlobalErrorListeners,
} from './systemErrors.js';

export { reportWebVital, createWebVitalSender, isWebVitalsLocalHost } from './webVitals.js';

export function createApiClient({ baseUrl, app } = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const appKey = app ? String(app).trim().toLowerCase() : null;

  async function request(method, path, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (appKey) headers['X-Kunk-App'] = appKey;
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${root}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : payload,
    });
    const json = await res.json().catch(() => ({ data: null, meta: null, errors: [{ code: 'INTERNAL_ERROR', message: 'Resposta inválida' }] }));
    if (!res.ok) {
      const err0 = (json.errors && json.errors[0]) || {};
      throw new ApiError(res.status, err0.code || 'INTERNAL_ERROR', err0.message || res.statusText, err0.details, json.errors);
    }
    return json;
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),

    // Operator auth
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    logout: () => request('POST', '/auth/logout', {}),
    me: () => request('GET', '/auth/me'),
    installStatus: () => request('GET', '/auth/install-status'),
    installSchema: () => request('POST', '/auth/install-schema'),
    install: (body) => request('POST', '/auth/install', body),
    installSample: () => request('POST', '/auth/install-sample'),
    listApiTokens: () => request('GET', '/auth/tokens'),
    createApiToken: (body) => request('POST', '/auth/tokens', body),
    updateApiToken: (id, body) => request('PATCH', `/auth/tokens/${id}`, body),
    revokeApiToken: (id) => request('DELETE', `/auth/tokens/${id}`),

    // Associate auth
    registerEmail: (email, password) => request('POST', '/auth/associate/register-email', { email, password }),
    loginAssociate: (email, password) => request('POST', '/auth/associate/login', { email, password }),
    logoutAssociate: () => request('POST', '/auth/associate/logout', {}),
    meAssociate: () => request('GET', '/auth/associate/me'),
    forgotPassword: (email) => request('POST', '/auth/associate/forgot-password', { email }),
    resetPassword: (token, password) => request('POST', '/auth/associate/reset-password', { token, password }),

    // Funnel
    usersExists: (email) => request('GET', `/users/exists?email=${encodeURIComponent(email)}`),
    patchMe: (fields) => request('PATCH', '/users/me', fields),
    listMyPatients: () => request('GET', '/users/me/patients'),
    createMyPatient: (fields) => request('POST', '/users/me/patients', fields),
    patchMyPatient: (id, fields) => request('PATCH', `/users/me/patients/${id}`, fields),
    advance: () => request('POST', '/users/me/advance', {}),
    complete: () => request('POST', '/users/me/complete', {}),
    documentsStatus: () => request('GET', '/users/me/documents/status'),
    extrasStatus: () => request('GET', '/users/me/extras/status'),
    uploadFile: (formData) => request('POST', '/files', formData),
    deleteFile: (id) => request('DELETE', `/files/${id}`),
    listFiles: (qs = '') => request('GET', `/files${qs ? `?${qs}` : ''}`),
    listUserFiles: ({ userId, docKind, limit = 50 } = {}) => {
      const params = new URLSearchParams();
      if (userId != null) params.set('user_id', String(userId));
      if (docKind) params.set('doc_kind', String(docKind));
      if (limit != null) params.set('limit', String(limit));
      return request('GET', `/files?${params.toString()}`);
    },
    getFile: (id) => request('GET', `/files/${id}`),
    attachFile: (id, body) => request('POST', `/files/${id}/attach`, body),
    fileDownloadUrl: (id) => `${root}/files/${id}/download`,
    async fileDownload(id) {
      const headers = {};
      if (appKey) headers['X-Kunk-App'] = appKey;
      const res = await fetch(`${root}/files/${id}/download`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const err0 = (json && json.errors && json.errors[0]) || {};
        throw new ApiError(
          res.status,
          err0.code || 'INTERNAL_ERROR',
          err0.message || 'Não foi possível abrir o arquivo',
          err0.details,
          json?.errors
        );
      }
      return res.blob();
    },
    termsStatus: () => request('GET', '/terms/status'),
    createContract: () => request('POST', '/terms/contracts', {}),

    // Admin / operator
    adminSchema: () => request('GET', '/admin/schema'),
    adminRoles: () => request('GET', '/admin/roles'),
    listExternalServices: () => request('GET', '/admin/external-services'),
    getExternalService: (service) => request('GET', `/admin/external-services/${service}`),
    patchExternalService: (service, body) =>
      request('PATCH', `/admin/external-services/${service}`, body),
    putExternalCredentials: (service, body) =>
      request('PUT', `/admin/external-services/${service}/credentials`, body),
    deleteExternalCredential: (service, fieldKey) =>
      request('DELETE', `/admin/external-services/${service}/credentials/${fieldKey}`),
    testExternalService: (service) =>
      request('POST', `/admin/external-services/${service}/test`, {}),
    sendExternalTestEmail: (to) =>
      request('POST', '/admin/external-services/email/test-email', { to }),
    activateMelhorEnvioProduction: () =>
      request('POST', '/admin/external-services/melhorenvio/activate-production', {}),
    activateMelhorEnvioSandbox: () =>
      request('POST', '/admin/external-services/melhorenvio/activate-sandbox', {}),

    // Storage / buckets
    getStorageStatus: () => request('GET', '/admin/storage'),
    putStorageConfig: (body) => request('PUT', '/admin/storage', body),
    testStorage: (body) => request('POST', '/admin/storage/test', body || {}),
    activateStorage: (body) => request('POST', '/admin/storage/activate', body || {}),
    getBrandingMigration: () => request('GET', '/admin/storage/branding-migration'),
    migrateBrandingAssets: () => request('POST', '/admin/storage/migrate-branding', {}),
    getStorageBackups: () => request('GET', '/admin/storage/backups'),
    putBackupConfig: (body) => request('PUT', '/admin/storage/backup-config', body || {}),
    runStorageBackup: () => request('POST', '/admin/storage/backups/run', {}),
    deleteStorageBackup: (id) => request('DELETE', `/admin/storage/backups/${encodeURIComponent(id)}`),
    restoreStorageBackup: (id, body = { confirm: true }) =>
      request('POST', `/admin/storage/backups/${encodeURIComponent(id)}/restore`, body),
    getSampleDataSummary: () => request('GET', '/admin/sample-data'),
    deleteSampleData: () => request('DELETE', '/admin/sample-data'),

    // Support credentials (one-time password reveal)
    getSupportCredentials: () => request('GET', '/admin/support-credentials'),
    createSupportCredentials: (body = {}) =>
      request('POST', '/admin/support-credentials', body),
    deleteSupportCredentials: () => request('DELETE', '/admin/support-credentials'),
    getSystemHealth: () => request('GET', '/admin/system-health'),

    // System errors (admin triage)
    getSystemErrorsSummary: () => request('GET', '/admin/system-errors/summary'),
    getSystemErrorsTop: (qs = '') =>
      request('GET', `/admin/system-errors/top${qs ? `?${qs}` : ''}`),
    listSystemErrors: (qs = '') =>
      request('GET', `/admin/system-errors${qs ? `?${qs}` : ''}`),
    getSystemErrorSamples: (errorHash, qs = '') =>
      request('GET', `/admin/system-errors/${encodeURIComponent(errorHash)}/samples${qs ? `?${qs}` : ''}`),
    resolveSystemError: (body) => request('POST', '/admin/system-errors/resolve', body),

    // Web Vitals (admin)
    getWebVitalsSummary: (qs = '') =>
      request('GET', `/admin/web-vitals/summary${qs ? `?${qs}` : ''}`),
    getWebVitalsSeries: (qs = '') =>
      request('GET', `/admin/web-vitals/series${qs ? `?${qs}` : ''}`),
    getWebVitalsByPage: (qs = '') =>
      request('GET', `/admin/web-vitals/by-page${qs ? `?${qs}` : ''}`),

    // Operational cache (admin + kunk)
    getAdminCacheStatus: () => request('GET', '/admin/cache'),
    patchAdminCacheStatus: (body) => request('PATCH', '/admin/cache', body),
    clearAdminCache: () => request('POST', '/admin/cache/clear', {}),
    getCacheStatus: () => request('GET', '/cache/status'),
    clearCache: () => request('POST', '/cache/clear', {}),

    // Outbound webhooks (admin)
    listWebhooks: () => request('GET', '/admin/webhooks'),
    getWebhooksCatalog: () => request('GET', '/admin/webhooks/catalog'),
    createWebhook: (body) => request('POST', '/admin/webhooks', body),
    updateWebhook: (id, body) => request('PATCH', `/admin/webhooks/${id}`, body),
    deleteWebhook: (id) => request('DELETE', `/admin/webhooks/${id}`),
    rotateWebhookSecret: (id) => request('POST', `/admin/webhooks/${id}/rotate-secret`, {}),
    testWebhook: (id) => request('POST', `/admin/webhooks/${id}/test`, {}),
    listWebhookDeliveries: (id, qs = '') =>
      request('GET', `/admin/webhooks/${id}/deliveries${qs ? `?${qs}` : ''}`),

    // Operator password reset
    forgotOperatorPassword: (email, app) =>
      request('POST', '/auth/forgot-password', { email, app }),
    resetOperatorPassword: (token, password) =>
      request('POST', '/auth/reset-password', { token, password }),
    previewSystemInvite: (token) =>
      request('GET', `/auth/system-invite/preview?token=${encodeURIComponent(token)}`),
    acceptSystemInvite: (body) => request('POST', '/auth/system-invite/accept', body),
    resendSystemUserInvite: (id) => request('POST', `/system-users/${id}/resend-invite`, {}),
    docSignResendEmail: (id) => request('POST', `/doc-sign/contracts/${id}/resend-email`, {}),
    freightQuote: (body) => request('POST', '/freight/quote', body),
    freightQuoteAvailability: () => request('GET', '/freight/quote-availability'),
    freightLabelAvailability: () => request('GET', '/freight/label-availability'),
    freightServiceOptions: () => request('GET', '/freight/service-options'),
    getFreightDefaultOption: () => request('GET', '/freight/default-option'),
    putFreightDefaultOption: (body) => request('PUT', '/freight/default-option', body),
    createOrder: (body) => request('POST', '/orders', body),
    updateOrder: (id, body) => request('PATCH', `/orders/${id}`, body),
    updateOrderDetails: (id, body) => request('PATCH', `/orders/${id}/details`, body),
    getOrder: (id) => request('GET', `/orders/${id}`),
    listOrderFiles: (id) => request('GET', `/orders/${id}/files`),
    attachOrderFile: (id, body) => request('POST', `/orders/${id}/files`, body),
    getOrderTracking: (id) => request('GET', `/orders/${id}/tracking`),
    deleteOrder: (id) => request('DELETE', `/orders/${id}`),
    listOrders: (qs = '') => request('GET', `/orders${qs ? `?${qs}` : ''}`),
    ordersFacets: (qs = '') => request('GET', `/orders/facets${qs ? `?${qs}` : ''}`),
    ordersStatusConfig: () => request('GET', '/orders/status-config'),
    ordersBulk: (body) => request('POST', '/orders/bulk', body),
    updateOrderProduction: (id, body) => request('PATCH', `/orders/${id}/production`, body),
    updateOrderStatus: (id, status) =>
      request('PATCH', `/orders/${id}/status`, { status }),
    ordersByUser: (userCode) => request('GET', `/orders/by-user/${encodeURIComponent(userCode)}`),
    createLoggiLabel: (body) => request('POST', '/modules/loggi/create-label', body),
    cancelLoggiLabel: (body) => request('POST', '/modules/loggi/cancel', body),
    getLoggiPackages: (body) => request('POST', '/modules/loggi/packages', body),
    getGeoapifyStatus: () => request('GET', '/modules/geoapify/status'),
    getCiap2Status: () => request('GET', '/modules/ciap2/status'),
    patchCiap2Status: (body) => request('PATCH', '/modules/ciap2', body),
    validateGeoapifyAddress: (body) =>
      request('POST', '/modules/geoapify/validate-address', body),
    createMelhorEnvioLabel: (body) => request('POST', '/modules/melhorenvio/create-label', body),
    cancelMelhorEnvioLabel: (body) => request('POST', '/modules/melhorenvio/cancel', body),
    getMelhorEnvioShipmentDetails: (body) =>
      request('POST', '/modules/melhorenvio/shipment-details', body),
    melhorEnvioOAuthAuthorize: () => request('GET', '/modules/melhorenvio/oauth/authorize'),
    melhorEnvioOAuthStatus: () => request('GET', '/modules/melhorenvio/oauth/status'),

    // Services
    listServices: (qs = '') => request('GET', `/services${qs ? `?${qs}` : ''}`),
    createServices: (body) => request('POST', '/services', body),
    updateService: (id, body) => request('PATCH', `/services/${id}`, body),
    deleteService: (id) => request('DELETE', `/services/${id}`),
    listServicesByGroup: (code) =>
      request('GET', `/services/by-group/${encodeURIComponent(code)}`),
    scheduleService: (id) => request('POST', `/services/${id}/schedule`, {}),
    unscheduleService: (id) => request('DELETE', `/services/${id}/schedule`),
    markServicePaid: (id) => request('POST', `/services/${id}/mark-paid`, {}),

    // Professionals
    listProfessionals: (qs = '') => {
      const q =
        typeof qs === 'string'
          ? qs
          : qs && typeof qs === 'object'
            ? new URLSearchParams(
                Object.entries(qs)
                  .filter(([, v]) => v != null && v !== '')
                  .map(([k, v]) => [k, String(v)])
              ).toString()
            : '';
      return request('GET', `/professionals${q ? `?${q}` : ''}`);
    },
    getProfessional: (id) => request('GET', `/professionals/${id}`),
    createProfessional: (body) => request('POST', '/professionals', body),
    updateProfessional: (id, body) => request('PATCH', `/professionals/${id}`, body),
    deleteProfessional: (id) => request('DELETE', `/professionals/${id}`),

    // Google Calendar
    getGoogleCalendarStatus: () => request('GET', '/modules/google_calendar/status'),
    listGoogleCalendars: () => request('GET', '/modules/google_calendar/calendars'),
    createGoogleCalendarEvent: (body) => request('POST', '/modules/google_calendar/events', body),
    updateGoogleCalendarEvent: (eventId, body) =>
      request('PATCH', `/modules/google_calendar/events/${encodeURIComponent(eventId)}`, body),
    deleteGoogleCalendarEvent: (eventId, calendarId) =>
      request(
        'DELETE',
        `/modules/google_calendar/events/${encodeURIComponent(eventId)}?calendarId=${encodeURIComponent(calendarId)}`
      ),
    googleCalendarOAuthAuthorizeUrl: () =>
      request('GET', '/modules/google_calendar/oauth/authorize?redirect=0'),
    googleCalendarOAuthStatus: () => request('GET', '/modules/google_calendar/oauth/status'),

    // Pagar.me + Pedidos SouCannabis
    getPagarmeStatus: () => request('GET', '/modules/pagarme/status'),
    createPagarmeCheckout: (body) => request('POST', '/modules/pagarme/orders', body),
    createPagarmeRecipient: (body) => request('POST', '/modules/pagarme/recipients', body),
    createPagarmeAssociationRecipient: (body) =>
      request('POST', '/modules/pagarme/recipients/association', body),
    createPagarmeSoucannabisRecipient: (body) =>
      request('POST', '/modules/pagarme/recipients/soucannabis', body),
    ensurePagarmeWebhooks: (body = {}) =>
      request('POST', '/modules/pagarme/webhooks/ensure', body),
    validatePagarmeWebhooks: () => request('POST', '/modules/pagarme/webhooks/validate'),
    createPagarmeTestPaymentLink: () =>
      request('POST', '/modules/pagarme/webhooks/test-payment'),
    getPagarmeWebhooksStatus: () => request('GET', '/modules/pagarme/webhooks/status'),
    listPagarmeWebhooks: (qs = '') =>
      request('GET', `/modules/pagarme/webhooks${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    retryPagarmeWebhook: (hookId) =>
      request('POST', `/modules/pagarme/webhooks/${encodeURIComponent(hookId)}/retry`),
    getSoucannabisOrdersStatus: () => request('GET', '/modules/soucannabis_orders/status'),
    getSoucannabisOrdersMe: () => request('GET', '/modules/soucannabis_orders/me'),
    listSoucannabisProducts: () => request('GET', '/modules/soucannabis_orders/products'),
    listSoucannabisTags: () => request('GET', '/modules/soucannabis_orders/tags'),
    syncSoucannabisOrder: (id, body = {}) =>
      request('POST', `/modules/soucannabis_orders/sync/order/${id}`, body),
    getSoucannabisOutboundCredentials: ({ reveal = false } = {}) =>
      request(
        'GET',
        `/modules/soucannabis_orders/outbound-credentials${reveal ? '?reveal=1' : ''}`
      ),
    getSoucannabisWebhooksInfo: () => request('GET', '/modules/soucannabis_orders/webhook-info'),

    getProfessionalTypes: () => request('GET', '/config/services/professional-types'),
    putProfessionalTypes: (types) => request('PUT', '/config/services/professional-types', types),
    getServiceReportSettings: () => request('GET', '/config/services/report-settings'),
    putServiceReportSettings: (body) => request('PUT', '/config/services/report-settings', body),
    getServicesReport: (qs = '') =>
      request('GET', `/services/reports${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    getAnalyticsAssociates: (qs = '') =>
      request('GET', `/analytics/associates${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    getAnalyticsServices: (qs = '') =>
      request('GET', `/analytics/services${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    getAnalyticsOrders: (qs = '') =>
      request('GET', `/analytics/orders${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    getAnalyticsReception: (qs = '') =>
      request('GET', `/analytics/reception${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    validateServicesReport: (body) => request('POST', '/services/reports/validate', body),
    addProfessionalContestReport: (id, body) =>
      request('POST', `/professionals/${id}/contest-reports`, body),
    deleteProfessionalContestReport: (id, index) =>
      request('DELETE', `/professionals/${id}/contest-reports/${index}`),
    createProfessionalPortalAccess: (id, body = {}) =>
      request('POST', `/professionals/${id}/portal-access`, body),
    resendProfessionalPortalAccess: (id) =>
      request('POST', `/professionals/${id}/portal-access/resend`, {}),
    acceptSystemUserInvite: (body) => request('POST', '/auth/system-invite/accept', body),
    previewSystemUserInvite: (token) =>
      request('GET', `/auth/system-invite/preview?token=${encodeURIComponent(token || '')}`),

    listSystemUsers: () => request('GET', '/system-users'),
    getSystemUser: (id) => request('GET', `/system-users/${id}`),
    createSystemUser: (body) => request('POST', '/system-users', body),
    updateSystemUser: (id, body) => request('PATCH', `/system-users/${id}`, body),
    deleteSystemUser: (id) => request('DELETE', `/system-users/${id}`),
    configSystems: () => request('GET', '/config/systems'),
    configBySystem: (system) => request('GET', `/config?system=${encodeURIComponent(system)}`),
    getConfig: (id) => request('GET', `/config/${id}`),
    createConfig: (body) => request('POST', '/config', body),
    updateConfig: (id, body) => request('PATCH', `/config/${id}`, body),
    clearConfig: (id) => request('POST', `/config/${id}/clear`, {}),
    deleteConfig: (id) => request('DELETE', `/config/${id}`),
    listItems: (collection, qs = '') => request('GET', `/items/${collection}${qs ? `?${qs}` : ''}`),
    getItem: (collection, id) => request('GET', `/items/${collection}/${id}`),
    createItem: (collection, body) => request('POST', `/items/${collection}`, body),
    updateItem: (collection, id, body) => request('PATCH', `/items/${collection}/${id}`, body),
    deleteItem: (collection, id) => request('DELETE', `/items/${collection}/${id}`),

    exportProductsCsv: async () => {
      const res = await fetch(`${root}/products/export.csv`, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const err0 = (json.errors && json.errors[0]) || {};
        throw new ApiError(res.status, err0.code || 'INTERNAL_ERROR', err0.message || res.statusText, err0.details, json.errors);
      }
      return res.text();
    },
    validateProductsImport: (body) => request('POST', '/products/import/validate', body),
    importProducts: (body) => request('POST', '/products/import', body),
    adjustProductStock: (id, body) => request('POST', `/products/${id}/stock`, body),
    listProductMovements: (id, qs = '') =>
      request('GET', `/products/${id}/movements${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`),
    updateProductBatch: (id, batch) => request('PATCH', `/products/${id}/batch`, { batch }),
    syncProductBatches: (items) => request('POST', '/products/sync-batches', { items }),

    // Reception / triage
    receptionFormSchema: () => request('GET', '/reception/form-schema'),
    createPublicReception: (body) => request('POST', '/reception/public', body),
    receptionStatusCounts: () => request('GET', '/reception/status-counts'),
    receptionAttendants: () => request('GET', '/reception/attendants'),
    createReception: (body) => request('POST', '/reception', body),
    completeReception: (id, completion_reason) =>
      request('PATCH', `/reception/${id}/complete`, { completion_reason }),
    assignReceptionAttendant: (id, attendant) =>
      request('PATCH', `/reception/${id}/attendant`, { attendant }),
    clearReceptionAttendant: (id) =>
      request('PATCH', `/reception/${id}/attendant`, { attendant: null }),
    setReceptionChatId: (id, chat_id) =>
      request('PATCH', `/reception/${id}/chat`, { chat_id }),
    syncReceptionUtalk: (id) => request('POST', `/reception/${id}/utalk-sync`, {}),
    syncReceptionUtalkWaiting: (body) =>
      request('POST', '/reception/utalk-sync-waiting', body || {}),
    updateReceptionStatus: (id, status) =>
      request('PATCH', `/reception/${id}/status`, { status }),
    getUtalkStatus: () => request('GET', '/modules/utalk/status'),
    getUtalkChat: (chatId) => request('GET', `/modules/utalk/chats/${encodeURIComponent(chatId)}`),
    transferUtalkChat: (body) => request('POST', '/modules/utalk/transfer', body),
    listUtalkAttendantsAdmin: () => request('GET', '/admin/external-services/utalk/attendants'),
    updateUtalkAttendantAdmin: (userCode, body) =>
      request('PUT', `/admin/external-services/utalk/attendants/${encodeURIComponent(userCode)}`, body),
    linkReceptionAssociate: (id, associate_code) =>
      request('PATCH', `/reception/${id}/link`, { associate_code }),
    unlinkReceptionAssociate: (id) => request('PATCH', `/reception/${id}/unlink`, {}),
    searchUsers: (q) => request('GET', `/users/search?q=${encodeURIComponent(q)}`),
    getUserByCode: (userCode, qs = '') =>
      request(
        'GET',
        `/users/by-code/${encodeURIComponent(userCode)}${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`
      ),
    listUsers: (qs = '') => request('GET', `/users${qs ? `?${qs}` : ''}`),
    createUser: (body) => request('POST', '/users', body),
    listUsersImportFields: () => request('GET', '/users/import/fields'),
    validateUsersImport: (body) => request('POST', '/users/import/validate', body),
    importUsers: (body) => request('POST', '/users/import', body),
    updateUser: (id, body) => request('PATCH', `/users/${id}`, body),
    deleteUser: (id) => request('DELETE', `/users/${id}`),
    makeAssociate: (id) => request('POST', `/users/${id}/make-associate`, {}),
    getUserPatients: (id) => request('GET', `/users/${id}/patients`),
    createUserPatient: (id, body) => request('POST', `/users/${id}/patients`, body),
    updateUserPatient: (id, patientId, body) =>
      request('PATCH', `/users/${id}/patients/${patientId}`, body),
    deleteUserPatient: (id, patientId) => request('DELETE', `/users/${id}/patients/${patientId}`),
    getUserHistory: (id) => request('GET', `/users/${id}/history`),
    listInstitutionalClients: (qs = '') =>
      request('GET', `/institutional-clients${qs ? `?${qs}` : ''}`),
    searchInstitutionalClients: (q) =>
      request('GET', `/institutional-clients/search?q=${encodeURIComponent(q)}`),
    getInstitutionalClientByCode: (clientCode) =>
      request('GET', `/institutional-clients/by-code/${encodeURIComponent(clientCode)}`),
    getInstitutionalClient: (id) => request('GET', `/institutional-clients/${id}`),
    getInstitutionalClientHistory: (id) =>
      request('GET', `/institutional-clients/${id}/history`),
    createInstitutionalClient: (body) => request('POST', '/institutional-clients', body),
    updateInstitutionalClient: (id, body) =>
      request('PATCH', `/institutional-clients/${id}`, body),
    deleteInstitutionalClient: (id) => request('DELETE', `/institutional-clients/${id}`),
    globalSearch: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') qs.set(k, String(v));
      });
      return request('GET', `/search?${qs.toString()}`);
    },

    // System activity
    listActivity: (qs = '') => request('GET', `/activity${qs ? `?${qs}` : ''}`),
    listMyActivity: (qs = '') => request('GET', `/activity/mine${qs ? `?${qs}` : ''}`),
    myActivityUnreadCount: () => request('GET', '/activity/mine/unread-count'),
    markActivityRead: (body) => request('POST', '/activity/mine/read', body),
  };
}
