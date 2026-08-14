import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpSearchAdapter,
  MockSearchAdapter,
  QueryBudget,
} from '@/lib/search/SearchAdapter';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpSearchAdapter（ADR-0001）', () => {
  it('解析 Tavily 响应（results 结构）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { title: '保温杯评测', url: 'https://example.com/a', content: '摘要内容 A' },
          { title: '保温杯选购', url: 'https://example.com/b', content: '摘要内容 B' },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new HttpSearchAdapter({
      provider: 'tavily',
      baseURL: 'https://api.tavily.com/search',
      apiKey: 'test-key',
    });
    const result = await adapter.search('保温杯');
    expect(result.degraded).toBe(false);
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({ title: '保温杯评测', url: 'https://example.com/a' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('解析 Serper 响应（organic 结构）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          organic: [{ title: '结果一', link: 'https://example.com/1', snippet: 's1' }],
        })
      )
    );
    const adapter = new HttpSearchAdapter({
      provider: 'serper',
      baseURL: 'https://google.serper.dev/search',
      apiKey: 'key',
    });
    const result = await adapter.search('x');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe('https://example.com/1');
  });

  it('上游 500 重试一次后失败降级', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'oops' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new HttpSearchAdapter({
      provider: 'tavily',
      baseURL: 'https://api.tavily.com/search',
      apiKey: 'key',
    });
    const result = await adapter.search('x');
    expect(result.degraded).toBe(true);
    expect(result.sources).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('按 URL 去重且同域名最多 3 条', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { title: 'a1', url: 'https://example.com/1', content: 'x' },
            { title: 'a2', url: 'https://example.com/2', content: 'x' },
            { title: 'a3', url: 'https://example.com/3', content: 'x' },
            { title: 'a4', url: 'https://example.com/4', content: 'x' },
            { title: 'dup', url: 'https://example.com/1', content: 'x' },
            { title: 'other', url: 'https://other.com/1', content: 'x' },
          ],
        })
      )
    );
    const adapter = new HttpSearchAdapter({
      provider: 'tavily',
      baseURL: 'https://api.tavily.com/search',
      apiKey: 'key',
    });
    const result = await adapter.search('x');
    const urls = result.sources.map((source) => source.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((url) => url.includes('example.com'))).toHaveLength(3);
    expect(urls).toContain('https://other.com/1');
  });

  it('6 小时缓存：同查询不重复请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ title: 't', url: 'https://example.com/c', content: 's' }] })
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new HttpSearchAdapter({
      provider: 'tavily',
      baseURL: 'https://api.tavily.com/search',
      apiKey: 'key',
    });
    await adapter.search('缓存查询');
    await adapter.search('缓存查询');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('MockSearchAdapter', () => {
  it('默认返回可配置来源', async () => {
    const adapter = new MockSearchAdapter();
    const result = await adapter.search('保温杯');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toContain('example.com');
  });
});

describe('QueryBudget', () => {
  it('配额耗尽后 consume 返回 false', () => {
    const budget = new QueryBudget(3);
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(false);
    expect(budget.exhausted).toBe(true);
    expect(budget.remaining).toBe(0);
  });
});
