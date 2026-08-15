import { prisma } from '@/lib/db/prisma';
import { createAIService } from '@/lib/ai/factory';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { toCapabilities, toRuntimeAIConfig, toTestedCapabilities } from '@/lib/model-configs';
import { Marketing2Error } from '@/lib/marketing2/schemas';
import { CAPABILITY_LABELS } from '@/lib/marketing2/workflow-registry';
import type { AIServiceAdapter } from '@/lib/ai/base';
import type { AIServiceConfig } from '@/types/ai';
import type { ModelCapabilities, ModelCapabilityKey } from '@/types/model-config';

// ============================================
// 营销助手2模型解析（V2 5.4）
// 校验顺序：归属 -> 启用 -> 实测新鲜度 -> 能力匹配 -> 解密建 Adapter。
// 前端只传 modelId，不传 API Key / Base URL / 完整配置。
// ============================================

export interface ResolvedMarketing2Model {
  id: string;
  name: string;
  provider: string;
  model: string;
  capabilities: ModelCapabilities;
  runtimeConfig: AIServiceConfig;
}

export function buildModelSnapshot(model: ResolvedMarketing2Model) {
  return {
    modelId: model.id,
    name: model.name,
    provider: model.provider,
    model: model.model,
    capabilities: model.capabilities,
    snapshotAt: new Date().toISOString(),
  };
}

export async function resolveMarketing2Model(
  userId: string,
  modelId: string,
  requiredCapabilities: ModelCapabilityKey[]
): Promise<ResolvedMarketing2Model> {
  if (!modelId) {
    throw new Marketing2Error('MODEL_NOT_FOUND', '未选择模型', { httpStatus: 400 });
  }

  // 1. 归属
  const config = await prisma.modelConfig.findFirst({ where: { id: modelId, userId } });
  if (!config) {
    throw new Marketing2Error('MODEL_NOT_FOUND', '所选模型不存在或不属于当前用户', {
      httpStatus: 404,
    });
  }

  // 2. 启用
  if (!config.isActive) {
    throw new Marketing2Error('MODEL_DISABLED', `模型「${config.name}」已停用`, {
      httpStatus: 400,
    });
  }

  // 3. 实测状态：必须实测且配置未变更（测试新鲜）
  const tested = toTestedCapabilities(config.testedCapabilities);
  const testFresh =
    config.lastTestedAt !== null && config.lastTestedAt >= config.updatedAt;
  if (config.testStatus === 'failed') {
    throw new Marketing2Error('MODEL_TEST_FAILED', `模型「${config.name}」实测失败，请在设置中重新实测`, {
      httpStatus: 400,
    });
  }
  if (config.testStatus !== 'passed' || !testFresh) {
    throw new Marketing2Error(
      'MODEL_TEST_REQUIRED',
      `模型「${config.name}」尚未通过能力实测或配置已变更，请先在设置中实测`,
      { httpStatus: 400 }
    );
  }

  // 4. 能力标签匹配 + 对应能力实测通过
  const capabilities = toCapabilities(config.capabilities);
  const declaredMissing = requiredCapabilities.filter((key) => !capabilities[key]);
  if (declaredMissing.length > 0) {
    throw new Marketing2Error(
      'MODEL_CAPABILITY_MISSING',
      `模型「${config.name}」缺少能力：${declaredMissing
        .map((key) => CAPABILITY_LABELS[key])
        .join('、')}`,
      { httpStatus: 400 }
    );
  }
  if (tested) {
    const untested = requiredCapabilities.filter(
      // ocr 无独立实测项，随 vision 实测结论使用
      (key) => key !== 'ocr' && tested[key] !== true
    );
    if (untested.length > 0) {
      throw new Marketing2Error(
        'MODEL_TEST_REQUIRED',
        `模型「${config.name}」的以下能力未实测通过：${untested
          .map((key) => CAPABILITY_LABELS[key])
          .join('、')}`,
        { httpStatus: 400 }
      );
    }
  }

  // 5. 服务端解密密钥并构建运行时配置
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    model: config.model,
    capabilities,
    runtimeConfig: toRuntimeAIConfig(config),
  };
}

/** 草稿创建时的轻量校验：只查归属、启用与声明能力，不要求实测。 */
export async function validateModelForDraft(
  userId: string,
  modelId: string,
  requiredCapabilities: ModelCapabilityKey[]
): Promise<void> {
  const config = await prisma.modelConfig.findFirst({ where: { id: modelId, userId } });
  if (!config) {
    throw new Marketing2Error('MODEL_NOT_FOUND', '所选模型不存在或不属于当前用户', {
      httpStatus: 404,
    });
  }
  if (!config.isActive) {
    throw new Marketing2Error('MODEL_DISABLED', `模型「${config.name}」已停用`, {
      httpStatus: 400,
    });
  }
  const capabilities = toCapabilities(config.capabilities);
  const missing = requiredCapabilities.filter((key) => !capabilities[key]);
  if (missing.length > 0) {
    throw new Marketing2Error(
      'MODEL_CAPABILITY_MISSING',
      `模型「${config.name}」缺少能力：${missing.map((key) => CAPABILITY_LABELS[key]).join('、')}`,
      { httpStatus: 400 }
    );
  }
}

/** 文本模型客户端（结构化 JSON 调用）。 */
export function createTextClient(model: ResolvedMarketing2Model): HttpTextCompletionClient {
  return new HttpTextCompletionClient({
    baseURL: model.runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
    apiKey: model.runtimeConfig.apiKey,
    model: model.runtimeConfig.model ?? 'gpt-4o',
    apiProtocol: model.runtimeConfig.apiProtocol,
  });
}

/** 图片 Adapter（生成/编辑），由服务端解密配置构建，绝不接收浏览器配置。 */
export function createImageAdapter(model: ResolvedMarketing2Model): AIServiceAdapter {
  return createAIService(model.runtimeConfig);
}
