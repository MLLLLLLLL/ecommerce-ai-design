import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  generate: vi.fn(),
  main: vi.fn(),
  detail: vi.fn(),
  modelFindFirst: vi.fn(),
  prismaCreate: vi.fn(),
  prismaUpdate: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    modelConfig: { findFirst: mocks.modelFindFirst },
    marketingTask: {
      create: mocks.prismaCreate,
      update: mocks.prismaUpdate,
      findFirst: mocks.taskFindFirst,
      findMany: mocks.taskFindMany,
    },
  },
}));

vi.mock('@/lib/marketing', () => ({
  ProductAnalyzer: class {
    analyze(params: unknown) {
      return mocks.analyze(params);
    }
  },
  CopywritingEngine: class {
    generate(...args: unknown[]) {
      return mocks.generate(...args);
    }
  },
  PromptEngine: class {
    generateMainImagePrompts(...args: unknown[]) {
      return mocks.main(...args);
    }
    generateDetailPagePrompts(...args: unknown[]) {
      return mocks.detail(...args);
    }
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

import { TextCompletionError } from '@/lib/ai/text-completion-client';
import {
  generateMarketingTask,
  mapUpstreamError,
  MarketingServiceError,
} from '@/lib/marketing/task-service';
import type { MarketingTaskCreateRequest } from '@/types/marketing-contract';

function makeRequest(): MarketingTaskCreateRequest {
  return {
    module: 'copywriting',
    schemaVersion: 1,
    input: {
      productName: '智能保温杯',
      productImages: ['/api/files/user-data/marketing/a.png'],
      category: '百货杯壶',
      platform: 'taobao',
      language: 'zh-CN',
      sellPoints: ['长效保温'],
      keywords: ['保温杯'],
      outputs: {
        analysis: true,
        copywriting: true,
        mainPrompts: true,
        detailPrompts: true,
      },
      modelSelection: {
        visionModelId: '11111111-1111-4111-8111-111111111111',
        contentModelId: '22222222-2222-4222-8222-222222222222',
      },
    },
  };
}

function makeModelConfig(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: '测试模型',
    provider: 'openai',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
    apiKeyEncrypted: 'enc',
    capabilities: { vision: true, jsonMode: true, ocr: true, imageGeneration: false },
    isActive: true,
    isDefault: false,
    lastTestedAt: now,
    updatedAt: new Date(now.getTime() - 1000),
    testStatus: 'passed',
    testedCapabilities: { connection: true, jsonMode: true, vision: true },
    testError: null,
    createdAt: now,
    ...overrides,
  };
}

function makeTask(id: string) {
  return {
    id,
    userId: 'user-1',
    productName: '智能保温杯',
    productImages: ['/api/files/user-data/marketing/a.png'],
    category: '百货杯壶',
    platform: 'taobao',
    language: 'zh-CN',
    sellPoints: [],
    keywords: [],
    parameters: {},
    modelSnapshot: null,
    executionSteps: null,
    status: 'analyzing',
    error: null,
    module: 'copywriting',
    input: null,
    result: null,
    selectedOutputs: [],
    isFavorite: false,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const ANALYSIS_RESULT = {
  productName: '智能保温杯',
  category: '百货杯壶',
  productAnchor: '银色不锈钢保温杯',
  confirmed: { appearance: '银色不锈钢杯身' },
  inferred: { sellPoints: ['保温'] },
  placeholders: { parameters: ['【容量】'], certifications: [], features: [] },
  risks: [],
  recommendedSOP: 'SOP-1',
  compliance: { forbiddenClaims: [] },
};

const COPYWRITING_RESULT = { corePoints: [], title: { main: '标题' }, description: { short: '短' }, seo: { primary: [] } };
const MAIN_RESULT = { productAnchor: 'x', plan: [], prompts: [], platformConstraints: [] };
const DETAIL_RESULT = { productAnchor: 'x', plan: [], prompts: [], categoryRules: [] };

describe('generateMarketingTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyze.mockResolvedValue(ANALYSIS_RESULT);
    mocks.generate.mockResolvedValue(COPYWRITING_RESULT);
    mocks.main.mockResolvedValue(MAIN_RESULT);
    mocks.detail.mockResolvedValue(DETAIL_RESULT);
    mocks.modelFindFirst.mockImplementation(() =>
      Promise.resolve(makeModelConfig())
    );
    mocks.prismaCreate.mockImplementation(({ data }: { data: { id?: string } }) =>
      Promise.resolve(makeTask(data.id ?? 'task-1'))
    );
    mocks.prismaUpdate.mockResolvedValue(makeTask('task-1'));
  });

  it('正常链路：全部成功 -> completed，结果完整', async () => {
    const outcome = await generateMarketingTask('user-1', makeRequest());
    expect(outcome.status).toBe('completed');
    expect(outcome.result.analysis).toBeDefined();
    expect(outcome.result.copywriting).toBeDefined();
    expect(outcome.result.mainPrompts).toBeDefined();
    expect(outcome.result.detailPrompts).toBeDefined();
    expect(outcome.steps.analysis?.status).toBe('completed');

    const finalUpdate = mocks.prismaUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(finalUpdate.data.status).toBe('completed');
    expect(finalUpdate.data.result).toBeDefined();
  });

  it('一个下游失败：partial_failed，成功结果保留', async () => {
    mocks.generate.mockRejectedValue(new Error('文案上游失败'));
    const outcome = await generateMarketingTask('user-1', makeRequest());
    expect(outcome.status).toBe('partial_failed');
    expect(outcome.steps.copywriting?.status).toBe('failed');
    expect(outcome.steps.mainPrompts?.status).toBe('completed');
    expect(outcome.result.copywriting).toBeUndefined();
    expect(outcome.result.mainPrompts).toBeDefined();
    expect(outcome.result.detailPrompts).toBeDefined();
    expect(outcome.error).toContain('copywriting');
  });

  it('分析失败：failed 且映射上游错误码', async () => {
    mocks.analyze.mockRejectedValue(
      new TextCompletionError('上游限流', 'rate_limited', { status: 429, retryable: true })
    );
    await expect(generateMarketingTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'UPSTREAM_RATE_LIMITED',
      httpStatus: 429,
    });
  });

  it('视觉模型未实测：MODEL_TEST_REQUIRED', async () => {
    mocks.modelFindFirst.mockImplementation(() =>
      Promise.resolve(makeModelConfig({ testStatus: null, lastTestedAt: null }))
    );
    await expect(generateMarketingTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_TEST_REQUIRED',
    });
  });

  it('模型不存在：MODEL_NOT_FOUND', async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    await expect(generateMarketingTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    });
  });

  it('视觉能力不足：MODEL_CAPABILITY_MISSING', async () => {
    mocks.modelFindFirst.mockImplementation(() =>
      Promise.resolve(makeModelConfig({ capabilities: { vision: false, jsonMode: true, ocr: false, imageGeneration: false } }))
    );
    await expect(generateMarketingTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_CAPABILITY_MISSING',
    });
  });

  it('未选择任何输出：VALIDATION_ERROR', async () => {
    const request = makeRequest();
    request.input.outputs = { analysis: false, copywriting: false, mainPrompts: false, detailPrompts: false };
    await expect(generateMarketingTask('user-1', request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('仅选择文案：analysis 内部依赖仍执行', async () => {
    const request = makeRequest();
    request.input.outputs = { analysis: false, copywriting: true, mainPrompts: false, detailPrompts: false };
    const outcome = await generateMarketingTask('user-1', request);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('completed');
    expect(outcome.steps.mainPrompts?.status).toBe('skipped');
  });

  it('JSON Schema 不匹配映射为 OUTPUT_INVALID', async () => {
    mocks.analyze.mockRejectedValue(
      new TextCompletionError('结构不符合预期', 'schema_mismatch', { retryable: false })
    );
    await expect(generateMarketingTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'OUTPUT_INVALID',
      httpStatus: 502,
    });
  });
});

describe('mapUpstreamError', () => {
  it('MarketingServiceError 原样返回', () => {
    const original = new MarketingServiceError('MODEL_NOT_FOUND', 'x');
    expect(mapUpstreamError(original)).toBe(original);
  });

  it('普通错误映射 UPSTREAM_FAILED', () => {
    const mapped = mapUpstreamError(new Error('boom'));
    expect(mapped.code).toBe('UPSTREAM_FAILED');
    expect(mapped.httpStatus).toBe(502);
  });
});
