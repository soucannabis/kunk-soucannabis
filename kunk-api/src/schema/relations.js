'use strict';

/**
 * Relações lógicas / FK por código para o param `include`.
 * localField → targetCollection.targetKey
 */
const RELATIONS = {
  services: {
    professional: {
      localField: 'professional_id',
      targetCollection: 'professionals',
      targetKey: 'professional_code',
      embedAs: 'professional',
    },
    associate: {
      localField: 'associate_user_code',
      targetCollection: 'users',
      targetKey: 'user_code',
      embedAs: 'associate',
    },
  },
  users: {
    responsible: {
      localField: 'responsible_code',
      targetCollection: 'users',
      targetKey: 'user_code',
      embedAs: 'responsible',
    },
  },
};

function getRelation(collection, includeKey) {
  return RELATIONS[collection]?.[includeKey] || null;
}

function listIncludeKeys(collection) {
  return Object.keys(RELATIONS[collection] || {});
}

module.exports = {
  RELATIONS,
  getRelation,
  listIncludeKeys,
};
