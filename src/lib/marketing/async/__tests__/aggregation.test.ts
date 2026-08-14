import { describe, expect, it } from 'vitest';
import { mergeItemResults } from '@/lib/marketing/async/aggregation';
import type { MarketingTask, MarketingTaskItem } from '@prisma/client';

function makeTask(module: string, overrides: Record<string, unknown> = {}): MarketingTask {
  return {
    id: 'task-1',
    userId: 'user-1',
    productName: '智能保温杯',
    productImages: [],
    category: null,
    platform: 'taobao',
    language: 'zh-CN',
    sellPoints: ['长效保温'],
    keywords: ['保温杯'],
    parameters: {},
    modelSnapshot: null,
    executionSteps: null,
    status: 'generating',
    error: null,
    module,
    input: null,
    result: null,
    selectedOutputs: [],
    isFavorite: false,
    schemaVersion: 1,
    cancelRequestedAt: null,
    analysis: null,
    copywriting: null,
    mainPrompts: null,
    detailPrompts: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeItem(kind: string, status: string, result: unknown = null, error: string | null = null): MarketingTaskItem {
  return {
    id: `item-${kind}`,
    taskId: 'task-1',
    userId: 'user-1',
    kind,
    role: kind === 'analysis' ? 'vision' : 'content',
    modelId: 'model-1',
    dependsOn: ['copywriting', 'mainPrompts', 'detailPrompts'].includes(kind) ? 'analysis' : null,
    status,
    attempts: 0,
    maxAttempts: 2,
    input: null,
    result: result as never,
    error,
    leaseOwner: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('mergeItemResults（Phase 6 结果聚合）', () => {
  it('文案：全部成功合并四类结果 + 事实', () => {
    const task = makeTask('copywriting', {
      input: {
        productName: '智能保温杯',
        sellPoints: ['长效保温'],
        keywords: ['保温杯'],
        parameters: { 容量: '500ml' },
      },
    });
    const items = [
      makeItem('analysis', 'completed', { productAnchor: '银色杯身' }),
      makeItem('copywriting', 'completed', { title: { main: '标题' } }),
      makeItem('mainPrompts', 'completed', { prompts: [] }),
      makeItem('detailPrompts', 'completed', { prompts: [] }),
    ];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    expect(result.analysis).toBeDefined();
    expect(result.copywriting).toBeDefined();
    expect(result.mainPrompts).toBeDefined();
    expect(result.detailPrompts).toBeDefined();
    const facts = result.facts as { key: string; value: string; status: string; sourceType: string }[];
    expect(facts.some((fact) => fact.key === 'productName' && fact.status === 'confirmed')).toBe(true);
    expect(facts.some((fact) => fact.key === 'parameter:容量' && fact.value === '500ml')).toBe(true);
  });

  it('文案：部分失败保留成功结果', () => {
    const task = makeTask('copywriting', {
      input: { productName: '智能保温杯', sellPoints: [], keywords: [], parameters: {} },
    });
    const items = [
      makeItem('analysis', 'completed', { productAnchor: 'x' }),
      makeItem('copywriting', 'failed', null, '文案失败'),
      makeItem('mainPrompts', 'completed', { prompts: [] }),
      makeItem('detailPrompts', 'completed', { prompts: [] }),
    ];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    expect(result.copywriting).toBeUndefined();
    expect(result.mainPrompts).toBeDefined();
    expect(result.detailPrompts).toBeDefined();
  });

  it('翻译：按语言合并 completed/failed', () => {
    const task = makeTask('translate', {
      input: { sourceText: '智能保温杯', sourceLanguage: 'zh-CN', targetLanguages: ['en-US', 'ja-JP'] },
    });
    const items = [
      makeItem('translate:en-US', 'completed', { translation: 'Smart thermos' }),
      makeItem('translate:ja-JP', 'failed', null, '上游失败'),
    ];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    const translations = result.translations as Record<string, { status: string; translation?: string }>;
    expect(translations['en-US']).toMatchObject({ status: 'completed', translation: 'Smart thermos' });
    expect(translations['ja-JP']).toMatchObject({ status: 'failed' });
  });

  it('SEO：取完成 item 的结果', () => {
    const task = makeTask('seo');
    const items = [makeItem('seo', 'completed', { pageTitle: { title: 't' }, bodyContent: 'b' })];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    expect(result).toMatchObject({ pageTitle: { title: 't' }, bodyContent: 'b' });
  });

  it('GEO：取完成 item 的结果', () => {
    const task = makeTask('geo');
    const items = [makeItem('geo', 'completed', { question: 'q', directAnswer: 'a' })];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    expect(result.directAnswer).toBe('a');
  });

  it('文案：分析失败时结果不含分析且下游未完成', () => {
    const task = makeTask('copywriting', {
      input: { productName: 'x', sellPoints: [], keywords: [], parameters: {} },
    });
    const items = [
      makeItem('analysis', 'failed', null, '分析失败'),
      makeItem('copywriting', 'cancelled'),
      makeItem('mainPrompts', 'cancelled'),
      makeItem('detailPrompts', 'cancelled'),
    ];
    const result = mergeItemResults(task, items) as Record<string, unknown>;
    expect(result.analysis).toBeUndefined();
    expect(result.copywriting).toBeUndefined();
  });
});
