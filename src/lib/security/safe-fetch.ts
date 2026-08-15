/** Browser-compatible URL guard used by adapter modules that may be bundled client-side. */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('上游地址必须使用 HTTPS');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') ||
    /^(10\.|127\.|169\.254\.|192\.168\.)/.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new Error('上游地址不允许访问内部主机');
  }
  return fetch(url.toString(), { ...init, redirect: 'error' });
}
