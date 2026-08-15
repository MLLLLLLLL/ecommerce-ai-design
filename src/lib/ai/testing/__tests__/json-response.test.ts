import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeJSON, extractJSONObject, parseJSONCandidate } from '@/lib/ai/json-response';
import { TextCompletionError } from '@/lib/ai/text-completion-client';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';

describe('parseJSONCandidate', () => {
  it('解析纯 JSON 文本', () => {
    expect(parseJSONCandidate('{"a":1}')).toEqual({ a: 1 });
  });

  it('解析 Markdown 围栏内的 JSON', () => {
    expect(parseJSONCandidate('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('从解释文字中提取 JSON 对象', () => {
    expect(parseJSONCandidate('好的，结果如下：{"a":1} 以上。')).toEqual({ a: 1 });
  });

  it('修复尾逗号', () => {
    expect(parseJSONCandidate('{"a":1,}')).toEqual({ a: 1 });
  });

  it('解包 data/result/analysis 包装键', () => {
    expect(parseJSONCandidate('{"data":{"x":"y"}}')).toEqual({ x: 'y' });
    expect(parseJSONCandidate('{"result":{"x":"y"}}')).toEqual({ x: 'y' });
  });

  it('解析双重编码的 JSON 字符串', () => {
    expect(parseJSONCandidate('"{\\"a\\":1}"')).toEqual({ a: 1 });
  });

  it('无效内容返回 null', () => {
    expect(parseJSONCandidate('这不是JSON')).toBeNull();
  });
});

describe('extractJSONObject', () => {
  it('提取嵌套对象', () => {
    const text = '前缀 {"outer":{"inner":[1,2,{"deep":true}]}} 后缀';
    expect(extractJSONObject(text)).toBe('{"outer":{"inner":[1,2,{"deep":true}]}}');
  });

  it('处理字符串中的括号与转义引号', () => {
    const text = '{"text":"包含}和{与\\"引号\\""}';
    expect(extractJSONObject(text)).toBe('{"text":"包含}和{与\\"引号\\""}');
  });

  it('无 JSON 时返回 null', () => {
    expect(extractJSONObject('只有文字')).toBeNull();
  });
});

const testSchema = z.object({ name: z.string(), count: z.number() }).strict();

describe('completeJSON', () => {
  it('Schema 通过时返回解析后的对象', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"name":"杯","count":3}' });
    const result = await completeJSON(client, { messages: [] }, testSchema, { label: '测试' });
    expect(result).toEqual({ name: '杯', count: 3 });
  });

  it('JSON 无法解析时抛出 invalid_json', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'invalid-json' });
    await expect(completeJSON(client, { messages: [] }, testSchema)).rejects.toMatchObject({
      kind: 'invalid_json',
      retryable: false,
    });
  });

  it('Schema 不匹配时抛出 schema_mismatch（不可重试）', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"name":123,"extra":true}' });
    try {
      await completeJSON(client, { messages: [] }, testSchema, { label: '测试' });
      expect.unreachable('应当抛出 schema_mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(TextCompletionError);
      expect((error as TextCompletionError).kind).toBe('schema_mismatch');
      expect((error as TextCompletionError).retryable).toBe(false);
    }
  });

  it('repair 模式：首次无效 JSON，模型修复后成功', async () => {
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'invalid-json' },
      { kind: 'success', content: '{"name":"杯","count":1}' },
    ]);
    const result = await completeJSON(client, { messages: [] }, testSchema, {
      label: '测试',
      repair: true,
    });
    expect(result).toEqual({ name: '杯', count: 1 });
    expect(client.callCount).toBe(2);
  });

  it('repair 模式：Schema 不匹配时也修复一次', async () => {
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: '{"name":"杯"}' },
      { kind: 'success', content: '{"name":"杯","count":1}' },
    ]);
    const result = await completeJSON(client, { messages: [] }, testSchema, {
      label: '测试',
      repair: true,
    });
    expect(result).toEqual({ name: '杯', count: 1 });
    expect(client.callCount).toBe(2);
    expect(client.lastRequest?.messages[1]?.content).toContain('当前结构问题');
  });

  it('repair 失败后仍抛出 invalid_json', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'invalid-json' });
    await expect(
      completeJSON(client, { messages: [] }, testSchema, { repair: true })
    ).rejects.toMatchObject({ kind: 'invalid_json' });
  });
});
