import type { ModelConfig } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { decryptServerSecret } from '@/lib/security/server-encryption';
import type { AIServiceConfig } from '@/types/ai';
import type {
  ModelCapabilities,
  ModelConfigSummary,
  TestedCapabilities,
  TextModelApiProtocol,
} from '@/types/model-config';

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  jsonMode: false,
  ocr: false,
  imageGeneration: false,
  imageEditing: false,
  referenceImage: false,
};

export function toTextModelApiProtocol(value: unknown): TextModelApiProtocol {
  return value === 'responses' ? 'responses' : 'chat_completions';
}

export function toCapabilities(value: unknown): ModelCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_CAPABILITIES;
  }
  const input = value as Partial<ModelCapabilities>;
  return {
    vision: input.vision === true,
    jsonMode: input.jsonMode === true,
    ocr: input.ocr === true,
    imageGeneration: input.imageGeneration === true,
    imageEditing: input.imageEditing === true,
    referenceImage: input.referenceImage === true,
  };
}

export function toTestedCapabilities(value: unknown): TestedCapabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const input = value as Partial<TestedCapabilities>;
  return {
    connection: input.connection === true,
    jsonMode: input.jsonMode === true,
    vision: input.vision === true,
    imageGeneration: input.imageGeneration === true,
    imageEditing: input.imageEditing === true,
    referenceImage: input.referenceImage === true,
  };
}

export function toModelConfigSummary(config: ModelConfig): ModelConfigSummary {
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    relayType: config.relayType as ModelConfigSummary['relayType'],
    baseURL: config.baseURL,
    model: config.model,
    apiProtocol: toTextModelApiProtocol(config.apiProtocol),
    capabilities: toCapabilities(config.capabilities),
    isActive: config.isActive,
    isDefault: config.isDefault,
    apiKeyConfigured: Boolean(config.apiKeyEncrypted),
    lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
    testStatus: config.testStatus,
    testedCapabilities: toTestedCapabilities(config.testedCapabilities),
    testError: config.testError,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function toRuntimeAIConfig(config: ModelConfig): AIServiceConfig {
  return {
    id: config.id,
    name: config.name,
    // 保留服务端保存的提供商；否则中转站图片模型会被误建成 OpenAI 直连适配器。
    provider: config.provider as AIServiceConfig['provider'],
    relayType: config.relayType as AIServiceConfig['relayType'],
    baseURL: config.baseURL,
    model: config.model,
    apiProtocol: toTextModelApiProtocol(config.apiProtocol),
    apiKey: decryptServerSecret(config.apiKeyEncrypted),
  };
}

export async function resolveTextModelForPurpose(
  userId: string,
  modelId: string,
  purpose: 'vision' | 'content'
) {
  const config = await prisma.modelConfig.findFirst({
    where: { id: modelId, userId, isActive: true },
  });

  if (!config) {
    throw new Error('所选模型不存在、已停用，或不属于当前用户');
  }

  const capabilities = toCapabilities(config.capabilities);
  if (purpose === 'vision' && (!capabilities.vision || !capabilities.jsonMode || capabilities.imageGeneration)) {
    throw new Error('图片识别模型必须是已启用、支持视觉输入和 JSON 输出的文本模型');
  }
  if (purpose === 'content' && (!capabilities.jsonMode || capabilities.imageGeneration)) {
    throw new Error('内容生成模型必须支持结构化 JSON 输出，且不能是图片生成模型');
  }

  return { config, capabilities, runtimeConfig: toRuntimeAIConfig(config) };
}
