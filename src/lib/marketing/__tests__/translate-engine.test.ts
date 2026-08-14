import { describe, expect, it } from 'vitest';
import { TranslateEngine, assertValidTranslateInput } from '@/lib/marketing/translate-engine';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';

describe('TranslateEngine', () => {
  it('成功返回翻译文本', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"translation":"保温水杯"}' });
    const engine = new TranslateEngine(client);
    const result = await engine.translate({
      sourceText: '智能保温杯',
      sourceLanguage: 'zh-CN',
      targetLanguage: 'en-US',
    });
    expect(result).toBe('保温水杯');
  });

  it('prompt 包含结构保留指令', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"translation":"OK"}' });
    const engine = new TranslateEngine(client);
    await engine.translate({
      sourceText: '第一行\n- 列表项',
      sourceLanguage: 'auto',
      targetLanguage: 'ja-JP',
    });
    const request = client.lastRequest;
    expect(request).toBeDefined();
    const system = request!.messages.find((message) => message.role === 'system');
    const text = typeof system?.content === 'string' ? system.content : '';
    expect(text).toContain('换行位置');
    expect(text).toContain('列表符号');
    expect(text).toContain('日语');
    expect(request!.messages.find((message) => message.role === 'user')?.content).toBe('第一行\n- 列表项');
  });

  it('翻译结果 Schema 不匹配时抛出 schema_mismatch', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"wrong":"field"}' });
    const engine = new TranslateEngine(client);
    await expect(
      engine.translate({ sourceText: 'x', sourceLanguage: 'auto', targetLanguage: 'en-US' })
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });
  });

  it('上游限流错误透传', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'rate-limited' });
    const engine = new TranslateEngine(client);
    await expect(
      engine.translate({ sourceText: 'x', sourceLanguage: 'auto', targetLanguage: 'en-US' })
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});

describe('assertValidTranslateInput', () => {
  it('合法输入通过', () => {
    const result = assertValidTranslateInput({
      sourceText: '你好',
      sourceLanguage: 'zh-CN',
      targetLanguages: ['en-US', 'ja-JP'],
    });
    expect(result.valid).toBe(true);
  });

  it('auto 源语言通过', () => {
    expect(
      assertValidTranslateInput({ sourceText: 'x', sourceLanguage: 'auto', targetLanguages: ['en-US'] }).valid
    ).toBe(true);
  });

  it('非法源语言拒绝', () => {
    const result = assertValidTranslateInput({
      sourceText: 'x',
      sourceLanguage: 'klingon',
      targetLanguages: ['en-US'],
    });
    expect(result.valid).toBe(false);
  });

  it('非法目标语言拒绝', () => {
    const result = assertValidTranslateInput({
      sourceText: 'x',
      sourceLanguage: 'auto',
      targetLanguages: ['en-US', 'not-a-lang'],
    });
    expect(result.valid).toBe(false);
  });

  it('重复目标语言拒绝', () => {
    const result = assertValidTranslateInput({
      sourceText: 'x',
      sourceLanguage: 'auto',
      targetLanguages: ['en-US', 'en-US'],
    });
    expect(result.valid).toBe(false);
  });
});
