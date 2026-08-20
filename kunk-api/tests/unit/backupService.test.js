'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseScheduleTime } = require('../../src/services/backupService');

describe('backupService.parseScheduleTime', () => {
  it('parses HH:MM', () => {
    assert.deepEqual(parseScheduleTime('03:00'), { hour: 3, minute: 0 });
    assert.deepEqual(parseScheduleTime('23:59'), { hour: 23, minute: 59 });
  });

  it('rejects invalid', () => {
    assert.equal(parseScheduleTime(''), null);
    assert.equal(parseScheduleTime('25:00'), null);
    assert.equal(parseScheduleTime('abc'), null);
  });
});
