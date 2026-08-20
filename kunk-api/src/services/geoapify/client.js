'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');

async function getApiKey(credsOverride = null) {
  if (credsOverride?.api_key) return String(credsOverride.api_key).trim();
  const resolved = await credentialsService.requireFields('geoapify', ['api_key']);
  return String(resolved.api_key || '').trim();
}

async function geocodeSearch(text, credsOverride = null) {
  const apiKey = await getApiKey(credsOverride);
  if (!apiKey) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'api_key Geoapify ausente');
  }
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
    String(text || '').trim()
  )}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(502, 'GEOAPIFY_ERROR', `Geoapify HTTP ${res.status}`, {
      status: res.status,
      body: body.slice(0, 400),
    });
  }
  return res.json();
}

/** Teste leve: geocode de um endereço BR conhecido. */
async function testConnection(creds) {
  const apiKey = String(creds?.api_key || '').trim();
  if (!apiKey) {
    throw new Error('api_key é obrigatório');
  }
  const data = await geocodeSearch('Praça da Sé, São Paulo, SP, Brasil', { api_key: apiKey });
  if (!Array.isArray(data?.features)) {
    throw new Error('Resposta Geoapify inválida');
  }
  return { ok: true, features: data.features.length };
}

/** Garante metadados de credenciais mesmo sem o SQL de seed aplicado. */
async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('geoapify', 'api_key', NULL, 'GEOAPIFY_API_KEY', true, 'Geoapify Geocoding API key')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  getApiKey,
  geocodeSearch,
  testConnection,
  ensureCredentialRows,
};
