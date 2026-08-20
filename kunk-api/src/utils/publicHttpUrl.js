'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const { AppError } = require('./response');
const { env } = require('../config/env');

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function normalizeIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (value.startsWith('::ffff:') && net.isIP(value.slice(7)) === 4) {
    return value.slice(7);
  }
  return value;
}

function isLoopbackIp(ip) {
  const n = normalizeIp(ip);
  if (n === '::1') return true;
  const v4 = ipv4ToInt(n);
  if (v4 == null) return false;
  return ((v4 >>> 24) & 255) === 127;
}

function isDisallowedIpv4(int) {
  const a = (int >>> 24) & 255;
  const b = (int >>> 16) & 255;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isDisallowedIpv6(ip) {
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('ff')) return true;
  return false;
}

/** Loopback, RFC1918, link-local, CGNAT, unspecified, multicast. */
function isDisallowedIp(ip, { allowLoopback = false } = {}) {
  const n = normalizeIp(ip);
  const kind = net.isIP(n);
  if (!kind) return true;
  if (allowLoopback && isLoopbackIp(n)) return false;
  if (kind === 4) {
    const int = ipv4ToInt(n);
    return int == null || isDisallowedIpv4(int);
  }
  return isDisallowedIpv6(n);
}

function isBlockedHostname(hostname, { allowLoopback = false } = {}) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return true;
  if (allowLoopback && (host === 'localhost' || host.endsWith('.localhost'))) return false;
  if (host === 'localhost' || host === 'localhost.localdomain') return true;
  if (host === 'metadata' || host === 'metadata.google.internal') return true;
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  return false;
}

async function defaultLookup(hostname) {
  return dns.lookup(hostname, { all: true });
}

/**
 * http(s) only, no credentials, no private/link-local/loopback (loopback allowed in NODE_ENV=test).
 * Resolves DNS and rejects if any address is internal (DNS rebinding).
 */
async function assertPublicHttpUrl(url, { allowLoopback = env.nodeEnv === 'test', lookup = defaultLookup } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL inválida');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL deve usar http ou https');
  }
  if (parsed.username || parsed.password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL do webhook não pode incluir usuário ou senha');
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname, { allowLoopback })) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL interna não é permitida');
  }

  let addresses;
  try {
    if (net.isIP(hostname)) {
      addresses = [hostname];
    } else {
      const records = await lookup(hostname);
      addresses = (records || []).map((r) => r.address);
    }
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Não foi possível resolver o host da URL');
  }
  if (!addresses.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Não foi possível resolver o host da URL');
  }
  for (const addr of addresses) {
    if (isDisallowedIp(addr, { allowLoopback })) {
      throw new AppError(400, 'VALIDATION_ERROR', 'URL interna não é permitida');
    }
  }
  return parsed.toString();
}

module.exports = {
  isDisallowedIp,
  isLoopbackIp,
  isBlockedHostname,
  assertPublicHttpUrl,
};
