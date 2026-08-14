import { prisma } from '@/lib/db/prisma';
import { TextCompletionError } from '@/lib/ai/text-completion-client';
import { toCapabilities, toRuntimeAIConfig, toTestedCapabilities } from '@/lib/model-configs';
import type { AIServiceConfig } from '@/types/ai';
import type { MarketingErrorCode } from '@/types/marketing-contract';

// ============================================
// 营销任务共享基础（V3 Phase 2/3 共用）
// 错误模型、错误码映射、模型解析与实测预检。
// ============================================

export class MarketingServiceError extends Error {
  readonly code: MarketingErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly httpStatus: number;

  constructor(
    code: MarketingErrorCode,
    message: string,
    options?: { fieldErrors?: Record<string, string[]>; httpStatus?: number }
  ) {
    super(message);
    this.name = 'MarketingServiceError';
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.httpStatus = options?.httpStatus ?? 400;
  }
}

export interface ResolvedModel {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
  runtimeConfig: AIServiceConfig;
}

/**
 * 解析模型并执行能力与实测预检（V3 5.2）：
 * - 不存在/停用/非当前用户 -> MODEL_NOT_FOUND
 * - 声明能力不足 -> MODEL_CAPABILITY_MISSING
 * - 未实测通过或配置已变更（测试过期）-> MODEL_TEST_REQUIRED
 */
export async function resolveModelWithPrecheck(
  userId: string,
  modelId: string,
  purpose: 'vision' | 'content'
): Promise<ResolvedModel> {
  const config = await prisma.modelConfig.findFirst({
    where: { id: modelId, userId, isActive: true },
  });

  if (!config) {
    throw new MarketingServiceError(
      'MODEL_NOT_FOUND',
      '所选模型不存在、已停用，或不属于当前用户'
    );
  }

  const capabilities = toCapabilities(config.capabilities);
  if (
    purpose === 'vision' &&
    (!capabilities.vision || !capabilities.jsonMode || capabilities.imageGeneration)
  ) {
    throw new MarketingServiceError(
      'MODEL_CAPABILITY_MISSING',
      '视觉模型必须支持视觉输入和 JSON 输出，且不能是图片生成模型'
    );
  }
  if (purpose === 'content' && (!capabilities.jsonMode || capabilities.imageGeneration)) {
    throw new MarketingServiceError(
      'MODEL_CAPABILITY_MISSING',
      '内容生成模型必须支持 JSON 输出，且不能是图片生成模型'
    );
  }

  // 实测预检：必须实测通过且配置未变更（测试未过期）。
  const tested = toTestedCapabilities(config.testedCapabilities);
  const testFresh =
    config.lastTestedAt !== null &&
    config.updatedAt !== null &&
    config.lastTestedAt >= config.updatedAt;
  const passedByPurpose =
    purpose === 'vision' ? tested?.vision === true : tested?.jsonMode === true;

  if (config.testStatus !== 'passed' || !passedByPurpose || !testFresh) {
    throw new MarketingServiceError(
      'MODEL_TEST_REQUIRED',
      `「${config.name}」尚未通过能力实测或配置已变更，请先在设置中实测该模型（${purpose === 'vision' ? '需通过视觉测试' : '需通过 JSON 测试'}）`
    );
  }

  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    baseURL: config.baseURL,
    model: config.model,
    runtimeConfig: toRuntimeAIConfig(config),
  };
}

export function toStepError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message.slice(0, 1000) : '未知错误' };
}

/** 把底层错误映射为稳定错误码（V3 8.2）。 */
export function mapUpstreamError(error: unknown): MarketingServiceError {
  if (error instanceof MarketingServiceError) return error;
  if (error instanceof TextCompletionError) {
    switch (error.kind) {
      case 'rate_limited':
        return new MarketingServiceError('UPSTREAM_RATE_LIMITED', '模型服务限流，请稍后重试', {
          httpStatus: 429,
        });
      case 'schema_mismatch':
      case 'invalid_json':
      case 'empty_response':
        return new MarketingServiceError('OUTPUT_INVALID', error.message, { httpStatus: 502 });
      default:
        return new MarketingServiceError('UPSTREAM_FAILED', error.message, { httpStatus: 502 });
    }
  }
  const message = error instanceof Error ? error.message.slice(0, 500) : '未知错误';
  return new MarketingServiceError('UPSTREAM_FAILED', message, { httpStatus: 502 });
}
