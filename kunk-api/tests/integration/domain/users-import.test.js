'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { cleanupTestLocalUsers, query } = require('../../helpers/db');
const { uniqueValidCpf } = require('../../helpers/integrationEnv');

const stamp = Date.now();
const emailOk = `import-ok-${stamp}@test.local`;
const emailDup = `import-dup-${stamp}@test.local`;
const emailSkip = `import-skip-${stamp}@test.local`;
const cpfOk = uniqueValidCpf();

function buildCsv() {
  return [
    'Nome,Sobrenome,E-mail,CPF,Celular,CEP,UF,Cidade',
    `Ana,Importada,${emailOk},${cpfOk},11987654321,01310100,SP,São Paulo`,
    `Bruno,Duplicado,${emailDup},111.444.777-35,21988887777,22041080,RJ,Rio`,
    `Carla,Invalida,${emailSkip},000.000.000-00,11999998888,01310100,SP,São Paulo`,
  ].join('\n');
}

describe('domain/users-import', () => {
  let app;
  let cookie;

  before(async () => {
    await cleanupTestLocalUsers();
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    // Pré-cria usuário com e-mail que será pulado por duplicata
    const pre = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Pre',
        associate_last_name: 'Exist',
        email_account: emailDup,
      });
    assert.equal(pre.status, 201, JSON.stringify(pre.body));
  });

  after(async () => {
    await cleanupTestLocalUsers();
  });

  it('lists import fields with Portuguese labels', async () => {
    const res = await request(app)
      .get('/api/v1/users/import/fields')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fields = res.body.data?.fields || [];
    assert.ok(fields.length > 5);
    const nome = fields.find((f) => f.key === 'associate_name');
    assert.equal(nome?.label, 'Nome');
    assert.ok(!/associate_name/i.test(nome.label));
    const email = fields.find((f) => f.key === 'email_account');
    assert.equal(email?.label, 'E-mail');
    const last = fields.find((f) => f.key === 'associate_last_name');
    const full = fields.find((f) => f.key === 'fullname');
    assert.ok(fields.indexOf(last) < fields.indexOf(full));
    assert.ok(fields.some((f) => f.key === 'created_date'));
    assert.ok(!fields.some((f) => f.key === 'email'));
    assert.ok(!fields.some((f) => f.key === 'ciap_codes'));
    assert.ok(!fields.some((f) => f.key === 'associate_status'));
    assert.ok(!fields.some((f) => f.key === 'preferred_products'));
  });

  it('validates CSV: formats phone/cpf/cep, skips invalid and duplicates', async () => {
    const csv = buildCsv();
    const mapping = {
      Nome: 'associate_name',
      Sobrenome: 'associate_last_name',
      'E-mail': 'email_account',
      CPF: 'associate_cpf',
      Celular: 'mobile_number',
      CEP: 'cep',
      UF: 'state',
      Cidade: 'city',
    };

    const validated = await request(app)
      .post('/api/v1/users/import/validate')
      .set('Cookie', cookie)
      .send({ csv, mapping });
    assert.equal(validated.status, 200, JSON.stringify(validated.body));
    assert.equal(validated.body.data.total, 3);
    assert.equal(validated.body.data.valid, 1);
    assert.equal(validated.body.data.invalid, 2);

    const nomeField = (validated.body.data.fields || []).find((f) => f.key === 'email_account');
    assert.equal(nomeField?.label, 'E-mail');
    assert.ok(!(validated.body.data.fields || []).some((f) => f.key === 'email'));
    assert.ok(!(validated.body.data.fields || []).some((f) => f.key === 'ciap_codes'));

    const rows = validated.body.data.rows;
    const okRow = rows.find((r) => r.line === 2);
    assert.equal(okRow.ok, true);
    assert.equal(okRow.payload.mobile_number, '+5511987654321');
    assert.equal(okRow.payload.associate_cpf, cpfOk);
    assert.equal(okRow.payload.cep, '01310-100');

    const dupRow = rows.find((r) => r.line === 3);
    assert.equal(dupRow.ok, false);
    assert.ok(dupRow.errors.some((e) => /E-mail já cadastrado/i.test(e)));

    const badCpf = rows.find((r) => r.line === 4);
    assert.equal(badCpf.ok, false);
    assert.ok(badCpf.errors.some((e) => /CPF/i.test(e)));
  });

  it('imports only valid rows and persists formatted data', async () => {
    const csv = buildCsv();
    const mapping = {
      Nome: 'associate_name',
      Sobrenome: 'associate_last_name',
      'E-mail': 'email_account',
      CPF: 'associate_cpf',
      Celular: 'mobile_number',
      CEP: 'cep',
      UF: 'state',
      Cidade: 'city',
    };

    const imported = await request(app)
      .post('/api/v1/users/import')
      .set('Cookie', cookie)
      .send({ csv, mapping });
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.data.created, 1);
    assert.equal(imported.body.data.skipped, 2);
    assert.equal(imported.body.data.success, true);

    const db = await query(
      `SELECT associate_name, associate_cpf, mobile_number, cep, email_account, state
       FROM users WHERE email_account = $1`,
      [emailOk]
    );
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].associate_name, 'Ana');
    assert.equal(db.rows[0].associate_cpf, cpfOk);
    assert.equal(db.rows[0].mobile_number, '+5511987654321');
    assert.equal(db.rows[0].cep, '01310-100');
    assert.equal(db.rows[0].state, 'SP');

    const skipped = await query(`SELECT id FROM users WHERE email_account = $1`, [emailSkip]);
    assert.equal(skipped.rows.length, 0);
  });
});
