'use strict';

/** Aceita bool, 1/0 e legado 'Sim'/'Não'. */
function isFlagTrue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null || value === '') return false;
  const s = String(value).trim().toLowerCase();
  return s === 'sim' || s === 'true' || s === '1' || s === 'yes';
}

function isCollaboratorTrue(value) {
  return isFlagTrue(value);
}

function isPrescriberTrue(value) {
  return isFlagTrue(value);
}

/** Normaliza para persistência OSS (boolean-like string 'true'/'false' ou bool). */
function normalizeFlagForWrite(value) {
  return isFlagTrue(value);
}

module.exports = {
  isFlagTrue,
  isCollaboratorTrue,
  isPrescriberTrue,
  normalizeFlagForWrite,
};
