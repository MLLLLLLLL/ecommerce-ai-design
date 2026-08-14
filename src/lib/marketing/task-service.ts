import { prisma } from '@/lib/db/prisma';
import { CopywritingEngine, ProductAnalyzer, PromptEngine } from '@/lib/marketing';
import {
  marketingConcurrencyKey,
  runWithConcurrency,
} from '@/lib/marketing/concurrency';
import { aggregateTaskStatus } from '@/lib/marketing/task-status';
import {
  mapUpstreamError,
  MarketingServiceError,
  resolveModelWithPrecheck,
  ResolvedModel,
  toStepError,
} from '@/lib/marketing/task-common';
import type { Prisma } from '@prisma/client';
import type {
  CopywritingOutputKey,
  ExecutionStepMap,
  ExecutionStepName,
  MarketingFact,
  MarketingTaskCreateRequest,
  MarketingTaskResultSnapshot,
  MarketingTaskStatus,
} from '@/types/marketing-contract';

// ============================================
// 营销任务服务（V3 Phase 2）
// 同步纵向闭环：校验与预检 -> 创建任务 -> 分析串行 ->
// 下游三类内容并发（上限 3）-> 状态聚合一次写回。
// 数据归属：所有查询与更新必须携带 userId。
// ============================================

export {
  mapUpstreamError,
  MarketingServiceError,
  resolveModelWithPrecheck,
};
export type { ResolvedModel };

const STEP_NAMES: ExecutionStepName[] = ['analysis', 'copywriting', 'mainPrompts', 'detailPrompts'];

function buildFacts(
  input: MarketingTaskCreateRequest['input'],
  analysis: Record<string, unknown> | null
): { facts: MarketingFact[]; pendingFacts: MarketingFact[] } {
  const facts: MarketingFact[] = [];
  const pendingFacts: MarketingFact[] = [];

  const now = new Date().toISOString();
  facts.push({
    key: 'productName',
    value: input.productName,
    status: 'confirmed',
    sourceType: 'user',
    retrievedAt: now,
  });
  for (const point of input.sellPoints ?? []) {
    facts.push({ key: 'sellPoint', value: point, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }
  for (const keyword of input.keywords ?? []) {
    facts.push({ key: 'keyword', value: keyword, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }
  for (const [key, value] of Object.entries(input.parameters ?? {})) {
    facts.push({ key: `parameter:${key}`, value, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }

  if (analysis) {
    const confirmed = analysis.confirmed;
    if (confirmed && typeof confirmed === 'object' && !Array.isArray(confirmed)) {
      for (const [key, value] of Object.entries(confirmed as Record<string, unknown>)) {
        if (typeof value === 'string' && value) {
          facts.push({
            key: `analysis:${key}`,
            value,
            status: 'pending',
            sourceType: 'image_analysis',
            retrievedAt: now,
          });
        }
      }
    }
    const placeholders = analysis.placeholders;
    if (placeholders && typeof placeholders === 'object' && !Array.isArray(placeholders)) {
      for (const [key, list] of Object.entries(placeholders as Record<string, unknown>)) {
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === 'string') {
              pendingFacts.push({
                key: `placeholder:${key}`,
                value: item,
                status: 'pending',
                sourceType: 'image_analysis',
                retrievedAt: now,
              });
            }
          }
        }
      }
    }
  }

  return { facts, pendingFacts };
}

export interface GenerateTaskOutcome {
  taskId: string;
  status: MarketingTaskStatus;
  result: MarketingTaskResultSnapshot;
  steps: ExecutionStepMap;
  error?: string;
}

/**
 * 执行营销任务：分析串行 + 下游并发（V3 4.3）。
 * 一次写回聚合结果，避免多个 Promise 对同一 JSON 字段的丢失更新。
 */
export async function generateMarketingTask(
  userId: string,
  request: MarketingTaskCreateRequest
): Promise<GenerateTaskOutcome> {
  const input = request.input;
  const outputs = input.outputs;
  const hasAnyOutput = Object.values(outputs).some(Boolean);
  if (!hasAnyOutput) {
    throw new MarketingServiceError('VALIDATION_ERROR', '请至少选择一项生成内容', {
      fieldErrors: { outputs: ['至少选择一项'] },
    });
  }

  // 下游任一被选则分析必须执行（内部依赖）。
  const needsAnalysis = outputs.analysis || outputs.copywriting || outputs.mainPrompts || outputs.detailPrompts;

  const [visionModel, contentModel] = await Promise.all([
    resolveModelWithPrecheck(userId, input.modelSelection.visionModelId, 'vision'),
    resolveModelWithPrecheck(userId, input.modelSelection.contentModelId, 'content'),
  ]);

  const steps: ExecutionStepMap = {};
  for (const name of STEP_NAMES) {
    steps[name] = {
      status: 'pending',
      role: name === 'analysis' ? 'vision' : 'content',
      modelId: name === 'analysis' ? visionModel.id : contentModel.id,
    };
  }
  if (!needsAnalysis) steps.analysis = { ...steps.analysis!, status: 'skipped' };
  if (!outputs.copywriting) steps.copywriting = { ...steps.copywriting!, status: 'skipped' };
  if (!outputs.mainPrompts) steps.mainPrompts = { ...steps.mainPrompts!, status: 'skipped' };
  if (!outputs.detailPrompts) steps.detailPrompts = { ...steps.detailPrompts!, status: 'skipped' };

  const selectedOutputs = (Object.keys(outputs) as CopywritingOutputKey[]).filter(
    (key) => outputs[key]
  );

  const task = await prisma.marketingTask.create({
    data: {
      userId,
      productName: input.productName,
      productImages: input.productImages,
      category: input.category || null,
      platform: input.platform,
      language: input.language,
      sellPoints: input.sellPoints || [],
      keywords: input.keywords || [],
      parameters: (input.parameters ?? {}) as Prisma.InputJsonValue,
      module: request.module,
      input: request.input as unknown as Prisma.InputJsonValue,
      selectedOutputs,
      schemaVersion: request.schemaVersion,
      modelSnapshot: {
        vision: {
          id: visionModel.id,
          name: visionModel.name,
          provider: visionModel.provider,
          baseURL: visionModel.baseURL,
          model: visionModel.model,
        },
        content: {
          id: contentModel.id,
          name: contentModel.name,
          provider: contentModel.provider,
          baseURL: contentModel.baseURL,
          model: contentModel.model,
        },
      } as unknown as Prisma.InputJsonValue,
      executionSteps: steps as unknown as Prisma.InputJsonValue,
      status: 'analyzing',
    },
  });
  const taskId = task.id;

  const markStep = (name: ExecutionStepName, update: Partial<NonNullable<ExecutionStepMap[ExecutionStepName]>>) => {
    steps[name] = { ...steps[name]!, ...update };
  };

  let analysis: Record<string, unknown> | null = null;
  let copywriting: Record<string, unknown> | null = null;
  let mainPrompts: Record<string, unknown> | null = null;
  let detailPrompts: Record<string, unknown> | null = null;

  try {
    // 1. 产品分析（串行，视觉模型）
    if (needsAnalysis) {
      const startedAt = Date.now();
      markStep('analysis', { status: 'running', startedAt: new Date().toISOString() });
      const analysisResult = await runWithConcurrency(
        marketingConcurrencyKey(userId, visionModel.id),
        () =>
          new ProductAnalyzer(visionModel.runtimeConfig).analyze({
            images: input.productImages,
            productName: input.productName,
            userHints: {
              category: input.category as never,
              sellPoints: input.sellPoints,
              parameters: input.parameters,
            },
          })
      );
      analysis = analysisResult as unknown as Record<string, unknown>;
      await prisma.marketingTask.update({ where: { id: taskId }, data: { analysis: analysis as Prisma.InputJsonValue } });
      markStep('analysis', { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
    }

    // 2. 下游三类内容并发（内容模型，Promise.allSettled，上限 3）
    await prisma.marketingTask.update({ where: { id: taskId }, data: { status: 'generating' } });
    const analysisTyped = analysis as never;
    const downstream = await Promise.allSettled([
      outputs.copywriting
        ? runWithConcurrency(marketingConcurrencyKey(userId, contentModel.id), async () => {
            const startedAt = Date.now();
            markStep('copywriting', { status: 'running', startedAt: new Date().toISOString() });
            const result = await new CopywritingEngine(contentModel.runtimeConfig).generate(
              analysisTyped,
              input.platform as never,
              input.language as never,
              input.keywords
            );
            copywriting = result as unknown as Record<string, unknown>;
            markStep('copywriting', { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
          })
        : Promise.resolve(),
      outputs.mainPrompts
        ? runWithConcurrency(marketingConcurrencyKey(userId, contentModel.id), async () => {
            const startedAt = Date.now();
            markStep('mainPrompts', { status: 'running', startedAt: new Date().toISOString() });
            const result = await new PromptEngine(contentModel.runtimeConfig).generateMainImagePrompts(
              analysisTyped,
              input.platform as never,
              input.language as never,
              input.sellPoints
            );
            mainPrompts = result as unknown as Record<string, unknown>;
            markStep('mainPrompts', { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
          })
        : Promise.resolve(),
      outputs.detailPrompts
        ? runWithConcurrency(marketingConcurrencyKey(userId, contentModel.id), async () => {
            const startedAt = Date.now();
            markStep('detailPrompts', { status: 'running', startedAt: new Date().toISOString() });
            const result = await new PromptEngine(contentModel.runtimeConfig).generateDetailPagePrompts(
              analysisTyped,
              input.platform as never,
              input.language as never
            );
            detailPrompts = result as unknown as Record<string, unknown>;
            markStep('detailPrompts', { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
          })
        : Promise.resolve(),
    ]);

    for (const [index, name] of (['copywriting', 'mainPrompts', 'detailPrompts'] as const).entries()) {
      const settled = downstream[index];
      if (settled.status === 'rejected') {
        markStep(name, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          ...toStepError(settled.reason),
        });
      }
    }

    const { facts, pendingFacts } = buildFacts(input, analysis);
    const result: MarketingTaskResultSnapshot = {
      ...(analysis ? { analysis } : {}),
      ...(copywriting ? { copywriting } : {}),
      ...(mainPrompts ? { mainPrompts } : {}),
      ...(detailPrompts ? { detailPrompts } : {}),
      facts,
      pendingFacts,
    };

    const status = aggregateTaskStatus(steps);
    const errorMessage =
      status === 'failed' || status === 'partial_failed'
        ? STEP_NAMES.filter((name) => steps[name]?.status === 'failed')
            .map((name) => `${name}: ${steps[name]?.error ?? '失败'}`)
            .join('；')
            .slice(0, 2000)
        : null;

    // 聚合器一次写回（避免丢失更新）
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: {
        status,
        error: errorMessage,
        result: result as unknown as Prisma.InputJsonValue,
        executionSteps: steps as unknown as Prisma.InputJsonValue,
        ...(analysis ? { analysis: analysis as Prisma.InputJsonValue } : {}),
        ...(copywriting ? { copywriting: copywriting as Prisma.InputJsonValue } : {}),
        ...(mainPrompts ? { mainPrompts: mainPrompts as Prisma.InputJsonValue } : {}),
        ...(detailPrompts ? { detailPrompts: detailPrompts as Prisma.InputJsonValue } : {}),
      },
    });

    return { taskId, status, result, steps, ...(errorMessage ? { error: errorMessage } : {}) };
  } catch (error) {
    // 分析或写入失败：整个任务失败。
    const mapped = mapUpstreamError(error);
    const message = mapped.message;
    if (needsAnalysis && steps.analysis?.status === 'running') {
      markStep('analysis', {
        status: 'failed',
        completedAt: new Date().toISOString(),
        ...toStepError(error),
      });
    }
    const status = aggregateTaskStatus(steps);
    await prisma.marketingTask
      .update({
        where: { id: taskId },
        data: {
          status,
          error: message.slice(0, 2000),
          executionSteps: steps as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    throw mapped;
  }
}

export async function getMarketingTask(userId: string, taskId: string) {
  const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', {
      httpStatus: 404,
    });
  }
  return task;
}

export async function listMarketingTasks(
  userId: string,
  options: {
    cursor?: string;
    limit?: number;
    module?: string;
    status?: string;
    isFavorite?: boolean;
    q?: string;
    from?: string;
    to?: string;
  }
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const cursor = options.cursor ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString()) : null;
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  if (from && Number.isNaN(from.getTime())) {
    throw new MarketingServiceError('VALIDATION_ERROR', '起始时间格式不正确');
  }
  if (to && Number.isNaN(to.getTime())) {
    throw new MarketingServiceError('VALIDATION_ERROR', '结束时间格式不正确');
  }

  const tasks = await prisma.marketingTask.findMany({
    where: {
      userId,
      ...(options.module ? { module: options.module } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.isFavorite !== undefined ? { isFavorite: options.isFavorite } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(options.q
        ? {
            OR: [
              { productName: { contains: options.q, mode: 'insensitive' } },
              { keywords: { has: options.q } },
            ],
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      module: true,
      status: true,
      productName: true,
      productImages: true,
      platform: true,
      language: true,
      selectedOutputs: true,
      isFavorite: true,
      error: true,
      schemaVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasMore = tasks.length > limit;
  const items = hasMore ? tasks.slice(0, limit) : tasks;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url')
    : null;

  return { items, nextCursor };
}

export async function setTaskFavorite(userId: string, taskId: string, isFavorite: boolean) {
  const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', {
      httpStatus: 404,
    });
  }
  return prisma.marketingTask.update({ where: { id: taskId }, data: { isFavorite } });
}
