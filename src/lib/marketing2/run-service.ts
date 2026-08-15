import { prisma } from '@/lib/db/prisma';
import { appendTaskEvent } from '@/lib/marketing/async/aggregation';
import { validateModelForDraft } from '@/lib/marketing2/model-routing';
import {
  Marketing2Error,
  marketing2V3ModelSelectionsSchema,
  parseWorkflowInput,
  zodFieldErrors,
} from '@/lib/marketing2/schemas';
import {
  getWorkflow,
  MARKETING2_MODULE,
  STEP_CAPABILITY_MATRIX,
  WORKFLOW_REGISTRY,
  type Marketing2StepKey,
  type Marketing2StepState,
  type WorkflowCardDefinition,
} from '@/lib/marketing2/workflow-registry';
import { toCapabilities } from '@/lib/model-configs';
import type { MarketingTask, MarketingTaskItem, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ModelCapabilityKey } from '@/types/model-config';

// ============================================
// 营销助手2运行服务（V2 7 / 8）
// 服务端是任务与步骤状态的唯一来源：
// 创建草稿不自动执行；PATCH 使用 taskVersion 乐观锁；
// 越权一律按资源不存在处理。
// ============================================

export const MARKETING2_TASK_STATUSES = [
  'draft',
  'running_step',
  'awaiting_review',
  'partial_failed',
  'failed',
  'completed',
  'cancelled',
] as const;

export type Marketing2TaskStatus = (typeof MARKETING2_TASK_STATUSES)[number];

// --------------------------------------------
// 创建任务（只创建草稿，不自动执行）
// --------------------------------------------

const createRunSchema = z
  .object({
    workflowKey: z.string().min(1),
    workflowVersion: z.number().int().min(1).optional(),
    title: z.string().trim().max(120).optional(),
    input: z.unknown(),
    stepModels: z.unknown().default({}),
  })
  .strict();

export interface CreateMarketing2RunRequest {
  workflowKey: string;
  workflowVersion?: number;
  title?: string;
  input: unknown;
  stepModels: Record<string, unknown>;
}

export async function createRun(userId: string, rawRequest: unknown) {
  const parsed = createRunSchema.safeParse(rawRequest);
  if (!parsed.success) {
    throw new Marketing2Error('INPUT_INVALID', '创建请求格式不正确', {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }
  const request = parsed.data;

  const workflow = getWorkflow(request.workflowKey);
  if (!workflow) {
    throw new Marketing2Error('WORKFLOW_NOT_FOUND', `未知工作流：${request.workflowKey}`, {
      httpStatus: 404,
    });
  }

  // 拒绝前端传入密钥或完整配置（V2 2.2 / 12.2）
  rejectForbiddenFields(request.input);
  rejectForbiddenFields(request.stepModels);

  const input = parseWorkflowInput(workflow.key, request.input);

  await validateDraftModels(userId, request.stepModels, request.workflowVersion ?? workflow.version);

  const inputRecord = input as Record<string, unknown>;
  const productName =
    typeof inputRecord.productName === 'string' && inputRecord.productName
      ? inputRecord.productName
      : workflow.title;
  const productImages = Array.isArray(inputRecord.productImages)
    ? (inputRecord.productImages as string[])
    : [];
  const platform = typeof inputRecord.platform === 'string' ? inputRecord.platform : 'taobao';
  const language = typeof inputRecord.language === 'string' ? inputRecord.language : 'zh-CN';

  const firstStep = workflow.steps[0];

  const task = await prisma.marketingTask.create({
    data: {
      userId,
      module: MARKETING2_MODULE,
      workflowKey: workflow.key,
      workflowVersion: request.workflowVersion ?? workflow.version,
      productName: request.title ?? productName,
      productImages,
      platform,
      language,
      input: input as Prisma.InputJsonValue,
      stepModels: request.stepModels as Prisma.InputJsonValue,
      stepResults: {},
      currentStep: firstStep.key,
      taskVersion: 1,
      status: 'draft',
    },
  });

  await appendTaskEvent(task.id, userId, 'workflow_created', {
    workflowKey: workflow.key,
    workflowVersion: task.workflowVersion,
    taskVersion: 1,
  });

  return task;
}

/** 禁止前端传入密钥或完整模型配置。 */
function rejectForbiddenFields(value: unknown, path = 'input'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenFields(item, `${path}[${index}]`));
    return;
  }
    const forbidden = ['apiKey', 'api_key', 'apikey', 'secret', 'token', 'authorization', 'baseUrl', 'baseURL', 'systemPrompt', 'instructionOverride'];
  for (const key of Object.keys(value)) {
    if (forbidden.includes(key.toLowerCase())) {
      throw new Marketing2Error(
        'FORBIDDEN_FIELDS',
        `不允许提交敏感字段：${key}`,
        { fieldErrors: { [`${path}.${key}`]: ['禁止传入密钥类字段'] } }
      );
    }
    rejectForbiddenFields((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

// --------------------------------------------
// 更新草稿（乐观锁）
// --------------------------------------------

const patchRunSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().max(120).optional(),
    input: z.unknown().optional(),
    stepModels: z.unknown().optional(),
  })
  .strict();

export async function updateRun(userId: string, taskId: string, rawBody: unknown) {
  const parsed = patchRunSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new Marketing2Error('INPUT_INVALID', '更新请求格式不正确', {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }
  const body = parsed.data;

  const task = await findOwnedTask(userId, taskId);

  if (['completed', 'cancelled'].includes(task.status)) {
    throw new Marketing2Error('TASK_STATE_INVALID', '任务已结束，不能再编辑', { httpStatus: 409 });
  }

  const data: Prisma.MarketingTaskUpdateInput = {};

  if (body.title !== undefined) data.productName = body.title;

  if (body.input !== undefined) {
    // 只允许在尚未执行任何步骤时整体替换输入（当前阶段可编辑字段）
    const itemCount = await prisma.marketingTaskItem.count({ where: { taskId } });
    if (itemCount > 0 && task.status !== 'draft') {
      throw new Marketing2Error(
        'STEP_STATE_INVALID',
        '已有步骤开始执行，不能再整体修改任务输入',
        { httpStatus: 409 }
      );
    }
    rejectForbiddenFields(body.input);
    if (!task.workflowKey) {
      throw new Marketing2Error('WORKFLOW_NOT_FOUND', '任务缺少工作流信息', { httpStatus: 500 });
    }
    data.input = parseWorkflowInput(task.workflowKey, body.input) as Prisma.InputJsonValue;
    const inputRecord = data.input as unknown as Record<string, unknown>;
    if (Array.isArray(inputRecord.productImages)) {
      data.productImages = inputRecord.productImages as string[];
    }
  }

  if (body.stepModels !== undefined) {
    rejectForbiddenFields(body.stepModels);
    await validateDraftModels(userId, body.stepModels, task.workflowVersion);
    data.stepModels = body.stepModels as Prisma.InputJsonValue;
  }

  // 乐观锁：仅当 taskVersion 匹配时更新
  const result = await prisma.marketingTask.updateMany({
    where: { id: taskId, userId, taskVersion: body.expectedVersion },
    data: { ...data, taskVersion: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new Marketing2Error('VERSION_CONFLICT', '任务已被其它操作更新，请刷新后重试', {
      httpStatus: 409,
    });
  }

  return prisma.marketingTask.findUniqueOrThrow({ where: { id: taskId } });
}

async function validateDraftModels(userId: string, rawModels: unknown, workflowVersion: number): Promise<void> {
  if (!rawModels || typeof rawModels !== 'object' || Array.isArray(rawModels)) {
    throw new Marketing2Error('INPUT_INVALID', '模型选择格式不正确');
  }
  if (workflowVersion >= 3) {
    const parsed = marketing2V3ModelSelectionsSchema.safeParse(rawModels);
    if (!parsed.success) {
      throw new Marketing2Error('INPUT_INVALID', 'V3 模型选择格式不正确', { fieldErrors: zodFieldErrors(parsed.error) });
    }
    const selections = parsed.data;
    const checks: Array<[string | undefined, ModelCapabilityKey[]]> = [
      [selections.backgroundCleanup, STEP_CAPABILITY_MATRIX.background_cleanup],
      [selections.visualAnalysis, STEP_CAPABILITY_MATRIX.visual_analysis],
      [selections.promptGeneration, STEP_CAPABILITY_MATRIX.prompt_planning],
      ...Object.values(selections.imageGeneration.items).map((id) => [id, STEP_CAPABILITY_MATRIX.batch_generation] as [string, ModelCapabilityKey[]]),
      ...Object.values(selections.quality.items).map((id) => [id, STEP_CAPABILITY_MATRIX.quality_repair] as [string, ModelCapabilityKey[]]),
      ...Object.values(selections.repair.items).map((id) => [id, STEP_CAPABILITY_MATRIX['quality_repair:repair']] as [string, ModelCapabilityKey[]]),
    ];
    for (const [modelId, capabilities] of checks) if (modelId) await validateModelForDraft(userId, modelId, capabilities);
    return;
  }
  for (const [stepKey, modelId] of Object.entries(rawModels as Record<string, unknown>)) {
    if (typeof modelId === 'string' && modelId) {
      await validateModelForDraft(userId, modelId, (STEP_CAPABILITY_MATRIX[stepKey] ?? []) as ModelCapabilityKey[]);
    }
  }
}

const patchModelSelectionsSchema = z.object({
  expectedVersion: z.number().int().min(1),
  changes: z.array(z.object({ scopeKey: z.string().min(1).max(200), modelId: z.string().min(1) })).min(1).max(30),
}).strict();

/**
 * V3 选择器的细粒度保存。每个 scopeKey 只更新自己的键，批量操作只是多条独立写入。
 * 这里不接收模型名称、地址或密钥，执行时仍会再次从设置库解析模型。
 */
export async function patchV3ModelSelections(userId: string, taskId: string, rawBody: unknown) {
  const parsed = patchModelSelectionsSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new Marketing2Error('INPUT_INVALID', '模型选择请求格式不正确', { fieldErrors: zodFieldErrors(parsed.error) });
  }
  const task = await findOwnedTask(userId, taskId);
  if (task.workflowVersion < 3) {
    throw new Marketing2Error('STEP_STATE_INVALID', '历史任务不使用 V3 模型选择结构', { httpStatus: 409 });
  }
  if (task.taskVersion !== parsed.data.expectedVersion) {
    throw new Marketing2Error('VERSION_CONFLICT', '任务已被其它操作更新，请刷新后重试', { httpStatus: 409 });
  }

  const selections = marketing2V3ModelSelectionsSchema.parse(task.stepModels ?? {});
  for (const change of parsed.data.changes) {
    const capabilities = selectionCapabilities(change.scopeKey);
    await validateModelForDraft(userId, change.modelId, capabilities);
    if (change.scopeKey === 'backgroundCleanup') selections.backgroundCleanup = change.modelId;
    else if (change.scopeKey === 'visualAnalysis') selections.visualAnalysis = change.modelId;
    else if (change.scopeKey === 'promptGeneration') selections.promptGeneration = change.modelId;
    else if (change.scopeKey.startsWith('imageGeneration:')) selections.imageGeneration.items[change.scopeKey.slice(16)] = change.modelId;
    else if (change.scopeKey.startsWith('quality:')) selections.quality.items[change.scopeKey.slice(8)] = change.modelId;
    else if (change.scopeKey.startsWith('repair:')) selections.repair.items[change.scopeKey.slice(7)] = change.modelId;
    else throw new Marketing2Error('INPUT_INVALID', `未知模型选择范围：${change.scopeKey}`);
  }

  const result = await prisma.marketingTask.updateMany({
    where: { id: taskId, userId, taskVersion: parsed.data.expectedVersion },
    data: { stepModels: selections as Prisma.InputJsonValue, taskVersion: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new Marketing2Error('VERSION_CONFLICT', '任务已被其它操作更新，请刷新后重试', { httpStatus: 409 });
  }
  await appendTaskEvent(taskId, userId, 'model_selection_changed', {
    scopes: parsed.data.changes.map((item) => item.scopeKey),
    taskVersion: parsed.data.expectedVersion + 1,
  });
  return prisma.marketingTask.findUniqueOrThrow({ where: { id: taskId } });
}

function selectionCapabilities(scopeKey: string): ModelCapabilityKey[] {
  if (scopeKey === 'backgroundCleanup') return STEP_CAPABILITY_MATRIX.background_cleanup;
  if (scopeKey === 'visualAnalysis') return STEP_CAPABILITY_MATRIX.visual_analysis;
  if (scopeKey === 'promptGeneration') return STEP_CAPABILITY_MATRIX.prompt_planning;
  if (scopeKey.startsWith('imageGeneration:')) return STEP_CAPABILITY_MATRIX.batch_generation;
  if (scopeKey.startsWith('quality:')) return STEP_CAPABILITY_MATRIX.quality_repair;
  if (scopeKey.startsWith('repair:')) return STEP_CAPABILITY_MATRIX['quality_repair:repair'];
  throw new Marketing2Error('INPUT_INVALID', `未知模型选择范围：${scopeKey}`);
}

// --------------------------------------------
// 查询
// --------------------------------------------

export async function findOwnedTask(userId: string, taskId: string): Promise<MarketingTask> {
  const task = await prisma.marketingTask.findFirst({
    where: { id: taskId, userId, module: MARKETING2_MODULE },
  });
  if (!task) {
    throw new Marketing2Error('TASK_NOT_FOUND', '任务不存在或不属于当前用户', { httpStatus: 404 });
  }
  return task;
}

/** 计算各步骤交互状态。 */
export function computeStepStates(
  task: MarketingTask,
  items: MarketingTaskItem[]
): Record<string, Marketing2StepState> {
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const states: Record<string, Marketing2StepState> = {};

  for (const step of getWorkflow(task.workflowKey ?? '')?.steps ?? []) {
    const saved = stepResults[step.key];
    if (saved?.approved === true) {
      states[step.key] = 'approved';
      continue;
    }
    if (saved?.skipped === true) {
      states[step.key] = 'skipped';
      continue;
    }

    const stepItems = items.filter((item) => item.stepKey === step.key);
    if (stepItems.length === 0) {
      states[step.key] = 'idle';
      continue;
    }
    if (stepItems.some((item) => item.status === 'running' || item.status === 'pending')) {
      states[step.key] = 'running';
      continue;
    }
    const hasFailed = stepItems.some((item) => item.status === 'failed');
    const hasCompleted = stepItems.some((item) => item.status === 'completed');
    if (hasFailed && hasCompleted) {
      states[step.key] = 'failed';
    } else if (hasFailed) {
      states[step.key] = 'failed';
    } else if (hasCompleted) {
      states[step.key] = 'awaiting_review';
    } else {
      states[step.key] = 'idle';
    }
  }
  return states;
}

export async function getRunDetail(userId: string, taskId: string) {
  const task = await findOwnedTask(userId, taskId);
  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
  const assets = await prisma.asset.findMany({
    where: { marketingTaskId: taskId },
    orderBy: { createdAt: 'asc' },
  });
  const events = await prisma.marketingTaskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    task,
    items,
    assets,
    events,
    stepStates: computeStepStates(task, items),
  };
}

export interface ListRunsFilters {
  status?: string[];
  workflowKey?: string;
  cursor?: string;
  limit?: number;
}

export async function listRuns(userId: string, filters: ListRunsFilters) {
  const limit = Math.min(filters.limit ?? 20, 50);
  const where: Prisma.MarketingTaskWhereInput = {
    userId,
    module: MARKETING2_MODULE,
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.workflowKey ? { workflowKey: filters.workflowKey } : {}),
    ...(filters.cursor ? { createdAt: { lt: new Date(filters.cursor) } } : {}),
  };

  const runs = await prisma.marketingTask.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = runs.length > limit;
  const page = hasMore ? runs.slice(0, limit) : runs;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return {
    runs: page.map((task) => ({
      id: task.id,
      workflowKey: task.workflowKey,
      title: task.productName,
      status: task.status,
      currentStep: task.currentStep,
      taskVersion: task.taskVersion,
      awaitingReview: task.awaitingReview,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
    nextCursor,
  };
}

// --------------------------------------------
// 卡片中心状态（交互 4.2）
// --------------------------------------------

export async function listWorkflowCards(userId: string) {
  const models = await prisma.modelConfig.findMany({
    where: { userId, isActive: true },
  });
  const capabilitiesList = models.map((model) => toCapabilities(model.capabilities));

  const recentRuns = await prisma.marketingTask.groupBy({
    by: ['workflowKey', 'status'],
    where: { userId, module: MARKETING2_MODULE, workflowKey: { not: null } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });

  return WORKFLOW_REGISTRY
    .filter((workflow) => workflow.discoverable)
    .map((workflow) => buildCardStatus(workflow, capabilitiesList, recentRuns));
}

type GroupedRun = {
  workflowKey: string | null;
  status: string;
  _count: { _all: number };
  _max: { updatedAt: Date | null };
};

function buildCardStatus(
  workflow: WorkflowCardDefinition,
  capabilitiesList: ReturnType<typeof toCapabilities>[],
  groupedRuns: GroupedRun[]
) {
  // 每步能力是否都有模型满足（声明能力即可；实测状态由运行前把关并在卡片提示）
  const stepCapabilityStatus = workflow.steps.map((step) => {
    const required = STEP_CAPABILITY_MATRIX[step.key] as ModelCapabilityKey[];
    if (required.length === 0) return { stepKey: step.key, satisfied: true, missing: [] as string[] };
    const satisfied = capabilitiesList.some((capabilities) =>
      required.every((key) => capabilities[key])
    );
    return {
      stepKey: step.key,
      satisfied,
      missing: satisfied ? [] : required,
    };
  });

  const missingCapabilities = [
    ...new Set(stepCapabilityStatus.flatMap((item) => item.missing)),
  ] as ModelCapabilityKey[];

  const runs = groupedRuns.filter((item) => item.workflowKey === workflow.key);
  const resumable = runs
    .filter((item) => ['draft', 'awaiting_review', 'running_step', 'partial_failed'].includes(item.status))
    .reduce((sum, item) => sum + item._count._all, 0);
  const completed = runs
    .filter((item) => item.status === 'completed')
    .reduce((sum, item) => sum + item._count._all, 0);

  let cardStatus: 'ready' | 'needs_models' | 'resumable' | 'has_history' | 'unavailable';
  if (missingCapabilities.length > 0) {
    cardStatus = 'needs_models';
  } else if (resumable > 0) {
    cardStatus = 'resumable';
  } else if (completed > 0) {
    cardStatus = 'has_history';
  } else {
    cardStatus = 'ready';
  }

  return {
    key: workflow.key,
    version: workflow.version,
    title: workflow.title,
    description: workflow.description,
    requiredInputs: workflow.requiredInputs,
    optionalInputs: workflow.optionalInputs,
    outputTypes: workflow.outputTypes,
    importSources: workflow.importSources,
    steps: workflow.steps.map((step) => ({
      key: step.key,
      order: step.order,
      title: step.title,
      requiredCapabilities: step.requiredCapabilities,
      allowSkip: step.allowSkip,
    })),
    cardStatus,
    missingCapabilities,
    resumableCount: resumable,
    completedCount: completed,
    settingsUrl: '/settings',
  };
}

// --------------------------------------------
// 共享：下一个未开始步骤
// --------------------------------------------

export function nextStepAfter(
  workflow: WorkflowCardDefinition,
  stepKey: Marketing2StepKey
): Marketing2StepKey | null {
  const index = workflow.steps.findIndex((step) => step.key === stepKey);
  if (index < 0 || index >= workflow.steps.length - 1) return null;
  return workflow.steps[index + 1].key;
}
