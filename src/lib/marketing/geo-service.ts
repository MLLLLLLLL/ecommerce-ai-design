import { prisma } from '@/lib/db/prisma';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { aggregateOutcomeStatus } from '@/lib/marketing/task-status';
import {
  mapUpstreamError,
  resolveModelWithPrecheck,
  toStepError,
} from '@/lib/marketing/task-common';
import { GeoEngine } from '@/lib/marketing/geo-engine';
import type { Prisma } from '@prisma/client';
import type {
  ExecutionStep,
  GeoResult,
  GeoTaskCreateRequest,
  MarketingTaskStatus,
} from '@/types/marketing-contract';

// ============================================
// GEO 任务服务（V3 Phase 5 离线版）
// 单次模型调用生成离线 GEO 内容；执行步骤记录在 geo 键下；
// 聚合后一次写回。结果不含任何联网来源。
// ============================================

export interface GeoTaskOutcome {
  taskId: string;
  status: MarketingTaskStatus;
  result: GeoResult;
  steps: Record<string, ExecutionStep>;
  error?: string;
}

export async function generateGeoTask(
  userId: string,
  request: GeoTaskCreateRequest
): Promise<GeoTaskOutcome> {
  const input = request.input;
  const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');

  const step: ExecutionStep = { status: 'pending', role: 'content', modelId: model.id };

  const task = await prisma.marketingTask.create({
    data: {
      userId,
      productName: input.brandName,
      productImages: [],
      platform: 'geo',
      language: input.language,
      sellPoints: [],
      keywords: input.keywords ?? [],
      parameters: {},
      module: 'geo',
      input: input as unknown as Prisma.InputJsonValue,
      selectedOutputs: [],
      schemaVersion: request.schemaVersion,
      modelSnapshot: {
        content: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          baseURL: model.baseURL,
          model: model.model,
        },
      } as unknown as Prisma.InputJsonValue,
      executionSteps: { geo: step } as unknown as Prisma.InputJsonValue,
      status: 'generating',
    },
  });
  const taskId = task.id;

  const client = new HttpTextCompletionClient({
    baseURL: model.runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
    apiKey: model.runtimeConfig.apiKey,
    model: model.runtimeConfig.model ?? 'gpt-4o',
    apiProtocol: model.runtimeConfig.apiProtocol,
  });
  const engine = new GeoEngine(client);

  try {
    const startedAt = Date.now();
    step.status = 'running';
    step.startedAt = new Date().toISOString();

    const result = await engine.generate({
      question: input.question,
      brandName: input.brandName,
      sourceContent: input.sourceContent,
      keywords: input.keywords,
      language: input.language,
      facts: input.facts,
    });

    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    step.durationMs = Date.now() - startedAt;

    const status = aggregateOutcomeStatus([step]);
    const errorMessage = status === 'failed' ? step.error ?? 'GEO 生成失败' : null;

    await prisma.marketingTask.update({
      where: { id: taskId },
      data: {
        status,
        error: errorMessage,
        result: result as unknown as Prisma.InputJsonValue,
        executionSteps: { geo: step } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      taskId,
      status,
      result,
      steps: { geo: step },
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  } catch (error) {
    step.status = 'failed';
    step.completedAt = new Date().toISOString();
    step.error = toStepError(error).error;
    const mapped = mapUpstreamError(error);
    await prisma.marketingTask
      .update({
        where: { id: taskId },
        data: {
          status: 'failed',
          error: mapped.message.slice(0, 2000),
          executionSteps: { geo: step } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    throw mapped;
  }
}
