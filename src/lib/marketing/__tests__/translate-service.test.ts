import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  translate: vi.fn(),
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

vi.mock('@/lib/marketing/translate-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketing/translate-engine')>();
  return {
    ...actual,
    TranslateEngine: class {
      translate(params: { targetLanguage: string }) {
        return mocks.translate(params.targetLanguage);
      }
    },
  };
});

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

import { generateTranslateTask } from '@/lib/marketing/translate-service';
import type { TranslateTaskCreateRequest } from '@/types/marketing-contract';

function makeRequest(overrides: Partial<TranslateTaskCreateRequest['input']> = {}): TranslateTaskCreateRequest {
  return {
    module: 'translate',
    schemaVersion: 1,
    input: {
      sourceText: '智能保温杯\n- 长效保温\n- 食品级材质',
      sourceLanguage: 'zh-CN',
      targetLanguages: ['en-US', 'ja-JP', 'ko-KR'],
      modelId: '33333333-3333-4333-8333-333333333333',
      ...overrides,
    },
  };
}

function makeModelConfig() {
  const now = new Date();
  return {
    id: '33333333-3333-4333-8333-333333333333',
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

describe('generateTranslateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.translate.mockImplementation(async (targetLanguage: string) => `译文-${targetLanguage}`);
    mocks.modelFindFirst.mockResolvedValue(makeModelConfig());
    mocks.prismaCreate.mockResolvedValue({ id: 'task-1' });
    mocks.prismaUpdate.mockResolvedValue({ id: 'task-1' });
  });

  it('三语言全部成功 -> completed，各语言结果完整', async () => {
    const outcome = await generateTranslateTask('user-1', makeRequest());
    expect(outcome.status).toBe('completed');
    expect(outcome.result.translations['en-US']).toMatchObject({ status: 'completed', translation: '译文-en-US' });
    expect(outcome.result.translations['ja-JP']).toMatchObject({ status: 'completed' });
    expect(outcome.result.translations['ko-KR']).toMatchObject({ status: 'completed' });
    expect(mocks.translate).toHaveBeenCalledTimes(3);
  });

  it('一种语言失败 -> partial_failed，其余结果保留', async () => {
    mocks.translate.mockImplementation(async (targetLanguage: string) => {
      if (targetLanguage === 'ja-JP') throw new Error('上游失败');
      return `译文-${targetLanguage}`;
    });
    const outcome = await generateTranslateTask('user-1', makeRequest());
    expect(outcome.status).toBe('partial_failed');
    expect(outcome.result.translations['en-US']).toMatchObject({ status: 'completed' });
    expect(outcome.result.translations['ja-JP']).toMatchObject({ status: 'failed' });
    expect(outcome.result.translations['ko-KR']).toMatchObject({ status: 'completed' });
    expect(outcome.error).toContain('ja-JP');
  });

  it('全部语言失败 -> failed', async () => {
    mocks.translate.mockRejectedValue(new Error('上游失败'));
    const outcome = await generateTranslateTask('user-1', makeRequest());
    expect(outcome.status).toBe('failed');
    expect(outcome.result.translations['en-US']).toMatchObject({ status: 'failed' });
  });

  it('目标语言超过 10 种 -> VALIDATION_ERROR', async () => {
    const languages = Array.from({ length: 11 }, (_, index) => `lang-${index}`);
    await expect(
      generateTranslateTask('user-1', makeRequest({ targetLanguages: languages }))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('非法语言代码 -> VALIDATION_ERROR', async () => {
    await expect(
      generateTranslateTask('user-1', makeRequest({ targetLanguages: ['en-US', 'xx-XX'] }))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('模型未实测 -> MODEL_TEST_REQUIRED', async () => {
    mocks.modelFindFirst.mockResolvedValue({ ...makeModelConfig(), testStatus: null, lastTestedAt: null });
    await expect(generateTranslateTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_TEST_REQUIRED',
    });
  });

  it('模型不存在 -> MODEL_NOT_FOUND', async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    await expect(generateTranslateTask('user-1', makeRequest())).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    });
  });

  it('任务写入 productName 为源文本摘要，platform 为 translate', async () => {
    await generateTranslateTask('user-1', makeRequest());
    const createArgs = mocks.prismaCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createArgs.data.module).toBe('translate');
    expect(createArgs.data.platform).toBe('translate');
    expect(typeof createArgs.data.productName).toBe('string');
    expect(createArgs.data.selectedOutputs).toEqual(['en-US', 'ja-JP', 'ko-KR']);
  });
});
