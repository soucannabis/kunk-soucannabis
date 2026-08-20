'use strict';

const { fail } = require('../../utils/response');
const { isModuleEnabled } = require('../../services/moduleFlags');

function requireModule(name) {
  return async (req, res, next) => {
    try {
      if (!(await isModuleEnabled(name))) {
        return res.status(503).json(
          fail('MODULE_DISABLED', `Módulo ${name} desabilitado`, { module: name })
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireModule };
