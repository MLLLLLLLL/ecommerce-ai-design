import { prisma } from '@/lib/db/prisma';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { aggregateOutcomeStatus } from '@/lib/marketing/task-status';
import {
  mapUpstreamError,
  resolveModelWithPrecheck,
  toStepError,
} from '@/lib/marketing/task-common';
import { SeoEngine } from '@/lib/marketing/seo-engine';
import type { Prisma } from '@prisma/client';
import type {
  ExecutionStep,
  MarketingTaskStatus,
  SeoResult,
  SeoTaskCreateRequest,
} from '@/types/marketing-contract';

// ============================================
// SEO 任务服务（V3 Phase 4）
// 单次模型调用生成结构化 SEO 结果；执行步骤记录在 seo 键下；
// 聚合后一次写回。输入中的用户事实为 confirmed，随 input 快照保存。
// ============================================

export interface SeoTaskOutcome {
  taskId: string;
  status: MarketingTaskStatus;
  result: SeoResult;
  steps: Record<string, ExecutionStep>;
  error?: string;
}

export async function generateSeoTask(
  userId: string,
  request: SeoTaskCreateRequest
): Promise<SeoTaskOutcome> {
  const input = request.input;
  const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');

  const step: ExecutionStep = { status: 'pending', role: 'content', modelId: model.id };

  const task = await prisma.marketingTask.create({
    data: {
      userId,
      productName: input.productName,
      productImages: [],
      platform: 'seo',
      language: input.language,
      sellPoints: [],
      keywords: input.keywords,
      parameters: {},
      module: 'seo',
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
      executionSteps: { seo: step } as unknown as Prisma.InputJsonValue,
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
  const engine = new SeoEngine(client);

  try {
    const startedAt = Date.now();
    step.status = 'running';
    step.startedAt = new Date().toISOString();

    const result = await engine.generate({
      productName: input.productName,
      sourceContent: input.sourceContent,
      keywords: input.keywords,
      category: input.category,
      language: input.language,
      facts: input.facts,
    });

    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    step.durationMs = Date.now() - startedAt;

    const status = aggregateOutcomeStatus([step]);
    const errorMessage = status === 'failed' ? step.error ?? 'SEO 生成失败' : null;

    // 聚合器一次写回
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: {
        status,
        error: errorMessage,
        result: result as unknown as Prisma.InputJsonValue,
        executionSteps: { seo: step } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      taskId,
      status,
      result,
      steps: { seo: step },
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
          executionSteps: { seo: step } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    throw mapped;
  }
}
