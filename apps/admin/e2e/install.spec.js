import { test, expect } from '@playwright/test';
import { appUrl, isRemoteE2e } from './helpers/fixtures.js';
import {
  INSTALL_ASSOCIATION,
  INSTALL_E2E_EMAIL,
  INSTALL_E2E_PASSWORD,
  cleanupInstallE2e,
  installLogoPath,
  prepareInstallE2e,
} from './helpers/install.js';

test.describe.configure({ mode: 'serial' });

test.describe('install', () => {
  test.skip(isRemoteE2e(), 'Fluxo de instalação fresh exige ambiente local com banco vazio');

  test.beforeAll(async () => {
    await prepareInstallE2e();
  });

  test.afterAll(async () => {
    await cleanupInstallE2e();
  });

  test('banco vazio redireciona /login para /instalacao', async ({ page }) => {
    await page.goto(appUrl('/login'));
    await expect(page).toHaveURL(/\/instalacao/);
    await expect(page.getByRole('heading', { name: 'Instalação' })).toBeVisible();
  });

  test('senha fraca não conclui instalação', async ({ page }) => {
    await page.goto(appUrl('/instalacao'));
    await page.locator('#install-name').fill('Admin E2E');
    await page.locator('#install-email').fill(INSTALL_E2E_EMAIL);
    await page.locator('#install-password').fill('fraca');
    await page.locator('#install-password-confirm').fill('fraca');
    await page.getByRole('button', { name: 'Concluir instalação' }).click();
    await expect(page.getByRole('alert')).toContainText(/Senha/i);
    await expect(page).toHaveURL(/\/instalacao/);
  });

  test('fluxo completo: instalar, login e shell', async ({ page }) => {
    await page.goto(appUrl('/instalacao'));

    await page.locator('#install-name').fill('Admin E2E');
    await page.locator('#install-last-name').fill('Install');
    await page.locator('#install-email').fill(INSTALL_E2E_EMAIL);
    await page.locator('#install-password').fill(INSTALL_E2E_PASSWORD);
    await page.locator('#install-password-confirm').fill(INSTALL_E2E_PASSWORD);

    await page.locator('input[type="file"]').setInputFiles(installLogoPath());

    await page.locator('#install-associationName').fill(INSTALL_ASSOCIATION.associationName);
    await page.locator('#install-associationFullName').fill(INSTALL_ASSOCIATION.associationFullName);
    await page.locator('#install-associationEmail').fill(INSTALL_ASSOCIATION.associationEmail);
    await page.locator('#install-associationPhone').fill(INSTALL_ASSOCIATION.associationPhone);
    await page.locator('#install-associationSite').fill(INSTALL_ASSOCIATION.associationSite);
    await page.locator('#install-associationCnpj').fill(INSTALL_ASSOCIATION.associationCnpj);
    await page.locator('#install-associationCity').fill(INSTALL_ASSOCIATION.associationCity);
    await page.locator('#install-associationState').selectOption(INSTALL_ASSOCIATION.associationState);

    await page.getByRole('button', { name: 'Concluir instalação' }).click();
    await expect(page).toHaveURL(/\/login(\?installed=1)?$/);
    if (page.url().includes('installed=1')) {
      await expect(page.getByRole('status')).toContainText(/Instalação concluída/i);
    }

    await page.locator('#email').fill(INSTALL_E2E_EMAIL);
    await page.locator('#password').fill(INSTALL_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.admin-nav .brand')).toHaveText('Kunk Admin');
  });

  test('já instalado redireciona /instalacao para /login', async ({ page }) => {
    await page.goto(appUrl('/instalacao'));
    await expect(page).toHaveURL(/\/login/);
  });
});
