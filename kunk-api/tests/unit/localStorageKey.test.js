'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { createLocalDriver } = require('../../src/storage/local');
const { AppError } = require('../../src/utils/response');

describe('local storage resolveKey', () => {
  let root;
  let driver;

  before(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kunk-storage-'));
    driver = createLocalDriver({ rootPath: root });
    await driver.put({ key: 'ok.txt', buffer: Buffer.from('inside') });
  });

  after(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('reads relative keys inside the storage root', async () => {
    const buf = await driver.getBuffer({ key: 'ok.txt' });
    assert.equal(buf.toString(), 'inside');
  });

  it('allows an absolute key only when it stays inside the root', async () => {
    const abs = path.join(root, 'ok.txt');
    const buf = await driver.getBuffer({ key: abs });
    assert.equal(buf.toString(), 'inside');
  });

  it('rejects absolute keys outside the storage root', async () => {
    await assert.rejects(
      () => driver.getBuffer({ key: '/etc/passwd' }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_STORAGE_KEY');
        return true;
      }
    );
  });

  it('rejects path traversal out of the storage root', async () => {
    const outside = path.join(root, '..', 'outside.txt');
    await fsp.writeFile(outside, 'nope');
    try {
      await assert.rejects(
        () => driver.getBuffer({ key: '../outside.txt' }),
        (err) => err.code === 'INVALID_STORAGE_KEY'
      );
    } finally {
      await fsp.unlink(outside).catch(() => {});
    }
  });

  it('does not treat an outside path as existing', async () => {
    assert.equal(fs.existsSync('/etc/passwd'), true);
    await assert.rejects(
      () => driver.exists({ key: '/etc/passwd' }),
      (err) => err.code === 'INVALID_STORAGE_KEY'
    );
  });

  it('allows a filename that starts with dots but stays inside the root', async () => {
    await driver.put({ key: '..keep.txt', buffer: Buffer.from('dots') });
    const buf = await driver.getBuffer({ key: '..keep.txt' });
    assert.equal(buf.toString(), 'dots');
  });
});
