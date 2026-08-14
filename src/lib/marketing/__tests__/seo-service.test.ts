import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  modelFindFirst: vi.fn(),
  prismaCreate: vi.fn(),
  prismaUpdate: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    modelConfig: { findFirst: mocks.modelFindFirst },
    marketingTask: {
      create: mocks.prismaCreate,
      update: mocks.prismaUpdate,
    },
  },
}));

vi.mock('@/lib/marketing/seo-engine', () => ({
  SeoEngine: class {
    generate(params: unknown) {
      return mocks.generate(params);
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
import { generateSeoTask } from '@/lib/marketing/seo-service';
import type { SeoTaskCreateRequest } from '@/types/marketing-contract';

function makeRequest(): SeoTaskCreateRequest {
  return {
    module: 'seo',
    schemaVersion: 1,
    input: {
      productName: '智能保温杯',
      keywords: ['保温杯', '不锈钢水杯'],
      language: 'zh-CN',
      facts: [
        { key: '材质', value: '316 不锈钢', status: 'confirmed', sourceType: 'user' },
      ],
      modelId: '44444444-4444-4444-8444-444444444444',
    },
  };
}

function makeModelConfig() {
  const now = new Date();
  return {
    id: '44444444-4444-4444-8444-444444444444',
    name: '内容模型',
    provider: 'openai',
    baseURL: 'https://example.com/v1',
    model: 'test-model',
    apiKeyEncrypted: 'enc',
    capabilities: { vision: false, jsonMode: true, ocr: false, imageGeneration: false },
    isActive: true,
    isDefault: false,
    lastTestedAt: now,
    updatedAt: new Date(now.getTime() - 1000),
    testStatus: 'passed',
    testedCapabilities: { connection: true, jsonMode: true, vision: false },
    testError: null,
    createdAt: now,
  };
}

const SEO_RESULT = {
  keywordIntent: [{ keyword: '保温杯', intent: 'commercial', explanation: 'x' }],
  pageTitle: { title: '保温杯推荐', metaDescription: 'x', slug: '/x' },
  headingStructure: { h1: 'x', h2: ['x'] },
  bodyContent: '安全正文',
  faq: [],
  imageAlt: [],
  internalLinks: [],
  jsonLd: { '@type': 'Product' },
  pendingFacts: [],
};

describe('generateSeoTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue(SEO_RESULT);
    mocks.modelFindFirst.mockResolvedValue(makeModelConfig());
    mocks.prismaCreate.mockResolvedValue({ id: 'task-1' });
    mocks.prismaUpdate.mockResolvedValue({ id: 'task-1' });
  });

  it('成功生成 -> completed，结果与步骤写回', async () => {
    const outcome = await generateSeoTask('user-1', makeRequest());
    expect(outcome.status).toBe('completed');
    expect(outcome.result.jsonLd).toMatchObject({ '@type': 'Product' });
    expect(outcome.steps.seo?.status).toBe('completed');

    const createArgs = mocks.prismaCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createArgs.data.module).toBe('seo');
    expect(createArgs.data.keywords).toEqual(['保温杯', '不锈钢水杯']);

    const updateArgs = mocks.prismaUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateArgs.data.status).toBe('completed');
    expect(updateArgs.data.result).toBeDefined();
  });

  it('引擎失败 -> failed 且错误映射', async () => {
    mocks.generate.mockRejectedValue(
      new TextCompletionError('SEO 结果包含未经证实的声明，已拦截：销量第一', 'schema_mismatch', {
        retryable: false,
      })
    );
    await expect(generateSeoTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'OUTPUT_INVALID',
      httpStatus: 502,
    });
    const updateArgs = mocks.prismaUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateArgs.data.status).toBe('failed');
  });

  it('模型未实测 -> MODEL_TEST_REQUIRED', async () => {
    mocks.modelFindFirst.mockResolvedValue({ ...makeModelConfig(), testStatus: null, lastTestedAt: null });
    await expect(generateSeoTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_TEST_REQUIRED',
    });
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });
});
