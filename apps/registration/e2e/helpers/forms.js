/** UI helpers for registration forms. */

import { expect } from '@playwright/test';

const CIAP_POOL = ['A01', 'A04', 'A05', 'P01', 'N01', 'L01', 'D01', 'R05', 'T08', 'B02'];

function labeledField(page, labelText) {
  return page
    .locator('label.form-label')
    .filter({ has: page.locator('.form-label-title', { hasText: new RegExp(`^${labelText}$`) }) })
    .first();
}

async function resolveFieldControl(page, labelText) {
  const re = new RegExp(`^${labelText}$`);
  const formLabel = labeledField(page, labelText);
  if (await formLabel.count()) {
    const nested = formLabel.locator('input, textarea, select').first();
    if (await nested.count()) return nested;
    return formLabel.locator('xpath=following-sibling::*[1]');
  }
  const labelCell = page.locator('main').getByText(re, { exact: true }).first();
  return labelCell.locator('xpath=..').locator('input, textarea, select').first();
}

async function checkCiap(page, code) {
  const addBtn = page.getByRole('button', { name: /Adicionar CIAP/i });
  if (await addBtn.count()) {
    await addBtn.first().click();
  }
  const search = page.locator('.kunk-ciap2-picker input.form-control').first();
  if (await search.count()) {
    await search.fill(code);
  }
  const checkbox = page
    .locator('label.kunk-ciap2-option')
    .filter({ hasText: new RegExp(`^${code}\\b`) })
    .locator('input[type="checkbox"]')
    .first();
  await checkbox.scrollIntoViewIfNeeded();
  await checkbox.check({ force: true });
}

/** Seleciona N códigos CIAP aleatórios via UI. */
export async function selectRandomCiap(page, count = 3) {
  const shuffled = [...CIAP_POOL].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, CIAP_POOL.length));
  for (const code of picked) {
    await checkCiap(page, code);
  }
  const closeBtn = page.getByRole('button', { name: /Fechar seletor/i });
  if (await closeBtn.count()) {
    await closeBtn.click();
  }
  return picked;
}

export async function fillLabeledInput(page, labelText, value) {
  const control = await resolveFieldControl(page, labelText);
  await control.fill(value);
}

export async function selectLabeled(page, labelText, value) {
  const control = await resolveFieldControl(page, labelText);
  await control.selectOption(value);
}

export async function fillResponsibleForm(page, data) {
  if (data.responsible_type === 'another') {
    await page.getByRole('radio', { name: /Para outra pessoa/i }).click();
  } else if (data.responsible_type === 'pet') {
    await page.getByRole('radio', { name: /Para pet/i }).click();
  } else {
    await page.getByRole('radio', { name: /Para mim/i }).click();
  }

  await fillLabeledInput(page, 'Nome', data.associate_name);
  await fillLabeledInput(page, 'Sobrenome', data.associate_last_name);
  await fillLabeledInput(page, 'Nascimento', data.associate_birth_date);
  await selectLabeled(page, 'Gênero', data.gender);
  await fillLabeledInput(page, 'Nacionalidade', data.nationality);
  await fillLabeledInput(page, 'CPF', data.associate_cpf);
  await fillLabeledInput(page, 'RG', data.associate_rg);
  await fillLabeledInput(page, 'Órgão emissor', data.associate_rg_issuer);
  await selectLabeled(page, 'Estado civil', data.marital_status);
  const phone = page.locator('.kunk-phone-input input[type="tel"], .react-tel-input input').first();
  await phone.fill('');
  await phone.pressSequentially(String(data.mobile_number).replace(/\D/g, ''), { delay: 15 });
  await fillLabeledInput(page, 'Rua', data.street);
  await fillLabeledInput(page, 'Número', data.street_number);
  await fillLabeledInput(page, 'Bairro', data.neighborhood);
  await fillLabeledInput(page, 'Cidade', data.city);
  await selectLabeled(page, 'UF', data.state);
  await fillLabeledInput(page, 'CEP', data.cep);

  if (data.responsible_type === 'pet') {
    await fillLabeledInput(page, 'Nome do pet', data.pet_name || 'Bidu');
    await fillLabeledInput(page, 'Nascimento do pet', data.pet_birth_date || '2020-03-15');
    await selectLabeled(page, 'Sexo', data.pet_gender || 'macho');
    await page.locator('textarea').first().fill(
      data.pet_reason_treatment_text || data.reason_treatment_text || 'Tratamento veterinário'
    );
    return;
  }

  await page.locator('textarea').first().fill(data.reason_treatment_text);

  if (data.ciap_random) {
    await selectRandomCiap(page, data.ciap_random);
  } else {
    for (const code of data.ciap_codes || []) {
      await checkCiap(page, code);
    }
    const closeBtn = page.getByRole('button', { name: /Fechar seletor/i });
    if (await closeBtn.count()) {
      await closeBtn.click();
    }
  }
}

export async function fillPatientForm(page, data) {
  const isPet = Boolean(data.is_pet || data.pet);
  if (isPet) {
    await fillLabeledInput(page, 'Nome do pet', data.associate_name);
    await fillLabeledInput(page, 'Nascimento do pet', data.associate_birth_date);
    await selectLabeled(page, 'Sexo', data.gender);
    await page.locator('textarea').first().fill(data.reason_treatment_text);
    return;
  }

  await fillLabeledInput(page, 'Nome', data.associate_name);
  await fillLabeledInput(page, 'Sobrenome', data.associate_last_name);
  await fillLabeledInput(page, 'Nascimento', data.associate_birth_date);
  await selectLabeled(page, 'Gênero', data.gender);
  await fillLabeledInput(page, 'Nacionalidade', data.nationality);
  await fillLabeledInput(page, 'CPF', data.associate_cpf);
  await fillLabeledInput(page, 'RG', data.associate_rg);
  await fillLabeledInput(page, 'Órgão emissor', data.associate_rg_issuer);
  await page.locator('textarea').first().fill(data.reason_treatment_text);
  for (const code of data.ciap_codes || []) {
    await checkCiap(page, code);
  }
  const closeBtn = page.getByRole('button', { name: /Fechar seletor/i });
  if (await closeBtn.count()) {
    await closeBtn.click();
  }
}

export async function uploadTinyJpeg(page, inputId) {
  await page.locator(`#${inputId}`).setInputFiles({
    name: 'doc.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
}

/** Anexa um arquivo arbitrário a um input (ex.: inválido ou oversized). */
export async function setInputFile(page, inputId, file) {
  await page.locator(`#${inputId}`).setInputFiles(file);
}

/** JPEG mínimo + clique em Enviar documentos. */
export async function pickAndUploadJpeg(page, inputId, sectionLabel = null) {
  await uploadTinyJpeg(page, inputId);
  const scope = sectionLabel
    ? page.locator('section.docs-subject').filter({ hasText: sectionLabel })
    : page;
  await scope.getByRole('button', { name: /^Enviar documentos$/i }).click();
}

/** Buffer acima do limite da API (25 MB). */
export function oversizedJpegBuffer(bytes = 26 * 1024 * 1024) {
  const buf = Buffer.alloc(bytes);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

/**
 * Na página /contato do cadastramento (iframe), abre a URL do form em nova aba
 * e preenche/envia nativamente. Retorna a aba do contato (já fechada).
 */
export async function openIframeContactInNewTabAndSubmit(page, context, data = {}) {
  const iframe = page.locator('iframe[title="Formulário de contato"]');
  await expect(iframe).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Carregando formulário/i)).toHaveCount(0, { timeout: 30_000 });
  await expect(iframe).toHaveAttribute('src', /.+/ , { timeout: 30_000 });

  const src = await iframe.getAttribute('src');
  if (!src) throw new Error('iframe de contato sem src');

  const contactUrl = new URL(src);
  contactUrl.searchParams.delete('embed');

  const contactTab = await context.newPage();
  try {
    await contactTab.goto(contactUrl.toString());
    await expect(contactTab.getByRole('heading', { name: /Fila de acolhimento/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(contactTab.getByText(/Preencha para entrar na fila/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(contactTab.getByRole('button', { name: /Entrar na fila/i })).toBeVisible({
      timeout: 20_000,
    });

    await contactTab.locator('#fila-name').fill(data.name || 'Maria');
    await contactTab.locator('#fila-last_name').fill(data.last_name || 'Oliveira');
    await contactTab.locator('#fila-email').fill(data.email);

    const phone = contactTab.locator('#fila-phone, .fila-phone input[type="tel"]').first();
    await phone.fill('');
    await phone.pressSequentially(String(data.phone || '11999887766').replace(/\D/g, ''), {
      delay: 20,
    });

    const helpTopic = contactTab.locator('#fila-help_topic');
    if (await helpTopic.count()) {
      const options = helpTopic.locator('option');
      const optionCount = await options.count();
      let picked = '';
      for (let i = 0; i < optionCount; i += 1) {
        const value = await options.nth(i).getAttribute('value');
        if (value) {
          picked = value;
          break;
        }
      }
      if (!picked) throw new Error('select Como podemos ajudar? sem opções');
      await helpTopic.selectOption(picked);
    }

    const message = contactTab.locator('#fila-message');
    if (await message.count()) {
      await message.fill(data.message || 'E2E: solicitação de contato pelo cadastramento');
    }

    const patientName = contactTab.locator('#fila-patient_name');
    if (await patientName.count()) {
      await patientName.fill(data.patient_name || 'Paciente E2E');
    }

    await contactTab.getByRole('button', { name: /Entrar na fila/i }).click();
    await expect(contactTab.getByRole('heading', { name: /Você entrou na fila/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      contactTab.getByText(/equipe de acolhimento entrará em contato/i)
    ).toBeVisible();
  } finally {
    await contactTab.close();
  }
}
