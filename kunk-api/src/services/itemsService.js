'use strict';

const itemsRepository = require('../repositories/itemsRepository');
const { scopeFilterFor, portalProfessionalDeniedFields } = require('../schema/rbac');
const { AppError } = require('../utils/response');
const { assertProfessionalDeletable } = require('./linkGuards');
const { memoryCache, keys } = require('../cache');

function getScope(req) {
  return scopeFilterFor(
    req.user?.roles || req.user?.permissions,
    req.user,
    req.params.collection
  );
}

function invalidateCollectionCaches(collection) {
  if (collection === 'tags') {
    memoryCache.invalidatePrefix('tags:');
  }
  if (collection === 'products') {
    memoryCache.invalidate(keys.PRODUCTS_CATALOG);
  }
  if (collection === 'professionals') {
    memoryCache.invalidate(keys.PROFESSIONALS_PRESCRIBERS);
  }
  if (collection === 'system_users') {
    memoryCache.invalidate(keys.ATTENDANTS);
  }
}

async function list(req) {
  return itemsRepository.listItems(req.params.collection, req.query, {
    scopeFilter: getScope(req),
  });
}

async function getById(req) {
  return itemsRepository.getItem(req.params.collection, req.params.id, req.query, {
    scopeFilter: getScope(req),
  });
}

async function create(req) {
  const data = await itemsRepository.createItem(req.params.collection, req.body);
  invalidateCollectionCaches(req.params.collection);
  return data;
}

async function update(req) {
  if (req.params.collection === 'professionals') {
    const denied = portalProfessionalDeniedFields(
      req.user?.roles || req.user?.permissions,
      req.body || {}
    );
    if (denied.length) {
      throw new AppError(403, 'FORBIDDEN', 'Sem permissão para alterar estes campos');
    }
  }
  const data = await itemsRepository.updateItem(req.params.collection, req.params.id, req.body, {
    scopeFilter: getScope(req),
  });
  invalidateCollectionCaches(req.params.collection);
  return data;
}

async function remove(req) {
  const collection = req.params.collection;
  const id = req.params.id;
  if (collection === 'users') {
    const usersService = require('./usersService');
    const data = await usersService.deleteUser(id);
    invalidateCollectionCaches(collection);
    return data;
  }
  if (collection === 'professionals') {
    const pro = await itemsRepository.getItem('professionals', id);
    await assertProfessionalDeletable(pro);
  }
  if (collection === 'orders') {
    const ordersService = require('./ordersService');
    return ordersService.deleteOrder(id);
  }
  const data = await itemsRepository.deleteItem(collection, id, {
    scopeFilter: getScope(req),
  });
  invalidateCollectionCaches(collection);
  return data;
}

module.exports = { list, getById, create, update, remove };
