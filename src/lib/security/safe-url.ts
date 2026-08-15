import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data.ec2.internal',
]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return true;
}

/** Validate a user-configured upstream before sending credentials or making a request. */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('上游地址格式不正确');
  }
  if (url.protocol !== 'https:') throw new Error('上游地址必须使用 HTTPS');
  if (url.username || url.password) throw new Error('上游地址不允许包含用户凭据');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new Error('上游地址不允许访问内部主机');
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) throw new Error('上游地址不允许访问内网地址');
  if (!net.isIP(hostname)) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateIp(record.address))) {
      throw new Error('上游域名解析到了不允许访问的地址');
    }
  }
  return url;
}

export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = await assertSafeOutboundUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url.toString(), { ...init, redirect: 'error', signal: init.signal ?? controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
