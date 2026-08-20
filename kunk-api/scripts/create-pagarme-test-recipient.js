#!/usr/bin/env node
'use strict';

/**
 * Cria um recebedor fictício na Pagar.me (conta de teste) e imprime recipient_id.
 *
 * Credenciais: system_api_credentials (pagarme.secret_key) ou PAGARME_SECRET_KEY no .env.
 *
 * Uso:
 *   cd kunk-api && node scripts/create-pagarme-test-recipient.js
 *   node scripts/create-pagarme-test-recipient.js --save association
 *   node scripts/create-pagarme-test-recipient.js --save soucannabis
 *   node scripts/create-pagarme-test-recipient.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pagarme = require('../src/services/pagarme');

const SAVE_TARGETS = new Set(['association', 'soucannabis']);

function parseArgs(argv) {
  const out = { dryRun: false, save: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--save=')) out.save = arg.slice('--save='.length);
    else if (arg === '--save') {
      /* next handled below */
    } else if (SAVE_TARGETS.has(arg)) out.save = arg;
    else if (argv[argv.indexOf(arg) - 1] === '--save') out.save = arg;
  }
  if (argv.includes('--save')) {
    const i = argv.indexOf('--save');
    if (argv[i + 1] && SAVE_TARGETS.has(argv[i + 1])) out.save = argv[i + 1];
  }
  return out;
}

/** Payload PJ fictício — contrato API v5 (corporation + managing_partners). */
function buildFictionalRecipientPayload() {
  const stamp = Date.now();
  const document = '77699131000133'; // CNPJ válido (fictício, exemplo Pagar.me)
  const partnerDocument = '26224451990'; // CPF válido (fictício)
  const address = {
    street: 'Av Paulista',
    complementary: 'sem-complemento',
    reference_point: 'sem-referencia',
    street_number: '1000',
    neighborhood: 'Bela Vista',
    city: 'Sao Paulo',
    state: 'SP',
    zip_code: '01310100',
  };
  const phone_numbers = [
    { ddd: '11', number: '987654321', type: 'mobile' },
  ];

  return {
    code: `kunk-test-recipient-${stamp}`,
    register_information: {
      type: 'corporation',
      email: `recebedor-teste-${stamp}@example.com`,
      document,
      company_name: 'Associacao Teste Kunk LTDA',
      trading_name: 'Assoc Teste Kunk',
      site_url: 'https://example.com',
      annual_revenue: 120000,
      corporation_type: 'LTDA',
      founding_date: '2010-10-30',
      phone_numbers,
      main_address: address,
      managing_partners: [
        {
          name: 'Maria Silva Teste',
          email: `socio-teste-${stamp}@example.com`,
          document: partnerDocument,
          type: 'individual',
          mother_name: 'Ana Silva Teste',
          birthdate: '1984-10-30T00:00:00',
          monthly_income: 8000,
          professional_occupation: 'Administradora',
          self_declared_legal_representative: true,
          address,
          phone_numbers: [{ ddd: '11', number: '912345678', type: 'mobile' }],
        },
      ],
    },
    default_bank_account: {
      holder_name: 'Associacao Teste Kunk LTDA',
      holder_type: 'company',
      holder_document: document,
      bank: '341',
      branch_number: '1234',
      branch_check_digit: '0',
      account_number: '12345',
      account_check_digit: '6',
      type: 'checking',
    },
    automatic_anticipation_settings: { enabled: false },
    transfer_settings: {
      transfer_enabled: true,
      transfer_interval: 'daily',
      transfer_day: 0,
    },
  };
}

async function saveRecipientId(target, recipientId) {
  const key =
    target === 'association'
      ? 'modules.pagarme.association_recipient_id'
      : 'modules.pagarme.soucannabis_recipient_id';
  const desc =
    target === 'association'
      ? 'Recipient Pagarme da associação (split) — script teste'
      : 'Recipient Pagarme SouCannabis — script teste';
  await pagarme.config.setConfigValue(key, recipientId, desc, 'string');
  console.log(`Gravado em system_configs: ${key} = ${recipientId}`);
}

async function main() {
  const { dryRun, save } = parseArgs(process.argv);

  await pagarme.ensureCredentialRows();
  const creds = await pagarme.client.resolveConfig();
  if (!creds.secretKey) {
    console.error('secret_key ausente — configure no Admin ou PAGARME_SECRET_KEY no .env');
    process.exit(1);
  }
  const isTest = /^sk_test_/i.test(creds.secretKey);
  console.log('Pagar.me API:', creds.apiBase);
  console.log('Chave:', isTest ? 'sk_test_… (sandbox)' : 'sk_live_… (produção — cuidado)');

  const payload = buildFictionalRecipientPayload();
  console.log('\nPayload (resumo):');
  console.log('  code:', payload.code);
  console.log('  document:', payload.register_information.document);
  console.log('  email:', payload.register_information.email);

  if (dryRun) {
    console.log('\n--dry-run: não enviou à Pagar.me');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('\nCriando recebedor na Pagar.me…');
  const recipient = await pagarme.createRecipient(payload);
  const recipientId = String(recipient?.id || recipient?.recipient_id || '').trim();
  if (!recipientId) {
    console.error('Resposta sem recipient id:', JSON.stringify(recipient, null, 2));
    process.exit(1);
  }

  console.log('\n--- OK ---');
  console.log('recipient_id:', recipientId);
  console.log('status:', recipient.status || '(n/a)');
  if (recipient.default_bank_account?.id) {
    console.log('bank_account_id:', recipient.default_bank_account.id);
  }

  if (save) {
    if (!SAVE_TARGETS.has(save)) {
      console.error(`--save inválido: use association ou soucannabis`);
      process.exit(1);
    }
    await saveRecipientId(save, recipientId);
  } else {
    console.log('\nDica: grave no Admin ou rode com --save association | --save soucannabis');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFalha:', err.message || err);
    if (err.details) {
      console.error('details:', JSON.stringify(err.details, null, 2));
    }
    if (err.code) console.error('code:', err.code);
    process.exit(1);
  });
