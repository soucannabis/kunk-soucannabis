'use strict';

const { Router } = require('express');
const itemsService = require('../services/itemsService');
const { authenticate } = require('../middleware/authenticate');
const { can, hasScope, scopeFilterFor } = require('../schema/rbac');
const { ok, AppError } = require('../utils/response');
const { getCollection } = require('../schema/collections');

const router = Router();

function authorizeCollection(action) {
  return (req, res, next) => {
    try {
      const collection = req.params.collection;
      if (!getCollection(collection)) {
        throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collection}`);
      }
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária');
      }
      if (req.auth?.type === 'api_key') {
        if (!hasScope(req.auth.scopes, collection, action)) {
          throw new AppError(403, 'FORBIDDEN', `Sem permissão para ${action} em ${collection}`);
        }
      } else {
        const roles = req.user.roles || req.user.permissions || [];
        if (!can(roles, collection, action)) {
          throw new AppError(403, 'FORBIDDEN', `Sem permissão para ${action} em ${collection}`);
        }
      }
      req.scopeFilter = scopeFilterFor(req.user.roles || req.user.permissions, req.user, collection);
      next();
    } catch (err) {
      next(err);
    }
  };
}

router.use(authenticate);

router.get('/:collection', authorizeCollection('read'), async (req, res, next) => {
  try {
    const result = await itemsService.list(req);
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/:collection/:id', authorizeCollection('read'), async (req, res, next) => {
  try {
    const data = await itemsService.getById(req);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:collection', authorizeCollection('create'), async (req, res, next) => {
  try {
    const data = await itemsService.create(req);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:collection/:id', authorizeCollection('update'), async (req, res, next) => {
  try {
    const data = await itemsService.update(req);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:collection/:id', authorizeCollection('delete'), async (req, res, next) => {
  try {
    const data = await itemsService.remove(req);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
