'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { createApp } = require('../../src/app');
const { closePool } = require('../../src/db/pool');

function getApp() {
  return createApp();
}

module.exports = { getApp, closePool };
