import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers/fixtures.js';
import { openIframeContactInNewTabAndSubmit } from './helpers/forms.js';
import { deleteReceptionByEmail } from './helpers/db.js';

/**
 * Contato: a página do cadastramento só embute o form (iframe).
 * Para preencher de verdade, abrimos a URL do iframe em outra aba (sem embed).
 */
test.describe('Contato — formulário nativo (URL do iframe)', () => {
  test('abre URL do iframe em nova aba, preenche e envia', async ({ page, context }) => {
    test.setTimeout(90_000);

    const email = uniqueEmail('contato-fila');

    try {
      await page.goto('/contato');
      await expect(page.locator('iframe[title="Formulário de contato"]')).toBeVisible({
        timeout: 20_000,
      });
      await openIframeContactInNewTabAndSubmit(page, context, { email });
    } finally {
      await deleteReceptionByEmail(email);
    }
  });
});
