import { API_URL, PASSWORD, responsiblePayload, patientPayload, isRemoteE2E } from './fixtures.js';
import { hasExplicitDbUrl, ensureAssociateForE2E } from './db.js';
import { syncAssociateSessionFromResponse, hydrateAssociateInBrowser } from './session.js';
import { acquireRegisterSlot } from './registerBudget.js';

const PHASE = {
  1: 'cadastro_criado',
  2: 'dados_pessoais',
  3: 'documentos',
  4: 'assinatura_termo',
  5: 'associado',
};

const PHASE_ORDER = {
  cadastro_criado: 1,
  dados_pessoais: 2,
  documentos: 3,
  assinatura_termo: 4,
  concluido: 5,
};

function phaseRank(value) {
  if (typeof value === 'number') return value;
  return PHASE_ORDER[value] || PHASE_ORDER[PHASE[value]] || 1;
}

/**
 * API helpers bound to Playwright's context.request (shares cookies with the browser).
 */
export function createApi(request) {
  async function json(method, path, body, options = {}) {
    const res = await request[method](`${API_URL}${path}`, {
      data: body,
      failOnStatusCode: false,
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status(), data, res };
  }

  async function registerEmail(email, password = PASSWORD) {
    if (isRemoteE2E && !hasExplicitDbUrl()) {
      await acquireRegisterSlot();
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await json('post', '/auth/associate/register-email', { email, password });
      if (res.status !== 429) return res;
      const retryAfterHeader = res.res?.headers?.()['retry-after'];
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : Math.min(15 * 60 * 1000, 5000 * (attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return json('post', '/auth/associate/register-email', { email, password });
  }

  return {
    registerEmail,
    login: (email, password = PASSWORD) => json('post', '/auth/associate/login', { email, password }),
    logout: () => json('post', '/auth/associate/logout', {}),
    me: () => json('get', '/auth/associate/me'),
    patchMe: (fields) => json('patch', '/users/me', fields),
    createPatient: (fields) => json('post', '/users/me/patients', fields),
    advance: () => json('post', '/users/me/advance', {}),
    complete: () => json('post', '/users/me/complete', {}),
    documentsStatus: () => json('get', '/users/me/documents/status'),
    forgotPassword: (email) => json('post', '/auth/associate/forgot-password', { email }),
    resetPassword: (token, password) => json('post', '/auth/associate/reset-password', { token, password }),
    async uploadIdentity({ docType = 'cnh', side = 'front', subject = 'responsible' } = {}) {
      const res = await request.post(`${API_URL}/files`, {
        multipart: {
          file: {
            name: `${docType}-${side}.jpg`,
            mimeType: 'image/jpeg',
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
          },
          doc_type: docType,
          side,
          subject,
          doc_kind: 'identity',
        },
        failOnStatusCode: false,
      });
      return { status: res.status(), data: await res.json().catch(() => ({})) };
    },
  };
}

/**
 * Garante templates doc-sign publicados.
 * Usa APIRequestContext isolado para NÃO gravar cookie de operador no jar do browser
 * (em localhost isso faz a API ignorar associate_session no upload de identidade).
 *
 * @param {import('@playwright/test').BrowserContext | import('@playwright/test').APIRequestContext} [contextOrRequest]
 */
export async function ensureDocSignTemplatesPublished(contextOrRequest) {
  const { request: playwrightRequest } = await import('@playwright/test');
  const browserContext =
    contextOrRequest && typeof contextOrRequest.cookies === 'function'
      ? contextOrRequest
      : null;

  const api = await playwrightRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-Kunk-App': 'admin' },
  });

  try {
    const login = await api.post('/auth/login', {
      data: {
        email: process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test',
        password: process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!',
      },
      failOnStatusCode: false,
    });
    if (login.status() !== 200) {
      // fallback: templates may already be published by another process
      return;
    }

    for (const kind of ['self', 'with_patient']) {
      const tpl = await api.get(`/doc-sign/templates/${kind}`, {
        failOnStatusCode: false,
      });
      if (tpl.status() !== 200) continue;
      const body = await tpl.json().catch(() => ({}));
      if (body.data?.current_version_id) continue;
      await api.post(`/doc-sign/templates/${kind}/publish`, {
        data: { notes: 'e2e auto-publish' },
        failOnStatusCode: false,
      });
    }
  } finally {
    await api.dispose();
    if (browserContext) {
      const cookies = await browserContext.cookies();
      const operatorNames = new Set([
        'kunk_oss_session',
        'kunk_oss_session_admin',
        'kunk_oss_session_kunk',
        'kunk_oss_session_doc_sign',
      ]);
      const operatorCookies = cookies.filter((c) => operatorNames.has(c.name));
      if (operatorCookies.length) {
        await browserContext.clearCookies();
        const associateCookies = cookies.filter((c) => !operatorNames.has(c.name));
        if (associateCookies.length) {
          await browserContext.addCookies(associateCookies);
        }
      }
    }
  }
}

/**
 * Seed associate via API using page.context().request so the session cookie
 * is available to subsequent page.goto calls.
 * `phase` aceita 1–5 (legado e2e) ou string pt-BR.
 */
export async function seedAssociate(page, { email, phase = 1, responsibleType = 'himself' } = {}) {
  const targetRank = phaseRank(phase);
  if (targetRank >= 3) {
    await ensureDocSignTemplatesPublished(page.context());
  }
  const api = createApi(page.context().request);

  let user;
  if (isRemoteE2E && hasExplicitDbUrl()) {
    const inserted = await ensureAssociateForE2E(email);
    if (inserted) {
      const login = await api.login(email);
      if (login.status === 200) {
        await syncAssociateSessionFromResponse(page, login.res);
        user = login.data?.data?.user;
      }
    }
  }

  if (!user) {
    const reg = await api.registerEmail(email);
    if (reg.status !== 201) {
      throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.data)}`);
    }
    user = reg.data?.data?.user;
    if (isRemoteE2E) {
      await syncAssociateSessionFromResponse(page, reg.res);
    }
  }

  if (targetRank <= 1) {
    if (isRemoteE2E) {
      await hydrateAssociateInBrowser(page, email);
    }
    return { api, email, user };
  }

  const patch = await api.patchMe(responsiblePayload({ responsible_type: responsibleType }));
  if (patch.status !== 200) {
    throw new Error(`patchMe failed: ${patch.status} ${JSON.stringify(patch.data)}`);
  }

  if (responsibleType === 'another') {
    const patient = await api.createPatient(patientPayload());
    if (patient.status !== 201) {
      throw new Error(`createPatient failed: ${patient.status} ${JSON.stringify(patient.data)}`);
    }
  }

  let me = await api.me();
  while (phaseRank(me.data?.data?.user?.associate_status) < 3 && targetRank >= 3) {
    const adv = await api.advance();
    if (adv.status !== 200) {
      throw new Error(`advance failed: ${adv.status} ${JSON.stringify(adv.data)}`);
    }
    me = await api.me();
  }

  if (targetRank >= 4) {
    const up = await api.uploadIdentity({ docType: 'cnh', subject: 'responsible' });
    if (up.status !== 201) throw new Error(`upload failed: ${up.status} ${JSON.stringify(up.data)}`);
    if (responsibleType === 'another') {
      const upP = await api.uploadIdentity({ docType: 'cnh', subject: 'patient' });
      if (upP.status !== 201) throw new Error(`patient upload failed: ${upP.status}`);
    }
    const adv = await api.advance();
    if (adv.status !== 200) {
      throw new Error(`advance to assinatura_termo failed: ${adv.status} ${JSON.stringify(adv.data)}`);
    }
  }

  if (targetRank >= 5) {
    const { forceAssociateStatus } = await import('./db.js');
    await forceAssociateStatus(email, {
      status: 'Associado',
      associate_status: 'assinatura_termo',
    });
  }

  me = await api.me();
  if (isRemoteE2E) {
    await hydrateAssociateInBrowser(page, email);
  }
  return { api, email, user: me.data?.data?.user };
}
