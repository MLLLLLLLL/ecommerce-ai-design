import { describe, expect, it } from 'vitest';
import { InsightEngine } from '@/lib/search/insight-engine';
import { MockSearchAdapter } from '@/lib/search/SearchAdapter';
import { QueryBudget } from '@/lib/search/SearchAdapter';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';
import type { InsightResult } from '@/types/marketing-contract';

function makeInsightReport(overrides: Partial<InsightResult> = {}): InsightResult {
  return {
    type: 'competitor',
    productName: '智能保温杯',
    summary: '竞品分析摘要。',
    sections: [{ title: '竞品格局', content: '主要竞品包括 A 与 B [1]。' }],
    keyFindings: ['竞品 A 主打保温时长'],
    recommendations: ['强化差异化卖点'],
    sources: [],
    degraded: false,
    retrievedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InsightEngine（Phase 7 市场洞察）', () => {
  it('搜索成功后生成报告并附带来源', async () => {
    const searcher = new MockSearchAdapter();
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeInsightReport()) });

    const engine = new InsightEngine(client, searcher, new QueryBudget(12));
    const generation = await engine.generate({
      type: 'competitor',
      productName: '智能保温杯',
      language: 'zh-CN',
    });

    expect(generation.queriesUsed).toBeGreaterThanOrEqual(1);
    expect(generation.report.type).toBe('competitor');
    expect(generation.report.sources.length).toBeGreaterThan(0);
    expect(generation.report.sources[0].url).toContain('example.com');
    expect(generation.report.degraded).toBe(false);
  });

  it('查询配额耗尽时降级但仍生成报告', async () => {
    const searcher = new MockSearchAdapter();
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeInsightReport()) });

    const engine = new InsightEngine(client, searcher, new QueryBudget(0));
    const generation = await engine.generate({
      type: 'trends',
      productName: '智能保温杯',
      language: 'zh-CN',
    });

    expect(generation.queriesUsed).toBe(0);
    expect(generation.report.degraded).toBe(true);
    expect(generation.degraded).toBe(true);
  });

  it('搜索全部失败时降级', async () => {
    const searcher = new MockSearchAdapter((query) => ({
      query,
      sources: [],
      retrievedAt: new Date().toISOString(),
      degraded: true,
      error: '搜索服务不可用',
    }));
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeInsightReport()) });

    const engine = new InsightEngine(client, searcher, new QueryBudget(12));
    const generation = await engine.generate({
      type: 'needs',
      productName: '智能保温杯',
      language: 'zh-CN',
    });
    expect(generation.degraded).toBe(true);
    expect(generation.report.sources).toHaveLength(0);
  });

  it('四种洞察类型各自构建查询集', async () => {
    const queriesSeen: string[] = [];
    const searcher = new MockSearchAdapter((query) => {
      queriesSeen.push(query);
      return {
        query,
        sources: [],
        retrievedAt: new Date().toISOString(),
        degraded: false,
      };
    });
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeInsightReport()) });

    const engine = new InsightEngine(client, searcher, new QueryBudget(12));
    await engine.generate({ type: 'pricing', productName: '智能保温杯', language: 'zh-CN' });
    expect(queriesSeen.some((query) => query.includes('价格'))).toBe(true);

    queriesSeen.length = 0;
    await engine.generate({ type: 'competitor', productName: '智能保温杯', language: 'zh-CN' });
    expect(queriesSeen.some((query) => query.includes('竞品'))).toBe(true);
  });

  it('模型输出 schema 不匹配时抛出 schema_mismatch', async () => {
    const searcher = new MockSearchAdapter();
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"wrong": true}' });

    const engine = new InsightEngine(client, searcher, new QueryBudget(12));
    await expect(
      engine.generate({ type: 'competitor', productName: 'x', language: 'zh-CN' })
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });
  });
});

describe('InsightEngine 铁律', () => {
  it('prompt 要求外部结论标注来源编号', async () => {
    const searcher = new MockSearchAdapter();
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeInsightReport()) });

    const engine = new InsightEngine(client, searcher, new QueryBudget(12));
    await engine.generate({ type: 'competitor', productName: 'x', language: 'zh-CN' });
    const system = client.lastRequest?.messages.find((message) => message.role === 'system');
    const text = typeof system?.content === 'string' ? system.content : '';
    expect(text).toContain('来源编号');
    expect(text).toContain('不得编造');
  });
});
