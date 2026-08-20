'use strict';

const path = require('path');
const fs = require('fs');

const PROBE_FILENAME = 'kunk-storage-probe.txt';
const PROBE_PATH = path.join(__dirname, 'fixtures', PROBE_FILENAME);

function loadProbeFile() {
  const buffer = fs.readFileSync(PROBE_PATH);
  return {
    filename: PROBE_FILENAME,
    mimeType: 'text/plain',
    buffer,
    key: `_kunk_probe/${Date.now()}_${PROBE_FILENAME}`,
  };
}

module.exports = { loadProbeFile, PROBE_FILENAME, PROBE_PATH };
