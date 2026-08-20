export const FRONT_URL = process.env.E2E_FRONT_URL || process.env.KUNK_URL || 'http://localhost:4257';
export const API_URL = process.env.E2E_API_URL || `${FRONT_URL}/api/v1`;

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!';

export const ACOL_EMAIL = process.env.E2E_ACOL_EMAIL || 'acolhimento@kunk-api.test';
export const ACOL_PASSWORD = process.env.E2E_ACOL_PASSWORD || 'TestAcol123!';

export const FINANCEIRO_EMAIL = process.env.E2E_FINANCEIRO_EMAIL || 'financeiro@kunk-api.test';
export const FINANCEIRO_PASSWORD = process.env.E2E_FINANCEIRO_PASSWORD || 'TestFinanceiro123!';
