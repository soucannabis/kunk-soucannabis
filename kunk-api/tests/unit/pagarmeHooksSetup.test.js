'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  stripUrlAuth,
  withBasicAuthInUrl,
  urlsMatch,
  extractHookList,
  summarizeStoredHooks,
  friendlyListError,
  isApiCreateUnsupported,
  getWebhookUrls,
} = require('../../src/services/pagarme/hooksSetup');

describe('pagarme hooksSetup helpers', () => {
  it('strips basic auth from URL', () => {
    assert.equal(
      stripUrlAuth('https://user:pass@api.example.com/api/v1/modules/pagarme/webhook'),
      'https://api.example.com/api/v1/modules/pagarme/webhook'
    );
  });

  it('embeds basic auth in URL', () => {
    const out = withBasicAuthInUrl('https://api.example.com/hook', 'u1', 'p1');
    assert.match(out, /https:\/\/u1:p1@api\.example\.com\/hook/);
  });

  it('matches URLs ignoring auth and trailing slash', () => {
    assert.equal(
      urlsMatch(
        'https://u:p@api.example.com/api/v1/modules/pagarme/webhook/',
        'https://api.example.com/api/v1/modules/pagarme/webhook'
      ),
      true
    );
  });

  it('extracts hook list from common response shapes', () => {
    assert.equal(extractHookList([{ id: 'hook_1' }]).length, 1);
    assert.equal(extractHookList({ data: [{ id: 'hook_2' }] }).length, 1);
    assert.equal(extractHookList({ items: [{ id: 'hook_3' }] }).length, 1);
    assert.equal(extractHookList({}).length, 0);
  });

  it('summarizes stored setup results for UI', () => {
    const rows = summarizeStoredHooks({
      ok: true,
      events: ['order.paid'],
      results: [
        {
          key: 'orders',
          url: 'https://api.example.com/api/v1/modules/pagarme/webhook',
          created: true,
          hook_id: 'hook_abc',
          events: ['order.paid'],
          register_url_has_auth: true,
        },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, 'Pedidos');
    assert.equal(rows[0].hook_id, 'hook_abc');
    assert.equal(rows[0].created, true);
  });

  it('softens 401 list errors', () => {
    const out = friendlyListError({
      message: 'Pagar.me HTTP 401',
      code: 'PAGARME_AUTH',
      details: { status: 401 },
    });
    assert.equal(out.list_unavailable, true);
    assert.equal(out.list_error, null);
  });

  it('treats 401 as unsupported API create', () => {
    assert.equal(
      isApiCreateUnsupported({
        code: 'PAGARME_AUTH',
        message: 'Pagar.me HTTP 401',
        details: { status: 401 },
      }),
      true
    );
  });

  it('returns empty webhook URLs when PUBLIC_API_URL is localhost', () => {
    const prevPublic = process.env.PUBLIC_API_URL;
    const prevHook = process.env.PAGARME_WEBHOOK_PUBLIC_URL;
    process.env.PUBLIC_API_URL = 'http://localhost:4250';
    delete process.env.PAGARME_WEBHOOK_PUBLIC_URL;
    try {
      const urls = getWebhookUrls();
      assert.equal(urls.base, '');
      assert.equal(urls.orders, '');
      assert.equal(urls.services, '');
    } finally {
      if (prevPublic === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = prevPublic;
      if (prevHook === undefined) delete process.env.PAGARME_WEBHOOK_PUBLIC_URL;
      else process.env.PAGARME_WEBHOOK_PUBLIC_URL = prevHook;
    }
  });

  it('uses PAGARME_WEBHOOK_PUBLIC_URL when set', () => {
    const prevPublic = process.env.PUBLIC_API_URL;
    const prevHook = process.env.PAGARME_WEBHOOK_PUBLIC_URL;
    process.env.PUBLIC_API_URL = 'http://localhost:4250';
    process.env.PAGARME_WEBHOOK_PUBLIC_URL = 'https://api.example.com';
    try {
      const urls = getWebhookUrls();
      assert.equal(urls.base, 'https://api.example.com');
      assert.match(urls.orders, /^https:\/\/api\.example\.com\/api\/v1\/modules\/pagarme\/webhook/);
    } finally {
      if (prevPublic === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = prevPublic;
      if (prevHook === undefined) delete process.env.PAGARME_WEBHOOK_PUBLIC_URL;
      else process.env.PAGARME_WEBHOOK_PUBLIC_URL = prevHook;
    }
  });
});
