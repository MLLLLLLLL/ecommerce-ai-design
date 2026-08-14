import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { TextCompletionError } from '@/lib/ai/text-completion-client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chatResponse(content: unknown) {
  return jsonResponse({ choices: [{ message: { content } }] });
}

function baseClient(overrides: Partial<{ timeoutMs: number; maxRetries: number }> = {}) {
  return new HttpTextCompletionClient({
    baseURL: 'https://example.com/v1',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 1000,
    maxRetries: 0,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpTextCompletionClient', () => {
  it('成功返回模型文本内容', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('hello world'));
    vi.stubGlobal('fetch', fetchMock);

    const client = baseClient();
    const content = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
      responseFormat: 'json_object',
    });

    expect(content).toBe('hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'test-model',
      response_format: { type: 'json_object' },
    });
  });

  it('数组内容被拼接为文本', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(chatResponse([{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }]))
    );
    const content = await baseClient().complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(content).toBe('part1part2');
  });

  it('对象内容被序列化为 JSON 字符串', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse({ a: 1 })));
    const content = await baseClient().complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(JSON.parse(content)).toEqual({ a: 1 });
  });

  it('429 可重试：第一次失败第二次成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429))
      .mockResolvedValueOnce(chatResponse('ok after retry'));
    vi.stubGlobal('fetch', fetchMock);

    const client = baseClient({ maxRetries: 2 });
    const content = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(content).toBe('ok after retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx 重试耗尽后抛出 server_error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: {} }, 500));
    vi.stubGlobal('fetch', fetchMock);

    const client = baseClient({ maxRetries: 2 });
    try {
      await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
      expect.unreachable('应当抛出 TextCompletionError');
    } catch (error) {
      expect(error).toBeInstanceOf(TextCompletionError);
      expect((error as TextCompletionError).kind).toBe('server_error');
      expect((error as TextCompletionError).status).toBe(500);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('400 时 response_format 降级重试一次后成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'response_format not supported' } }, 400)
      )
      .mockResolvedValueOnce(chatResponse('ok without response_format'));
    vi.stubGlobal('fetch', fetchMock);

    const client = baseClient({ maxRetries: 0 });
    const content = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
      responseFormat: 'json_object',
    });
    expect(content).toBe('ok without response_format');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(retryInit.body as string)).not.toHaveProperty('response_format');
  });

  it('401 不可重试：立即抛出 invalid_request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const client = baseClient({ maxRetries: 2 });
    await expect(client.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      kind: 'invalid_request',
      status: 401,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('超时抛出 timeout 错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          })
      )
    );

    const client = baseClient({ timeoutMs: 50, maxRetries: 0 });
    try {
      await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
      expect.unreachable('应当抛出 TextCompletionError');
    } catch (error) {
      expect((error as TextCompletionError).kind).toBe('timeout');
      expect((error as TextCompletionError).retryable).toBe(true);
    }
  });

  it('空内容抛出 empty_response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('   ')));
    await expect(
      baseClient().complete({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toMatchObject({ kind: 'empty_response' });
  });

  it('上游错误消息被脱敏截断', async () => {
    const longDetail = 'x'.repeat(5000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: longDetail } }, 429)));
    const client = baseClient({ maxRetries: 0 });
    await expect(client.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });
});
