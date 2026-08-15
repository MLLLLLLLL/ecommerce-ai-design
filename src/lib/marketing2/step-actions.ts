import { prisma } from '@/lib/db/prisma';
import { appendTaskEvent } from '@/lib/marketing/async/aggregation';
import { resolveMarketing2Model } from '@/lib/marketing2/model-routing';
import {
  buildImageFilename,
  Marketing2Error,
  qualityCheckResultSchema,
  zodFieldErrors,
  type QualityCheckResult,
} from '@/lib/marketing2/schemas';
import { computeStepStates, findOwnedTask, nextStepAfter } from '@/lib/marketing2/run-service';
import {
  detailPageItemKind,
  getWorkflow,
  mainImageItemKind,
  qualityCheckItemKind,
  repairItemKind,
  STEP_CAPABILITY_MATRIX,
  stepDependenciesMet,
  type Marketing2StepKey,
  type WorkflowStepDefinition,
} from '@/lib/marketing2/workflow-registry';
import type { MarketingTask, MarketingTaskItem } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ModelCapabilityKey } from '@/types/model-config';

// ============================================
// 营销助手2步骤动作（V2 7.3 / 8）
// 执行、审批、跳过、重试、暂停、返修：
// 均要求 Idempotency-Key 与 expectedVersion，事务内校验
// 归属、依赖、版本与状态；重复请求返回首次结果。
// ============================================

interface ActionContext {
  task: MarketingTask;
  workflow: ReturnType<typeof getWorkflow> & object;
  step: WorkflowStepDefinition;
  items: MarketingTaskItem[];
  stepStates: Record<string, string>;
}

async function loadContext(
  userId: string,
  taskId: string,
  stepKey: string,
  expectedVersion: number
): Promise<ActionContext> {
  const task = await findOwnedTask(userId, taskId);
  const workflow = getWorkflow(task.workflowKey ?? '');
  if (!workflow) {
    throw new Marketing2Error('WORKFLOW_NOT_FOUND', '任务缺少工作流定义', { httpStatus: 500 });
  }
  const step = workflow.steps.find((item) => item.key === stepKey);
  if (!step) {
    throw new Marketing2Error('STEP_NOT_FOUND', `工作流不存在步骤：${stepKey}`, { httpStatus: 404 });
  }
  if (task.taskVersion !== expectedVersion) {
    throw new Marketing2Error('VERSION_CONFLICT', '任务版本不一致，请刷新后重试', {
      httpStatus: 409,
    });
  }
  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
  return { task, workflow, step, items, stepStates: computeStepStates(task, items) };
}

function stepModelId(task: MarketingTask, stepKey: string, subKey?: string): string {
  const stepModels = (task.stepModels as Record<string, unknown> | null) ?? {};
  if (task.workflowVersion >= 3) {
    const v3 = stepModels as {
      backgroundCleanup?: string;
      visualAnalysis?: string;
      promptGeneration?: string;
      imageGeneration?: { items?: Record<string, string> };
      quality?: { items?: Record<string, string> };
      repair?: { items?: Record<string, string> };
    };
    if (stepKey === 'background_cleanup') return v3.backgroundCleanup ?? '';
    if (stepKey === 'visual_analysis') return v3.visualAnalysis ?? '';
    if (stepKey === 'prompt_planning') return v3.promptGeneration ?? '';
    if (stepKey === 'batch_generation' && subKey) return v3.imageGeneration?.items?.[subKey] ?? '';
    if (stepKey === 'quality_repair' && subKey?.startsWith('quality:')) return v3.quality?.items?.[subKey.slice(8)] ?? '';
    if (stepKey === 'quality_repair' && subKey?.startsWith('repair:')) {
      return v3.repair?.items?.[subKey.slice(7)] ?? v3.repair?.items?.default ?? '';
    }
  }
  const value = stepModels[subKey ?? stepKey];
  return typeof value === 'string' ? value : '';
}

async function bumpTaskVersion(taskId: string, expectedVersion: number, data: Prisma.MarketingTaskUpdateInput) {
  const result = await prisma.marketingTask.updateMany({
    where: { id: taskId, taskVersion: expectedVersion },
    data: { ...data, taskVersion: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new Marketing2Error('VERSION_CONFLICT', '任务版本不一致，请刷新后重试', {
      httpStatus: 409,
    });
  }
}

// --------------------------------------------
// 执行步骤
// --------------------------------------------

export async function executeStep(
  userId: string,
  taskId: string,
  stepKey: string,
  options: { expectedVersion: number; idempotencyKey: string }
) {
  if (!options.idempotencyKey) {
    throw new Marketing2Error('IDEMPOTENCY_KEY_MISSING', '请求必须携带 Idempotency-Key', {
      httpStatus: 400,
    });
  }
  const context = await loadContext(userId, taskId, stepKey, options.expectedVersion);
  const { task, workflow, step, items, stepStates } = context;

  // 幂等：同一步骤同一幂等键已创建过 items，直接返回首次结果
  const existing = items.filter((item) =>
    item.idempotencyKey?.startsWith(`${taskId}:${stepKey}:${options.idempotencyKey}`)
  );
  if (existing.length > 0) {
    return { task, items: existing, deduplicated: true };
  }

  const state = stepStates[stepKey];
  // 底图净化支持接受/重新生成（交互 6.2）：待确认时可再次执行生成新版本
  const allowRegenerate = step.key === 'background_cleanup' && state === 'awaiting_review';
  if (!['idle', 'failed'].includes(state ?? 'idle') && !allowRegenerate) {
    throw new Marketing2Error(
      'STEP_STATE_INVALID',
      `步骤当前状态为 ${state}，不能执行`,
      { httpStatus: 409 }
    );
  }

  const deps = stepDependenciesMet(workflow, step.key as Marketing2StepKey, stepStates as never);
  if (!deps.ok) {
    throw new Marketing2Error(
      'STEP_DEPENDENCY_MISSING',
      `依赖步骤未完成：${deps.missing.join('、')}`,
      { httpStatus: 409 }
    );
  }

  // 能力不足在执行前拦截，不产生上游请求（交互 9）
  const capabilities = STEP_CAPABILITY_MATRIX[stepKey] as ModelCapabilityKey[];
  const modelId = stepModelId(task, stepKey);
  if (capabilities.length > 0 && stepKey !== 'quality_repair' && !(task.workflowVersion >= 3 && stepKey === 'batch_generation')) {
    await resolveMarketing2Model(userId, modelId, capabilities);
  }
  if (stepKey === 'quality_repair' && task.workflowVersion < 3) {
    await resolveMarketing2Model(userId, stepModelId(task, 'quality_repair'), STEP_CAPABILITY_MATRIX['quality_repair']);
  }
  if (task.workflowVersion >= 3 && stepKey === 'batch_generation') {
    const input = (task.input as Record<string, unknown>) ?? {};
    const plans = await resolveBatchPlans(task, input, (task.stepResults as Record<string, Record<string, unknown>>) ?? {});
    for (const plan of plans) {
      const itemKey = plan.kind === 'main_image' ? mainImageItemKind(plan.index) : detailPageItemKind(plan.index);
      await resolveMarketing2Model(userId, stepModelId(task, stepKey, itemKey), capabilities);
    }
  }
  if (task.workflowVersion >= 3 && stepKey === 'quality_repair') {
    const targets = await resolveQualityTargets(task, (task.input as Record<string, unknown>) ?? {}, items);
    for (const target of targets) {
      await resolveMarketing2Model(userId, stepModelId(task, stepKey, `quality:${target.assetId}`), capabilities);
    }
  }

  const newItems = await buildStepItems(userId, task, step, items, options.idempotencyKey);
  if (newItems.length === 0) {
    throw new Marketing2Error('STEP_STATE_INVALID', '当前没有可执行的子项', { httpStatus: 409 });
  }

  await bumpTaskVersion(taskId, options.expectedVersion, {
    status: 'running_step',
    currentStep: stepKey,
    awaitingReview: false,
    pausedAt: null,
    error: null,
  });
  await appendTaskEvent(taskId, userId, 'step_started', {
    stepKey,
    itemCount: newItems.length,
    taskVersion: options.expectedVersion + 1,
  });

  return { task: await findOwnedTask(userId, taskId), items: newItems, deduplicated: false };
}

/** 按步骤类型创建 items（输入快照不含密钥）。 */
async function buildStepItems(
  userId: string,
  task: MarketingTask,
  step: WorkflowStepDefinition,
  existingItems: MarketingTaskItem[],
  idempotencyKey: string
): Promise<MarketingTaskItem[]> {
  const taskId = task.id;
  const input = (task.input as Record<string, unknown>) ?? {};
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const modelId = stepModelId(task, step.key);
  const created: MarketingTaskItem[] = [];

  const createItem = async (options: {
    kind: string;
    itemInput: Record<string, unknown>;
    model?: string;
    suffix: string;
    maxAttempts?: number;
  }) => {
    try {
      const item = await prisma.marketingTaskItem.create({
        data: {
          taskId,
          userId,
          kind: options.kind,
          stepKey: step.key,
          modelId: (options.model ?? modelId) || null,
          status: 'pending',
          input: options.itemInput as Prisma.InputJsonValue,
          idempotencyKey: `${taskId}:${step.key}:${idempotencyKey}:${options.suffix}`,
          maxAttempts: options.maxAttempts ?? 2,
        },
      });
      created.push(item);
    } catch (error) {
      // 唯一键冲突：重复请求，返回已有 item
      if ((error as { code?: string }).code === 'P2002') {
        const existing = await prisma.marketingTaskItem.findUnique({
          where: { idempotencyKey: `${taskId}:${step.key}:${idempotencyKey}:${options.suffix}` },
        });
        if (existing) created.push(existing);
        return;
      }
      throw error;
    }
  };

  switch (step.key) {
    case 'material_validate': {
      await createItem({ kind: 'material_validate', itemInput: {}, suffix: 'main' });
      break;
    }
    case 'background_cleanup': {
      const images = (input.productImages as string[]) ?? [];
      const instruction = (input.cleanupInstruction as string) ?? '';
      const requestedPrimary = input.primaryImageId;
      const primaryImage = typeof requestedPrimary === 'string' && images.includes(requestedPrimary)
        ? requestedPrimary
        : images[0];
      if (!primaryImage) break;
      await createItem({
        kind: 'background_cleanup',
        itemInput: {
          image: primaryImage,
          supportingImages: images.filter((image) => image !== primaryImage),
          instruction,
        },
        suffix: 'primary',
      });
      break;
    }
    case 'visual_analysis': {
      const cleanedUrls = await getCleanedImageUrls(task, existingItems);
      const images = cleanedUrls.length > 0 ? cleanedUrls : ((input.productImages as string[]) ?? []);
      await createItem({ kind: 'visual_analysis', itemInput: { images }, suffix: 'main' });
      break;
    }
    case 'prompt_planning': {
      await createItem({ kind: 'prompt_planning', itemInput: {}, suffix: 'main' });
      break;
    }
    case 'batch_generation': {
      const plans = await resolveBatchPlans(task, input, stepResults);
      const referenceImages = await resolveReferenceImages(task, input);
      for (const plan of plans) {
        const kind =
          plan.kind === 'main_image' ? mainImageItemKind(plan.index) : detailPageItemKind(plan.index);
        await createItem({
          kind,
          itemInput: {
            prompt: plan.prompt,
            negativePrompt: plan.negativePrompt ?? '',
            keyword: plan.keyword,
            productName: (input.productName as string) ?? task.productName,
            referenceImages,
            ratio:
              plan.kind === 'main_image'
                ? ((input.mainImageRatio as string) ?? '1:1')
                : ((input.detailPageRatio as string) ?? '3:4'),
          },
          model: task.workflowVersion >= 3 ? stepModelId(task, 'batch_generation', kind) : undefined,
          suffix: kind,
        });
      }
      break;
    }
    case 'quality_repair': {
      const targets = await resolveQualityTargets(task, input, existingItems);
      for (const target of targets) {
        await createItem({
          kind: qualityCheckItemKind(target.assetId),
          itemInput: { assetId: target.assetId, url: target.url },
          model: task.workflowVersion >= 3
            ? stepModelId(task, 'quality_repair', `quality:${target.assetId}`)
            : stepModelId(task, 'quality_repair'),
          suffix: `check-${target.assetId}`,
        });
      }
      break;
    }
  }

  return created;
}

/** 净化图派生资产优先，其次原图。 */
async function getCleanedImageUrls(
  task: MarketingTask,
  items: MarketingTaskItem[]
): Promise<string[]> {
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const cleanupResult = stepResults.background_cleanup?.result as
    | { cleanedImages?: { url: string }[] }
    | undefined;
  if (cleanupResult?.cleanedImages?.length) {
    return cleanupResult.cleanedImages.map((item) => item.url);
  }
  const cleanupItems = items.filter(
    (item) => item.stepKey === 'background_cleanup' && item.status === 'completed'
  );
  const urls: string[] = [];
  for (const item of cleanupItems) {
    const result = item.result as { url?: string } | null;
    if (result?.url) urls.push(result.url);
  }
  return urls;
}

/** 批量生图规划：来自已审批的策划结果或独立工作流的导入提示词。 */
async function resolveBatchPlans(
  task: MarketingTask,
  input: Record<string, unknown>,
  stepResults: Record<string, Record<string, unknown>>
) {
  const planningResult = stepResults.prompt_planning?.result as
    | { plans?: { kind: 'main_image' | 'detail_page'; index: number; keyword?: string; prompt: string; negativePrompt?: string }[] }
    | undefined;
  if (planningResult?.plans?.length) return planningResult.plans;

  const imported = input.prompts as
    | { kind: 'main_image' | 'detail_page'; index: number; keyword?: string; prompt: string; negativePrompt?: string }[]
    | undefined;
  if (imported?.length) return imported;

  throw new Marketing2Error('STEP_DEPENDENCY_MISSING', '缺少提示词规划或导入提示词', {
    httpStatus: 409,
  });
}

/** 参考图：净化图 > 任务参考图输入 > 原图。 */
async function resolveReferenceImages(
  task: MarketingTask,
  input: Record<string, unknown>
): Promise<string[]> {
  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId: task.id, stepKey: 'background_cleanup', status: 'completed' },
  });
  const cleaned: string[] = [];
  for (const item of items) {
    const result = item.result as { url?: string } | null;
    if (result?.url) cleaned.push(result.url);
  }
  if (cleaned.length > 0) return cleaned;

  const referenceImages = input.referenceImages as string[] | undefined;
  if (referenceImages?.length) return referenceImages;

  return (input.productImages as string[]) ?? [];
}

/** 质检对象：批次生成的最新资产，或独立工作流输入的 assetIds。 */
async function resolveQualityTargets(
  task: MarketingTask,
  input: Record<string, unknown>,
  existingItems: MarketingTaskItem[]
) {
  let assetIds: string[] = [];

  const inputAssetIds = input.assetIds as string[] | undefined;
  if (inputAssetIds?.length) {
    assetIds = inputAssetIds;
  } else {
    const assets = await prisma.asset.findMany({
      where: { marketingTaskId: task.id, stepKey: 'batch_generation' },
      orderBy: { createdAt: 'asc' },
    });
    // 同一来源资产只质检最新版本
    const latestByParent = new Map<string, (typeof assets)[number]>();
    for (const asset of assets) {
      const key = asset.parentAssetId ?? asset.id;
      latestByParent.set(key, asset);
    }
    assetIds = [...latestByParent.values()].map((asset) => asset.id);
  }

  // 返修产生的新资产也要质检（复检）
  const repairedAssets = await prisma.asset.findMany({
    where: { marketingTaskId: task.id, stepKey: 'quality_repair' },
    orderBy: { createdAt: 'asc' },
  });
  for (const asset of repairedAssets) {
    if (!assetIds.includes(asset.id)) assetIds.push(asset.id);
  }

  // 已有未完成质检的资产跳过
  const pendingKinds = new Set(
    existingItems
      .filter(
        (item) =>
          item.stepKey === 'quality_repair' &&
          item.kind.startsWith('quality_check:') &&
          ['pending', 'running', 'completed'].includes(item.status)
      )
      .map((item) => item.kind.slice('quality_check:'.length))
  );
  const fresh = assetIds.filter((assetId) => !pendingKinds.has(assetId));
  if (fresh.length === 0 && existingItems.some((item) => item.kind.startsWith('quality_check:'))) {
    return [];
  }

  const targets: { assetId: string; url: string }[] = [];
  for (const assetId of fresh) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId: task.userId },
    });
    if (!asset) continue;
    const { getAssetUrl } = await import('@/lib/utils');
    targets.push({ assetId, url: getAssetUrl(asset.filepath) });
  }
  return targets;
}

// --------------------------------------------
// 审批步骤（含编辑结果校验与质检门禁）
// --------------------------------------------

const approveBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    edits: z.unknown().optional(),
    overrides: z
      .array(z.object({ assetId: z.string(), reason: z.string().trim().min(1).max(200) }))
      .max(50)
      .optional(),
  })
  .strict();

export async function approveStep(
  userId: string,
  taskId: string,
  stepKey: string,
  rawBody: unknown,
  idempotencyKey: string
) {
  if (!idempotencyKey) {
    throw new Marketing2Error('IDEMPOTENCY_KEY_MISSING', '请求必须携带 Idempotency-Key', {
      httpStatus: 400,
    });
  }
  const body = approveBodySchema.safeParse(rawBody);
  if (!body.success) {
    throw new Marketing2Error('INPUT_INVALID', '审批请求格式不正确', {
      fieldErrors: zodFieldErrors(body.error),
    });
  }

  const context = await loadContext(userId, taskId, stepKey, body.data.expectedVersion);
  const { task, workflow, step, items, stepStates } = context;

  const state = stepStates[stepKey];
  if (state === 'approved') {
    return { task, deduplicated: true };
  }
  if (state !== 'awaiting_review' && state !== 'failed') {
    throw new Marketing2Error('STEP_STATE_INVALID', `步骤当前状态为 ${state}，不能审批`, {
      httpStatus: 409,
    });
  }

  // 组装步骤结果：items 结果聚合 + 用户编辑覆盖（仅接受通过 Schema 的字段）
  const stepItems = items.filter((item) => item.stepKey === stepKey);
  let result = aggregateStepResult(stepKey, stepItems);

  if (body.data.edits !== undefined) {
    result = validateStepEdits(stepKey, result, body.data.edits);
  }

  // 质检门禁：failed 必须返修或人工豁免（交互 6.5）
  if (stepKey === 'quality_repair') {
    result = applyQualityGate(result, body.data.overrides ?? [], stepItems);
  }

  const stepResults = ((task.stepResults as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  stepResults[stepKey] = {
    approved: true,
    version: ((stepResults[stepKey] as { version?: number } | undefined)?.version ?? 0) + 1,
    approvedAt: new Date().toISOString(),
    idempotencyKey,
    result,
  };

  const nextStep = nextStepAfter(workflow, step.key as Marketing2StepKey);
  const isLast = nextStep === null;

  await bumpTaskVersion(taskId, body.data.expectedVersion, {
    stepResults: stepResults as Prisma.InputJsonValue,
    status: isLast ? 'completed' : 'draft',
    currentStep: nextStep ?? stepKey,
    awaitingReview: false,
  });
  await appendTaskEvent(taskId, userId, 'step_approved', {
    stepKey,
    taskVersion: body.data.expectedVersion + 1,
  });
  if (isLast) {
    await appendTaskEvent(taskId, userId, 'task_completed', { stepKey });
  }

  return { task: await findOwnedTask(userId, taskId), deduplicated: false };
}

function aggregateStepResult(stepKey: string, stepItems: MarketingTaskItem[]): Record<string, unknown> {
  const completed = stepItems.filter((item) => item.status === 'completed' && item.result);
  switch (stepKey) {
    case 'material_validate':
    case 'visual_analysis':
    case 'prompt_planning':
      return (completed[0]?.result as Record<string, unknown>) ?? {};
    case 'background_cleanup': {
      const cleanedImages = completed.map((item) => {
        const result = item.result as Record<string, unknown>;
        return {
          sourceAssetId: result.sourceAssetId ?? '',
          derivedAssetId: result.derivedAssetId ?? '',
          url: result.url ?? '',
        };
      });
      return { cleanedImages };
    }
    case 'batch_generation':
      return {
        images: completed.map((item) => ({
          kind: item.kind,
          status: item.status,
          result: item.result,
        })),
        failedCount: stepItems.filter((item) => item.status === 'failed').length,
      };
    case 'quality_repair':
      return {
        checks: completed
          .filter((item) => item.kind.startsWith('quality_check:'))
          .map((item) => ({ assetId: item.kind.slice('quality_check:'.length), result: item.result })),
        repairs: completed
          .filter((item) => item.kind.startsWith('repair:'))
          .map((item) => ({ kind: item.kind, result: item.result })),
      };
    default:
      return {};
  }
}

function validateStepEdits(
  stepKey: string,
  base: Record<string, unknown>,
  edits: unknown
): Record<string, unknown> {
  // 用户编辑只接受通过对应 Schema 的字段，不允许任意 JSON 覆盖（交互 6.3）
  switch (stepKey) {
    case 'visual_analysis': {
      const parsed = z
        .object({
          appearanceLock: z.string().min(1).max(4000).optional(),
          visibleTexts: z.array(z.string()).optional(),
          risks: z.array(z.string()).optional(),
          pendingFacts: z.array(z.string()).optional(),
        })
        .strict()
        .safeParse(edits);
      if (!parsed.success) {
        throw new Marketing2Error('INPUT_INVALID', '视觉识别编辑字段不合法', {
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }
      return { ...base, ...parsed.data };
    }
    case 'prompt_planning': {
      const parsed = z
        .object({
          plans: z
            .array(
              z.object({
                kind: z.enum(['main_image', 'detail_page']),
                index: z.number().int().min(1).max(30),
                keyword: z.string().trim().max(60).default(''),
                responsibility: z.string().trim().max(300).default(''),
                sellPoint: z.string().trim().max(200).default(''),
                placeholderParams: z.array(z.string()).default([]),
                prompt: z.string().trim().min(1).max(4000),
                negativePrompt: z.string().trim().max(1000).optional(),
                textModules: z.array(z.string().trim().max(200)).default([]),
              })
            )
            .min(1)
            .max(30),
        })
        .strict()
        .safeParse(edits);
      if (!parsed.success) {
        throw new Marketing2Error('INPUT_INVALID', '提示词规划编辑字段不合法', {
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }
      return { ...base, plans: parsed.data.plans };
    }
    default:
      throw new Marketing2Error('STEP_STATE_INVALID', '该步骤不支持用户编辑', { httpStatus: 400 });
  }
}

/** 质检完成门禁：failed 项必须已返修或人工豁免。 */
function applyQualityGate(
  result: Record<string, unknown>,
  overrides: { assetId: string; reason: string }[],
  stepItems: MarketingTaskItem[]
): Record<string, unknown> {
  const checks = (result.checks as { assetId: string; result: unknown }[]) ?? [];
  const repairedAssetIds = new Set(
    stepItems
      .filter((item) => item.kind.startsWith('repair:') && item.status === 'completed')
      .map((item) => item.kind.split(':')[1])
  );

  const blocking: string[] = [];
  const reports: { assetId: string; report: QualityCheckResult }[] = [];

  for (const check of checks) {
    const parsed = qualityCheckResultSchema.safeParse(check.result);
    if (!parsed.success) {
      blocking.push(`资产 ${check.assetId} 质检结果不可解析`);
      continue;
    }
    const override = overrides.find((item) => item.assetId === check.assetId);
    const repaired = repairedAssetIds.has(check.assetId);
    const hasFailed = parsed.data.items.some((item) => item.status === 'failed');

    if (hasFailed && !override && !repaired) {
      blocking.push(`资产 ${check.assetId} 存在失败项且未返修或豁免`);
      reports.push({ assetId: check.assetId, report: parsed.data });
      continue;
    }

    const report: QualityCheckResult = {
      ...parsed.data,
      reviewedByUser: Boolean(override) || parsed.data.reviewedByUser,
      items: override
        ? parsed.data.items.map((item) =>
            item.status === 'failed' ? { ...item, status: 'manual_override' as const } : item
          )
        : parsed.data.items,
      overallStatus: hasFailed && (override || repaired) ? 'needs_review' : parsed.data.overallStatus,
    };
    reports.push({ assetId: check.assetId, report });
  }

  if (blocking.length > 0) {
    throw new Marketing2Error('STEP_STATE_INVALID', `质检门禁未通过：${blocking.join('；')}`, {
      httpStatus: 409,
    });
  }

  return { ...result, reports, overrides };
}

// --------------------------------------------
// 跳过步骤（仅 allowSkip）
// --------------------------------------------

export async function skipStep(
  userId: string,
  taskId: string,
  stepKey: string,
  options: { expectedVersion: number; reason: string; idempotencyKey: string }
) {
  if (!options.idempotencyKey) {
    throw new Marketing2Error('IDEMPOTENCY_KEY_MISSING', '请求必须携带 Idempotency-Key', {
      httpStatus: 400,
    });
  }
  const context = await loadContext(userId, taskId, stepKey, options.expectedVersion);
  const { task, workflow, step, stepStates } = context;

  if (!step.allowSkip) {
    throw new Marketing2Error('STEP_SKIP_FORBIDDEN', `步骤 ${step.title} 不允许跳过`, {
      httpStatus: 400,
    });
  }
  if (!options.reason.trim()) {
    throw new Marketing2Error('INPUT_INVALID', '跳过必须填写原因', {
      fieldErrors: { reason: ['跳过原因必填'] },
    });
  }
  const state = stepStates[stepKey];
  if (state === 'skipped') return { task, deduplicated: true };
  if (!['idle', 'awaiting_review', 'failed'].includes(state ?? 'idle')) {
    throw new Marketing2Error('STEP_STATE_INVALID', `步骤正在执行中，不能跳过`, {
      httpStatus: 409,
    });
  }

  const stepResults = ((task.stepResults as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  stepResults[stepKey] = {
    skipped: true,
    reason: options.reason.trim().slice(0, 300),
    skippedAt: new Date().toISOString(),
  };

  const nextStep = nextStepAfter(workflow, step.key as Marketing2StepKey);
  const isLast = nextStep === null;
  await bumpTaskVersion(taskId, options.expectedVersion, {
    stepResults: stepResults as Prisma.InputJsonValue,
    currentStep: nextStep ?? stepKey,
    awaitingReview: false,
    ...(isLast
      ? { status: 'completed' }
      : task.status === 'awaiting_review'
        ? { status: 'draft' }
        : {}),
  });
  await appendTaskEvent(taskId, userId, 'step_skipped', {
    stepKey,
    reason: options.reason.trim().slice(0, 200),
  });
  if (isLast) {
    await appendTaskEvent(taskId, userId, 'task_completed', { stepKey });
  }

  return { task: await findOwnedTask(userId, taskId), deduplicated: false };
}

// --------------------------------------------
// 单项重试
// --------------------------------------------

export async function retryItem(
  userId: string,
  taskId: string,
  itemId: string,
  idempotencyKey: string
) {
  if (!idempotencyKey) {
    throw new Marketing2Error('IDEMPOTENCY_KEY_MISSING', '请求必须携带 Idempotency-Key', {
      httpStatus: 400,
    });
  }
  // 归属校验：越权任务按不存在处理
  await findOwnedTask(userId, taskId);
  const item = await prisma.marketingTaskItem.findFirst({ where: { id: itemId, taskId } });
  if (!item) {
    throw new Marketing2Error('ITEM_NOT_FOUND', '子任务不存在或不属于当前任务', { httpStatus: 404 });
  }
  if (item.status === 'pending' || item.status === 'running') {
    return { item, deduplicated: true };
  }
  if (!['failed', 'cancelled'].includes(item.status)) {
    throw new Marketing2Error('ITEM_RETRY_FORBIDDEN', '仅失败或取消的子项可以重试', {
      httpStatus: 400,
    });
  }

  await prisma.marketingTaskItem.update({
    where: { id: itemId },
    data: {
      status: 'pending',
      error: null,
      attempts: 0,
      result: Prisma.JsonNull,
      startedAt: null,
      completedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      itemVersion: { increment: 1 },
    },
  });
  await prisma.marketingTask.update({
    where: { id: taskId },
    data: { status: 'running_step', awaitingReview: false, pausedAt: null },
  });
  await appendTaskEvent(taskId, userId, 'item_retried', { kind: item.kind, itemId }, itemId);

  return { item: await prisma.marketingTaskItem.findUniqueOrThrow({ where: { id: itemId } }), deduplicated: false };
}

// --------------------------------------------
// 暂停 / 继续（批量生图）
// --------------------------------------------

export async function setRunPaused(userId: string, taskId: string, paused: boolean) {
  const task = await findOwnedTask(userId, taskId);
  if (paused && task.status !== 'running_step') {
    throw new Marketing2Error('TASK_STATE_INVALID', '仅执行中的任务可以暂停', { httpStatus: 409 });
  }
  if (!paused && task.status !== 'running_step' && !task.pausedAt) {
    throw new Marketing2Error('TASK_STATE_INVALID', '任务未在暂停状态', { httpStatus: 409 });
  }
  await prisma.marketingTask.update({
    where: { id: taskId },
    data: { pausedAt: paused ? new Date() : null },
  });
  await appendTaskEvent(taskId, userId, paused ? 'run_paused' : 'run_resumed');
  return findOwnedTask(userId, taskId);
}

// --------------------------------------------
// 返修（质检失败项）
// --------------------------------------------

const repairBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    repairs: z
      .array(
        z.object({
          assetId: z.string().min(1),
          issueType: z.enum([
            'appearance_distortion',
            'text_garbled',
            'fabricated_params',
            'low_design_quality',
          ]),
        })
      )
      .min(1)
      .max(30),
  })
  .strict();

const REPAIR_INSTRUCTIONS: Record<string, string> = {
  appearance_distortion: '修复产品外观变形：恢复产品原有轮廓、比例与结构，保持材质与颜色一致',
  text_garbled: '修复画面中的乱码文字：替换为清晰、可读的规范文字排版，保持版式不变',
  fabricated_params: '移除画面中虚构的参数数值与认证标志，用占位区块替代，不得编造事实',
  low_design_quality: '提升整体设计质感：优化光影、构图与细节层次，保持产品主体不变',
};

export async function createRepairItems(
  userId: string,
  taskId: string,
  rawBody: unknown,
  idempotencyKey: string
) {
  if (!idempotencyKey) {
    throw new Marketing2Error('IDEMPOTENCY_KEY_MISSING', '请求必须携带 Idempotency-Key', {
      httpStatus: 400,
    });
  }
  const body = repairBodySchema.safeParse(rawBody);
  if (!body.success) {
    throw new Marketing2Error('INPUT_INVALID', '返修请求格式不正确', {
      fieldErrors: zodFieldErrors(body.error),
    });
  }
  const task = await findOwnedTask(userId, taskId);
  if (task.currentStep !== 'quality_repair') {
    throw new Marketing2Error('STEP_STATE_INVALID', '当前不在质检与返修阶段', { httpStatus: 409 });
  }

  const repairModelId = stepModelId(task, 'quality_repair', 'quality_repair:repair');
  await resolveMarketing2Model(userId, repairModelId, STEP_CAPABILITY_MATRIX['quality_repair:repair']);

  const created: MarketingTaskItem[] = [];
  for (const repair of body.data.repairs) {
    const asset = await prisma.asset.findFirst({
      where: { id: repair.assetId, userId, marketingTaskId: taskId },
    });
    if (!asset) {
      throw new Marketing2Error('ITEM_NOT_FOUND', '返修目标资产不存在或不属于当前任务', {
        httpStatus: 404,
      });
    }
    const kind = repairItemKind(repair.assetId, repair.issueType);
    const idemKey = `${taskId}:quality_repair:${idempotencyKey}:${kind}`;
    const existing = await prisma.marketingTaskItem.findUnique({ where: { idempotencyKey: idemKey } });
    if (existing) {
      created.push(existing);
      continue;
    }
    try {
      const item = await prisma.marketingTaskItem.create({
        data: {
          taskId,
          userId,
          kind,
          stepKey: 'quality_repair',
          modelId: repairModelId,
          status: 'pending',
          input: {
            assetId: repair.assetId,
            issueType: repair.issueType,
            instruction: REPAIR_INSTRUCTIONS[repair.issueType],
          } as Prisma.InputJsonValue,
          idempotencyKey: idemKey,
          maxAttempts: 2,
        },
      });
      created.push(item);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const duplicate = await prisma.marketingTaskItem.findUnique({ where: { idempotencyKey: idemKey } });
        if (duplicate) created.push(duplicate);
        continue;
      }
      throw error;
    }
  }

  await prisma.marketingTask.update({
    where: { id: taskId },
    data: { status: 'running_step', awaitingReview: false },
  });
  await appendTaskEvent(taskId, userId, 'step_started', {
    stepKey: 'quality_repair',
    action: 'repair',
    itemCount: created.length,
  });

  return { items: created };
}

/** 供导出服务使用的文件名构建。 */
export { buildImageFilename };
