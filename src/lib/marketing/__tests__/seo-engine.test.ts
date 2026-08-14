import { describe, expect, it } from 'vitest';
import { SeoEngine, findFactViolations } from '@/lib/marketing/seo-engine';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';
import type { SeoResult } from '@/types/marketing-contract';

function makeSeoResult(overrides: Partial<SeoResult> = {}): SeoResult {
  return {
    keywordIntent: [{ keyword: '保温杯', intent: 'commercial', explanation: '购买意图明显' }],
    pageTitle: {
      title: '保温杯推荐 - 长效保温不锈钢水杯',
      metaDescription: '精选保温杯推荐，长效保温。',
      slug: '/baowenbei',
    },
    headingStructure: { h1: '保温杯选购指南', h2: ['保温原理', '材质对比'] },
    bodyContent: '这是一段安全的正文内容。',
    faq: [{ question: '保温杯能保温多久？', answer: '视杯体材质与容量而定。' }],
    imageAlt: [{ image: '主图', alt: '银色不锈钢保温杯' }],
    internalLinks: [{ anchorText: '保温杯', target: '/category/cups', reason: '品类页' }],
    jsonLd: { '@context': 'https://schema.org', '@type': 'Product', name: '保温杯' },
    pendingFacts: [],
    ...overrides,
  };
}

describe('SeoEngine', () => {
  it('成功生成并归一化 pendingFacts', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({
      kind: 'success',
      content: JSON.stringify(
        makeSeoResult({
          pendingFacts: [
            { key: '销量', value: '全网销量第一', status: 'pending', sourceType: 'model' },
          ],
        })
      ),
    });
    const engine = new SeoEngine(client);
    const result = await engine.generate({
      productName: '智能保温杯',
      keywords: ['保温杯'],
      language: 'zh-CN',
    });
    expect(result.pageTitle.title).toContain('保温杯');
    expect(result.pendingFacts[0]).toMatchObject({
      status: 'pending',
      sourceType: 'model',
    });
    expect(result.jsonLd).toMatchObject({ '@type': 'Product' });
  });

  it('事实违规时修复一次后成功', async () => {
    const violating = makeSeoResult({
      bodyContent: '这款产品全网销量第一，值得购买。',
      pendingFacts: [{ key: '销量', value: '全网销量第一', status: 'pending', sourceType: 'model' }],
    });
    const repaired = makeSeoResult({
      bodyContent: '这款产品设计出色，值得购买。',
      pendingFacts: [{ key: '销量', value: '全网销量第一', status: 'pending', sourceType: 'model' }],
    });
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: JSON.stringify(violating) },
      { kind: 'success', content: JSON.stringify(repaired) },
    ]);
    const engine = new SeoEngine(client);
    const result = await engine.generate({
      productName: '智能保温杯',
      keywords: ['保温杯'],
      language: 'zh-CN',
    });
    expect(client.callCount).toBe(2);
    expect(result.bodyContent).not.toContain('销量第一');
  });

  it('修复后仍违规：抛出 schema_mismatch 并拦截', async () => {
    const violating = makeSeoResult({
      bodyContent: '这款产品全网销量第一。',
      pendingFacts: [{ key: '销量', value: '全网销量第一', status: 'pending', sourceType: 'model' }],
    });
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(violating) });
    const engine = new SeoEngine(client);
    try {
      await engine.generate({ productName: 'x', keywords: ['x'], language: 'zh-CN' });
      expect.unreachable('应当抛出 schema_mismatch');
    } catch (error) {
      expect(error).toMatchObject({ kind: 'schema_mismatch', retryable: false });
    }
    expect(client.callCount).toBe(2);
  });

  it('prompt 包含铁律与语言要求', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeSeoResult()) });
    const engine = new SeoEngine(client);
    await engine.generate({ productName: '杯子', keywords: ['水杯'], language: 'ja-JP' });
    const system = client.lastRequest?.messages.find((message) => message.role === 'system');
    const text = typeof system?.content === 'string' ? system.content : '';
    expect(text).toContain('不得写入');
    expect(text).toContain('pendingFacts');
    const user = client.lastRequest?.messages.find((message) => message.role === 'user');
    const userText = typeof user?.content === 'string' ? user.content : '';
    expect(userText).toContain('日语');
  });
});

describe('findFactViolations', () => {
  it('正文包含未证实事实时返回违规位置', () => {
    const result = makeSeoResult({
      bodyContent: '全网销量第一的保温杯。',
      pendingFacts: [{ key: '销量', value: '全网销量第一', status: 'pending', sourceType: 'model' }],
    });
    const violations = findFactViolations(result);
    expect(violations.length).toBe(1);
    expect(violations[0].location).toBe('bodyContent');
  });

  it('标题包含未证实事实时同样拦截', () => {
    const result = makeSeoResult({
      pageTitle: { ...makeSeoResult().pageTitle, title: '销量冠军保温杯' },
      pendingFacts: [{ key: '销量', value: '销量冠军', status: 'pending', sourceType: 'model' }],
    });
    const violations = findFactViolations(result);
    expect(violations.some((violation) => violation.location === 'pageTitle.title')).toBe(true);
  });

  it('无违规时返回空数组', () => {
    expect(findFactViolations(makeSeoResult())).toEqual([]);
  });
});
