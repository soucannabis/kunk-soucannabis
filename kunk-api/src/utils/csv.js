'use strict';

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * @param {string} text
 * @param {{ lowerHeaders?: boolean }} [opts]
 * @returns {Array<Record<string, string> & { __line: number }>}
 */
function parseCsvText(text, opts = {}) {
  const lowerHeaders = opts.lowerHeaders !== false;
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => {
    const trimmed = h.trim();
    return lowerHeaders ? trimmed.toLowerCase() : trimmed;
  });
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const obj = { __line: i + 1 };
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? cells[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}

function escapeCsvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = {
  detectDelimiter,
  parseCsvLine,
  parseCsvText,
  escapeCsvCell,
};
