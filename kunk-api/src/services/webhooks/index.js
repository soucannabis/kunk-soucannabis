'use strict';

const catalog = require('./catalog');
const repository = require('./repository');
const emit = require('./emit');
const sign = require('./sign');
const sanitize = require('./sanitize');
const dispatch = require('./dispatch');
const worker = require('./worker');
const testDelivery = require('./testDelivery');
const diff = require('./diff');

module.exports = {
  ...catalog,
  ...repository,
  ...emit,
  ...sign,
  ...sanitize,
  ...dispatch,
  ...worker,
  ...testDelivery,
  ...diff,
};
