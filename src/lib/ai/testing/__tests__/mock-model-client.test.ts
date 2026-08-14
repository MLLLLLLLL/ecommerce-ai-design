import { describe, expect, it } from 'vitest';
import { TextCompletionError, classifyHttpStatus } from '@/lib/ai/text-completion-client';
import {
  DEFAULT_MOCK_JSON_CONTENT,
  MockTextCompletionClient,
} from '@/lib/ai/testing/mock-model-client';

function request() {
  return {
    messages: [{ role: 'system' as const, content: 'test' }],
  };
}

describe('MockTextCompletionClient（五类模型调用 Mock）', () => {
  it('success：返回可配置的 JSON 内容', async () => {
    const client = new MockTextCompletionClient();
    const content = await client.complete(request());
    expect(content).toBe(DEFAULT_MOCK_JSON_CONTENT);
    expect(client.callCount).toBe(1);
  });

  it('success：支持自定义内容', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"a":1}' });
    expect(await client.complete(request())).toBe('{"a":1}');
  });

  it('invalid-json：返回无法解析的文本（上层解析时报 invalid_json）', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'invalid-json' });
    const content = await client.complete(request());
    expect(() => JSON.parse(content)).toThrow();
  });

  it('timeout：抛出 kind=timeout 且可重试', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'timeout' });
    await expect(client.complete(request())).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('rate-limited：抛出 kind=rate_limited、status=429 且可重试', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'rate-limited' });
    await expect(client.complete(request())).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
      retryable: true,
    });
  });

  it('server-error：抛出 kind=server_error、可配置 status 且可重试', async () => {
    const client = new MockTextCompletionClient().setScenario({
      kind: 'server-error',
      status: 502,
    });
    await expect(client.complete(request())).rejects.toMatchObject({
      kind: 'server_error',
      status: 502,
      retryable: true,
    });
  });

  it('network-error：抛出 kind=network 且可重试', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'network-error' });
    await expect(client.complete(request())).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
    });
  });

  it('场景队列按调用顺序出队，耗尽后回落默认场景', async () => {
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: '{"call":1}' },
      { kind: 'rate-limited' },
    ]);
    expect(await client.complete(request())).toBe('{"call":1}');
    await expect(client.complete(request())).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(await client.complete(request())).toBe(DEFAULT_MOCK_JSON_CONTENT);
    expect(client.callCount).toBe(3);
  });
});

describe('classifyHttpStatus（可重试错误分类，V3 5.3）', () => {
  it('429 可重试', () => {
    expect(classifyHttpStatus(429)).toEqual({ kind: 'rate_limited', retryable: true });
  });

  it('5xx 可重试', () => {
    expect(classifyHttpStatus(500).retryable).toBe(true);
    expect(classifyHttpStatus(503).kind).toBe('server_error');
  });

  it('4xx（除 429）不可重试', () => {
    expect(classifyHttpStatus(400).retryable).toBe(false);
    expect(classifyHttpStatus(404).kind).toBe('invalid_request');
  });

  it('408 按超时可重试', () => {
    expect(classifyHttpStatus(408)).toEqual({ kind: 'timeout', retryable: true });
  });
});
