import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  modelFindFirst: vi.fn(),
  prismaCreate: vi.fn(),
  itemsCreateMany: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    modelConfig: { findFirst: mocks.modelFindFirst },
    marketingTask: {
      create: mocks.prismaCreate,
    },
    marketingTaskItem: {
      createMany: mocks.itemsCreateMany,
    },
    marketingTaskEvent: {
      create: mocks.eventCreate,
    },
  },
}));

vi.mock('@/lib/model-configs', () => ({
  toCapabilities: (v: Record<string, unknown>) => ({
    vision: v.vision === true,
    jsonMode: v.jsonMode === true,
    ocr: v.ocr === true,
    imageGeneration: v.imageGeneration === true,
  }),
  toTestedCapabilities: (v: Record<string, unknown> | null) => v,
  toRuntimeAIConfig: () => ({
    id: 'rt',
    name: 'rt',
    provider: 'openai' as const,
    baseURL: 'https://example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
  }),
}));

import { createMarketingTaskAsync } from '@/lib/marketing/async/task-creation';

function makeModelConfig(id: string, vision = false) {
  const now = new Date();
  return {
    id,
    name: '模型',
    provider: 'openai',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
    apiKeyEncrypted: 'enc',
    capabilities: { vision, jsonMode: true, ocr: vision, imageGeneration: false },
    isActive: true,
    isDefault: false,
    lastTestedAt: now,
    updatedAt: new Date(now.getTime() - 1000),
    testStatus: 'passed',
    testedCapabilities: { connection: true, jsonMode: true, vision },
    testError: null,
    createdAt: now,
  };
}

describe('createMarketingTaskAsync（Phase 6 任务与子项创建）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modelFindFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(makeModelConfig(where.id, where.id.includes('11111111')))
    );
    mocks.prismaCreate.mockResolvedValue({ id: 'task-1', status: 'analyzing' });
    mocks.itemsCreateMany.mockResolvedValue({ count: 3 });
    mocks.eventCreate.mockResolvedValue({ id: 'evt-1' });
  });

  it('文案任务拆分为 4 个子项，下游依赖 analysis', async () => {
    const { taskId } = await createMarketingTaskAsync('user-1', {
      module: 'copywriting',
      schemaVersion: 1,
      input: {
        productName: '智能保温杯',
        productImages: ['/api/files/user-data/marketing/a.png'],
        platform: 'taobao',
        language: 'zh-CN',
        outputs: { analysis: true, copywriting: true, mainPrompts: true, detailPrompts: true },
        modelSelection: {
          visionModelId: '11111111-1111-4111-8111-111111111111',
          contentModelId: '22222222-2222-4222-8222-222222222222',
        },
      },
    });
    expect(taskId).toBe('task-1');
    const items = mocks.itemsCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> };
    expect(items.data).toHaveLength(4);
    const kinds = items.data.map((item) => item.kind);
    expect(kinds).toEqual(['analysis', 'copywriting', 'mainPrompts', 'detailPrompts']);
    const copywritingItem = items.data.find((item) => item.kind === 'copywriting');
    expect(copywritingItem?.dependsOn).toBe('analysis');
    const analysisItem = items.data.find((item) => item.kind === 'analysis');
    expect(analysisItem?.dependsOn).toBeNull();
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
  });

  it('仅选择文案输出：只有 analysis + copywriting 两个子项', async () => {
    await createMarketingTaskAsync('user-1', {
      module: 'copywriting',
      schemaVersion: 1,
      input: {
        productName: '智能保温杯',
        productImages: ['/api/files/user-data/marketing/a.png'],
        platform: 'taobao',
        language: 'zh-CN',
        outputs: { analysis: false, copywriting: true, mainPrompts: false, detailPrompts: false },
        modelSelection: {
          visionModelId: '11111111-1111-4111-8111-111111111111',
          contentModelId: '22222222-2222-4222-8222-222222222222',
        },
      },
    });
    const items = mocks.itemsCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> };
    expect(items.data.map((item) => item.kind)).toEqual(['analysis', 'copywriting']);
  });

  it('翻译任务每种语言一个子项', async () => {
    await createMarketingTaskAsync('user-1', {
      module: 'translate',
      schemaVersion: 1,
      input: {
        sourceText: '智能保温杯',
        sourceLanguage: 'zh-CN',
        targetLanguages: ['en-US', 'ja-JP', 'ko-KR'],
        modelId: '33333333-3333-4333-8333-333333333333',
      },
    });
    const items = mocks.itemsCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> };
    expect(items.data.map((item) => item.kind)).toEqual([
      'translate:en-US',
      'translate:ja-JP',
      'translate:ko-KR',
    ]);
  });

  it('SEO/GEO 各一个子项', async () => {
    await createMarketingTaskAsync('user-1', {
      module: 'seo',
      schemaVersion: 1,
      input: {
        productName: '智能保温杯',
        keywords: ['保温杯'],
        language: 'zh-CN',
        modelId: '44444444-4444-4444-8444-444444444444',
      },
    });
    let items = mocks.itemsCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> };
    expect(items.data.map((item) => item.kind)).toEqual(['seo']);

    await createMarketingTaskAsync('user-1', {
      module: 'geo',
      schemaVersion: 1,
      input: {
        question: '什么保温杯好？',
        brandName: 'XX 保温杯',
        language: 'zh-CN',
        modelId: '44444444-4444-4444-8444-444444444444',
      },
    });
    items = mocks.itemsCreateMany.mock.calls[1]![0] as { data: Array<Record<string, unknown>> };
    expect(items.data.map((item) => item.kind)).toEqual(['geo']);
  });

  it('未实测模型在创建前被拦截', async () => {
    mocks.modelFindFirst.mockResolvedValue({ ...makeModelConfig('x-id'), testStatus: null, lastTestedAt: null });
    await expect(
      createMarketingTaskAsync('user-1', {
        module: 'seo',
        schemaVersion: 1,
        input: {
          productName: 'x',
          keywords: ['k'],
          language: 'zh-CN',
          modelId: '44444444-4444-4444-8444-444444444444',
        },
      })
    ).rejects.toMatchObject({ code: 'MODEL_TEST_REQUIRED' });
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });
});
