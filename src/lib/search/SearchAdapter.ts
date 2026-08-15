import { randomUUID } from 'node:crypto';
import { safeFetch } from '@/lib/security/safe-url';

// ============================================
// 搜索服务适配器（V3 Phase 7 / ADR-0001）
// 统一联网搜索接口：供应商协议映射、进程内缓存（TTL 6h）、
// URL 去重与同域名限流、查询配额、失败降级。
// ============================================

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResult {
  query: string;
  sources: SearchSource[];
  retrievedAt: string;
  /** 查询是否因配额/失败未完成。 */
  degraded: boolean;
  error?: string;
}

export interface SearchAdapterConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface SearchAdapter {
  search(query: string): Promise<SearchResult>;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SOURCES_PER_QUERY = 8;
const MAX_SOURCES_PER_DOMAIN = 3;

interface CacheEntry {
  result: SearchResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

function cacheKey(provider: string, query: string): string {
  return `${provider}:${normalizeQuery(query)}`;
}

function dedupeSources(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  const domainCount = new Map<string, number>();
  const result: SearchSource[] = [];
  for (const source of sources) {
    if (!source.url || !source.title) continue;
    if (seen.has(source.url)) continue;
    let domain = '';
    try {
      domain = new URL(source.url).hostname;
    } catch {
      domain = source.url;
    }
    if ((domainCount.get(domain) ?? 0) >= MAX_SOURCES_PER_DOMAIN) continue;
    seen.add(source.url);
    domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
    result.push(source);
    if (result.length >= MAX_SOURCES_PER_QUERY) break;
  }
  return result;
}

function parseResponse(provider: string, payload: unknown): SearchSource[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;

  let rawList: unknown[] = [];
  if (provider === 'serper') {
    rawList = Array.isArray(data.organic) ? (data.organic as unknown[]) : [];
  } else {
    rawList = Array.isArray(data.results)
      ? (data.results as unknown[])
      : Array.isArray(data.data)
        ? (data.data as unknown[])
        : [];
  }

  const sources: SearchSource[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title : '';
    const url = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '';
    const snippet =
      typeof item.content === 'string'
        ? item.content
        : typeof item.snippet === 'string'
          ? item.snippet
          : typeof item.description === 'string'
            ? item.description
            : '';
    if (title && url) {
      sources.push({ title, url, snippet: snippet.slice(0, 2000) });
    }
  }
  return dedupeSources(sources);
}

export class HttpSearchAdapter implements SearchAdapter {
  constructor(private config: SearchAdapterConfig) {}

  async search(query: string): Promise<SearchResult> {
    const key = cacheKey(this.config.provider, query);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { ...cached.result, query };
    }

    const startedAt = Date.now();
    let attempt = 0;
    let lastError = '';

    while (attempt <= 1) {
      attempt += 1;
      try {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);

        const response = await safeFetch(this.config.baseURL.replace(/\/+$/, ''), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify({ query, ...(this.config.provider === 'serper' ? { q: query } : {}) }),
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            lastError = `搜索服务错误 (${response.status})`;
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
            continue;
          }
          throw new Error(`搜索服务错误 (${response.status})`);
        }

        const payload: unknown = await response.json();
        const sources = parseResponse(this.config.provider, payload);
        const result: SearchResult = {
          query,
          sources,
          retrievedAt: new Date().toISOString(),
          degraded: sources.length === 0,
          ...(sources.length === 0 ? { error: '搜索服务未返回可用结果' } : {}),
        };
        cache.set(key, { result, cachedAt: Date.now() });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 300) : '搜索服务不可用';
        if (attempt <= 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    console.warn(
      `[SearchAdapter] query=${normalizeQuery(query).slice(0, 60)} failed after ${Date.now() - startedAt}ms: ${lastError}`
    );
    return {
      query,
      sources: [],
      retrievedAt: new Date().toISOString(),
      degraded: true,
      error: lastError || '搜索服务不可用',
    };
  }
}

/** 测试用 Mock 搜索适配器。 */
export class MockSearchAdapter implements SearchAdapter {
  private scenario: (query: string) => SearchResult;

  constructor(scenario?: (query: string) => SearchResult) {
    this.scenario =
      scenario ??
      ((query) => ({
        query,
        sources: [
          {
            title: `搜索结果：${query}`,
            url: 'https://example.com/result',
            snippet: `这是关于 ${query} 的摘要内容。`,
          },
        ],
        retrievedAt: new Date().toISOString(),
        degraded: false,
      }));
  }

  setScenario(scenario: (query: string) => SearchResult): this {
    this.scenario = scenario;
    return this;
  }

  async search(query: string): Promise<SearchResult> {
    return this.scenario(query);
  }
}

/** 查询预算跟踪（ADR-0001 第 3 节）。 */
export class QueryBudget {
  private used = 0;

  constructor(private max: number) {}

  get remaining(): number {
    return Math.max(this.max - this.used, 0);
  }

  get exhausted(): boolean {
    return this.used >= this.max;
  }

  consume(): boolean {
    if (this.exhausted) return false;
    this.used += 1;
    return true;
  }
}

export function buildSearchRequestId(): string {
  return randomUUID();
}
