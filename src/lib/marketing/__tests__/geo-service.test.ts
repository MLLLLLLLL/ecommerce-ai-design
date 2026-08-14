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

vi.mock('@/lib/marketing/geo-engine', () => ({
  GeoEngine: class {
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

import { generateGeoTask } from '@/lib/marketing/geo-service';
import type { GeoTaskCreateRequest } from '@/types/marketing-contract';

function makeRequest(): GeoTaskCreateRequest {
  return {
    module: 'geo',
    schemaVersion: 1,
    input: {
      question: '什么保温杯保温效果好？',
      brandName: 'XX 保温杯',
      language: 'zh-CN',
      facts: [{ key: 'material', value: '316 不锈钢', status: 'confirmed', sourceType: 'user' }],
      modelId: '55555555-5555-4555-8555-555555555555',
    },
  };
}

function makeModelConfig() {
  const now = new Date();
  return {
    id: '55555555-5555-4555-8555-555555555555',
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

const GEO_RESULT = {
  question: '什么保温杯保温效果好？',
  directAnswer: '316 不锈钢保温杯保温效果较好。',
  supportingContent: '真空层减少热传导。',
  faq: [],
  claims: [{ text: '采用 316 不锈钢', factKey: 'material' }],
  pendingFacts: [],
};

describe('generateGeoTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue(GEO_RESULT);
    mocks.modelFindFirst.mockResolvedValue(makeModelConfig());
    mocks.prismaCreate.mockResolvedValue({ id: 'task-1' });
    mocks.prismaUpdate.mockResolvedValue({ id: 'task-1' });
  });

  it('成功生成 -> completed，任务字段正确', async () => {
    const outcome = await generateGeoTask('user-1', makeRequest());
    expect(outcome.status).toBe('completed');
    expect(outcome.result.directAnswer).toContain('316 不锈钢');
    expect(outcome.steps.geo?.status).toBe('completed');

    const createArgs = mocks.prismaCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createArgs.data.module).toBe('geo');
    expect(createArgs.data.productName).toBe('XX 保温杯');

    const updateArgs = mocks.prismaUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateArgs.data.status).toBe('completed');
    expect(updateArgs.data.result).toBeDefined();
  });

  it('引擎失败 -> failed 且错误映射', async () => {
    mocks.generate.mockRejectedValue(new Error('GEO 结果违反离线铁律，已拦截：x'));
    await expect(generateGeoTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'UPSTREAM_FAILED',
    });
    const updateArgs = mocks.prismaUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateArgs.data.status).toBe('failed');
  });

  it('模型未实测 -> MODEL_TEST_REQUIRED', async () => {
    mocks.modelFindFirst.mockResolvedValue({ ...makeModelConfig(), testStatus: null, lastTestedAt: null });
    await expect(generateGeoTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_TEST_REQUIRED',
    });
    expect(mocks.prismaCreate).not.toHaveBeenCalled();
  });
});
