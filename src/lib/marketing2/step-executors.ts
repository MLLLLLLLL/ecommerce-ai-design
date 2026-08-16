import type { MarketingTask, MarketingTaskItem } from '@prisma/client';
import { z } from 'zod';
import { completeJSON } from '@/lib/ai/json-response';
import {
  buildImageFilename,
  Marketing2Error,
  PRODUCT_IMAGE_RANGE,
  type QualityCheckResult,
} from '@/lib/marketing2/schemas';
import {
  buildModelSnapshot,
  createImageAdapter,
  createTextClient,
  resolveMarketing2Model,
  type ResolvedMarketing2Model,
} from '@/lib/marketing2/model-routing';
import {
  createDerivedAsset,
  fetchGeneratedImage,
  resolveImageToDataURL,
} from '@/lib/marketing2/asset-versioning';
import { parseItemKind, STEP_CAPABILITY_MATRIX } from '@/lib/marketing2/workflow-registry';
import { getPromptSlotDefinitions, type PromptPlanKind, type PromptSlotDefinition } from '@/lib/marketing2/prompt-planning';
import { visualAnalysisModelSchema } from '@/lib/marketing2/visual-analysis';
import { qualityCheckModelSchema, QUALITY_CHECK_REPAIR_PROMPT } from '@/lib/marketing2/quality-check';
import { prisma } from '@/lib/db/prisma';
import { getAssetUrl } from '@/lib/utils';
import type { ModelCapabilityKey } from '@/types/model-config';

// ============================================
// 营销助手2步骤执行器（V2 9）
// Worker 领取 item 后派发到此处；模型在服务端解析（含密钥解密
// 与能力门禁），图片结果一律创建派生资产版本。
// ============================================

function itemInput(item: MarketingTaskItem): Record<string, unknown> {
  return (item.input as Record<string, unknown>) ?? {};
}

function ratioToSize(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case '3:4':
      return { width: 768, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '9:16':
      return { width: 576, height: 1024 };
    case '16:9':
      return { width: 1024, height: 576 };
    default:
      return { width: 1024, height: 1024 };
  }
}

async function resolveItemModel(
  item: MarketingTaskItem,
  capabilityKey: string
): Promise<ResolvedMarketing2Model> {
  const capabilities = (STEP_CAPABILITY_MATRIX[capabilityKey] ?? []) as ModelCapabilityKey[];
  return resolveMarketing2Model(item.userId, item.modelId ?? '', capabilities);
}

export async function executeMarketing2Item(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<unknown> {
  const parsed = parseItemKind(item.kind);

  switch (parsed.type) {
    case 'simple':
      switch (parsed.key) {
        case 'material_validate':
          return executeMaterialValidate(task);
        case 'background_cleanup':
          return executeBackgroundCleanup(task, item);
        case 'visual_analysis':
          return executeVisualAnalysis(task, item);
        case 'prompt_planning':
          return executePromptPlanning(task, item);
        case 'prompt_outline':
          return executePromptOutline(task, item);
        default:
          throw new Marketing2Error('STEP_NOT_FOUND', `未知的 item 类型：${item.kind}`);
      }
    case 'prompt_plan':
      return executePromptPlan(task, item, parsed.kind, parsed.index);
    case 'main_image':
    case 'detail_page':
      return executeImageGeneration(task, item, parsed.type, parsed.index);
    case 'quality_check':
      return executeQualityCheck(task, item, parsed.assetId);
    case 'repair':
      return executeRepair(task, item, parsed.assetId, parsed.issueType);
  }
}

// --------------------------------------------
// material_validate：输入校验与风险提示（不调用模型）
// --------------------------------------------

async function executeMaterialValidate(task: MarketingTask): Promise<Record<string, unknown>> {
  const input = (task.input as Record<string, unknown>) ?? {};
  const warnings: string[] = [];
  const pendingParams: string[] = [];

  const images = Array.isArray(input.productImages) ? (input.productImages as string[]) : [];
  if (images.length < PRODUCT_IMAGE_RANGE.min) {
    throw new Marketing2Error('INPUT_INVALID', '至少需要 1 张产品图', {
      fieldErrors: { productImages: ['至少需要 1 张产品图'] },
    });
  }
  if (images.length > PRODUCT_IMAGE_RANGE.max) {
    throw new Marketing2Error('INPUT_INVALID', `最多 ${PRODUCT_IMAGE_RANGE.max} 张产品图`);
  }

  // 服务端文件可达性校验
  let reachable = 0;
  for (const url of images) {
    try {
      await resolveImageToDataURL(url);
      reachable += 1;
    } catch {
      warnings.push(`图片不可读取：${url.slice(0, 80)}`);
    }
  }
  if (reachable === 0) {
    throw new Marketing2Error('INPUT_INVALID', '所有产品图都无法读取，请重新上传');
  }

  // 关键参数为空时生成待补充参数位，不得补造数值（交互 6.1）
  const keyFields: [string, string][] = [
    ['productName', '产品名称'],
    ['sellPoints', '核心卖点'],
    ['parameters', '产品参数'],
    ['targetAudience', '目标人群'],
  ];
  for (const [field, label] of keyFields) {
    const value = input[field];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
    if (empty) pendingParams.push(label);
  }

  if (pendingParams.length > 0) {
    warnings.push(`以下关键参数待补充：${pendingParams.join('、')}（不会自动补造数值）`);
  }

  return {
    imageCount: images.length,
    warnings,
    pendingParams,
    checkedAt: new Date().toISOString(),
  };
}

// --------------------------------------------
// background_cleanup：图片编辑净化
// --------------------------------------------

async function executeBackgroundCleanup(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<Record<string, unknown>> {
  const input = itemInput(item);
  const image = String(input.image ?? '');
  const index = Number(input.index ?? 0);
  const instruction = String(input.instruction ?? '');

  const model = await resolveItemModel(item, 'background_cleanup');
  const adapter = createImageAdapter(model);
  const imageDataUrl = await resolveImageToDataURL(image);

  const prompt = [
    '净化这张产品图的背景：去除背景中的杂物、水印与无关元素，保留干净简洁的背景。',
    '必须完整保持产品的品类、轮廓、比例、结构、颜色、材质、Logo、包装与所有可见细节。',
    instruction ? `附加要求：${instruction}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const urls = await adapter.imageToImage({
    image: imageDataUrl,
    prompt,
    width: 1024,
    height: 1024,
    samples: 1,
    strength: 0.35,
  });
  if (!urls.length) throw new Marketing2Error('UPSTREAM_FAILED', '净化未返回图片', { httpStatus: 502 });

  const buffer = await fetchGeneratedImage(urls[0]);
  const snapshot = buildModelSnapshot(model);
  const productName = task.productName || '产品';
  const { asset, url } = await createDerivedAsset({
    userId: item.userId,
    taskId: task.id,
    stepKey: 'background_cleanup',
    buffer,
    filename: `${productName}_净化底图_${index + 1}.png`,
    derivedReason: 'background_cleanup',
    prompt,
    modelSnapshot: snapshot,
    parameters: { sourceImage: image, index },
  });

  return {
    sourceImage: image,
    derivedAssetId: asset.id,
    url,
    index,
    modelSnapshot: snapshot,
  };
}

// --------------------------------------------
// visual_analysis：视觉识别（vision + jsonMode）
// --------------------------------------------

async function executeVisualAnalysis(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<Record<string, unknown>> {
  const input = itemInput(item);
  const images = (input.images as string[]) ?? [];
  if (images.length === 0) {
    throw new Marketing2Error('INPUT_INVALID', '缺少可分析的图片');
  }

  const model = await resolveItemModel(item, 'visual_analysis');
  const client = createTextClient(model);

  const imageParts = await Promise.all(
    images.slice(0, 5).map(async (reference) => ({
      type: 'image_url' as const,
      image_url: { url: await resolveImageToDataURL(reference) },
    }))
  );

  const taskInput = (task.input as Record<string, unknown>) ?? {};
  const result = await completeJSON(
    client,
    {
      messages: [
        {
          role: 'system',
          content:
            '你是电商产品视觉分析专家。只描述图片中可见的事实，不推测参数与销量。' +
            '输出外观锁定描述（供后续生图保持产品一致），并列出可见文字、材质、结构、风险与待确认事实。' +
            '顶层必须是一个 JSON 对象，不能输出数组；appearanceLock 必须是非空字符串，其余字段也不得省略。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `产品名称：${taskInput.productName ?? task.productName}\n` +
                '请输出 JSON：{"appearanceLock": string, "visibleTexts": string[], "materials": string[], ' +
                '"structure": string, "risks": string[], "pendingFacts": string[]}',
            },
            ...imageParts,
          ],
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.2,
      maxTokens: 3000,
    },
    visualAnalysisModelSchema,
    {
      label: '产品视觉识别',
      repair: true,
      repairPrompt:
        '你是电商产品视觉识别 JSON 结构修复器。只输出一个合法 JSON 对象，包含 appearanceLock、visibleTexts、materials、structure、risks、pendingFacts。将同义字段映射到这些字段，只重组原响应已有的可见事实，不要补造产品信息，不要 Markdown、解释或代码围栏。',
    }
  );

  return { ...result, modelSnapshot: buildModelSnapshot(model) };
}

// --------------------------------------------
// prompt_planning：先生成框架，再逐张生成提示词（jsonMode）
// --------------------------------------------

const promptPlanFieldsSchema = z.object({
  keyword: z.string().max(60).default(''),
  responsibility: z.string().max(300).default(''),
  sellPoint: z.string().max(200).default(''),
  placeholderParams: z.array(z.string()).default([]),
  prompt: z.string().min(1).max(4000),
  negativePrompt: z.string().max(1000).optional(),
  textModules: z.array(z.string().max(200)).default([]),
});

const promptOutlineModelSchema = z.object({
  slots: z.array(z.object({
    kind: z.enum(['main_image', 'detail_page']),
    index: z.number().int().min(1),
    title: z.string().max(100).default(''),
    responsibility: z.string().max(300).default(''),
    sellPoint: z.string().max(200).default(''),
  })).min(1).max(30),
});

const promptPlanModelSchema = z.object({ plan: promptPlanFieldsSchema });

function taskInput(task: MarketingTask): Record<string, unknown> {
  return (task.input as Record<string, unknown>) ?? {};
}

function visualAppearanceLock(task: MarketingTask): string {
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const analysis = (stepResults.visual_analysis?.result as Record<string, unknown>) ?? {};
  return typeof analysis.appearanceLock === 'string' ? analysis.appearanceLock : '';
}

async function executePromptOutline(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<Record<string, unknown>> {
  const input = taskInput(task);
  const slots = getPromptSlotDefinitions(input.mainImageCount, input.detailPageCount);
  const model = await resolveItemModel(item, 'prompt_planning');
  const client = createTextClient(model);
  const result = await completeJSON(
    client,
    {
      messages: [
        {
          role: 'system',
          content: '你是电商视觉策划专家。只优化给定的图片方案框架，不新增图片数量，不编造产品参数。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            productName: input.productName ?? task.productName,
            platform: input.platform,
            language: input.language,
            sellPoints: input.sellPoints ?? [],
            parameters: input.parameters ?? {},
            targetAudience: input.targetAudience ?? '',
            designStyle: input.designStyle ?? '',
            forbidden: input.forbidden ?? [],
            appearanceLock: visualAppearanceLock(task),
            slots,
            instruction: '严格返回 JSON：{"slots":[{"kind":"main_image"|"detail_page","index":number,"title":string,"responsibility":string,"sellPoint":string}]}。必须覆盖输入中的每个 slot。',
          }, null, 2),
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.4,
      maxTokens: 1600,
    },
    promptOutlineModelSchema,
    { label: '主图与详情页方案框架' }
  );

  const generated = new Map(
    result.slots.map((slot) => [`${slot.kind}:${slot.index}`, slot])
  );
  return {
    appearanceLock: visualAppearanceLock(task),
    slots: slots.map((slot) => ({
      ...slot,
      ...(generated.get(`${slot.kind}:${slot.index}`) ?? {}),
    })),
    modelSnapshot: buildModelSnapshot(model),
  };
}

async function executePromptPlan(
  task: MarketingTask,
  item: MarketingTaskItem,
  kind: PromptPlanKind,
  index: number
): Promise<Record<string, unknown>> {
  const input = taskInput(task);
  const itemData = itemInput(item);
  const fallbackSlot = getPromptSlotDefinitions(input.mainImageCount, input.detailPageCount)
    .find((slot) => slot.kind === kind && slot.index === index);
  const slot = (itemData.outline as PromptSlotDefinition | undefined) ?? fallbackSlot;
  if (!slot) throw new Marketing2Error('INPUT_INVALID', `缺少第 ${index} 个${kind === 'main_image' ? '主图' : '详情页'}方案框架`);

  const model = await resolveItemModel(item, 'prompt_planning');
  const client = createTextClient(model);
  const result = await completeJSON(
    client,
    {
      messages: [
        {
          role: 'system',
          content: '你是电商生图提示词专家。只为当前一个图片方案生成可直接使用的提示词，不编造产品参数，不输出其他方案。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            productName: input.productName ?? task.productName,
            platform: input.platform,
            language: input.language,
            sellPoints: input.sellPoints ?? [],
            parameters: input.parameters ?? {},
            targetAudience: input.targetAudience ?? '',
            designStyle: input.designStyle ?? '',
            forbidden: input.forbidden ?? [],
            appearanceLock: visualAppearanceLock(task),
            slot,
            instruction: '严格返回 JSON：{"plan":{"keyword":string,"responsibility":string,"sellPoint":string,"placeholderParams":string[],"prompt":string,"negativePrompt":string,"textModules":string[]}}。prompt 必须包含主体、构图、光线、背景、风格和产品一致性约束。',
          }, null, 2),
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.5,
      maxTokens: 2400,
    },
    promptPlanModelSchema,
    { label: `${kind === 'main_image' ? '主图' : '详情页'} ${index} 提示词` }
  );

  return { kind, index, title: slot.title, ...result.plan, modelSnapshot: buildModelSnapshot(model) };
}

const promptPlanningModelSchema = z.object({
  plans: z
    .array(
      z.object({
        kind: z.enum(['main_image', 'detail_page']),
        index: z.number().int().min(1),
        keyword: z.string().max(60).default(''),
        responsibility: z.string().max(300).default(''),
        sellPoint: z.string().max(200).default(''),
        placeholderParams: z.array(z.string()).default([]),
        prompt: z.string().min(1).max(4000),
        negativePrompt: z.string().max(1000).optional(),
        textModules: z.array(z.string().max(200)).default([]),
      })
    )
    .min(1)
    .max(30),
});

async function executePromptPlanning(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<Record<string, unknown>> {
  void item;
  const taskInput = (task.input as Record<string, unknown>) ?? {};
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const analysis = (stepResults.visual_analysis?.result as Record<string, unknown>) ?? {};
  // 未审批时也允许读取 item 最新结果（独立工作流）
  const fallbackAnalysis = analysis.appearanceLock
    ? analysis
    : await latestStepResult(task.id, 'visual_analysis');

  const model = await resolveItemModel(item, 'prompt_planning');
  const client = createTextClient(model);

  const mainCount = normalizeCount(taskInput.mainImageCount, 5);
  const detailCount = normalizeCount(taskInput.detailPageCount, 8);

  const result = await completeJSON(
    client,
    {
      messages: [
        {
          role: 'system',
          content:
            '你是电商主图与详情页策划专家。基于外观锁定描述策划图片方案，' +
            '逐张输出职责、卖点、占位参数与可直接生图的提示词。不得编造参数数值，缺失参数放入 placeholderParams。',
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              productName: taskInput.productName ?? task.productName,
              platform: taskInput.platform,
              language: taskInput.language,
              sellPoints: taskInput.sellPoints ?? [],
              parameters: taskInput.parameters ?? {},
              targetAudience: taskInput.targetAudience ?? '',
              designStyle: taskInput.designStyle ?? '',
              forbidden: taskInput.forbidden ?? [],
              appearanceLock: fallbackAnalysis?.appearanceLock ?? '',
              requiredMainImages: mainCount,
              requiredDetailPages: detailCount,
              instruction:
                '输出 JSON：{"plans":[{"kind":"main_image"|"detail_page","index":number,"keyword":string,' +
                '"responsibility":string,"sellPoint":string,"placeholderParams":string[],"prompt":string,' +
                '"negativePrompt":string,"textModules":string[]}]}，主图 index 从 1 开始，详情页 index 从 1 开始。',
            },
            null,
            2
          ),
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.5,
      maxTokens: 6000,
    },
    promptPlanningModelSchema,
    { label: '主图与详情页策划' }
  );

  return {
    appearanceLock: (fallbackAnalysis?.appearanceLock as string) ?? '',
    plans: result.plans,
    modelSnapshot: buildModelSnapshot(model),
  };
}

function normalizeCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

async function latestStepResult(
  taskId: string,
  stepKey: string
): Promise<Record<string, unknown> | null> {
  const item = await prisma.marketingTaskItem.findFirst({
    where: { taskId, stepKey, status: 'completed' },
    orderBy: { completedAt: 'desc' },
  });
  return (item?.result as Record<string, unknown>) ?? null;
}

// --------------------------------------------
// main_image / detail_page：批量生图
// --------------------------------------------

async function executeImageGeneration(
  task: MarketingTask,
  item: MarketingTaskItem,
  kind: 'main_image' | 'detail_page',
  index: number
): Promise<Record<string, unknown>> {
  const input = itemInput(item);
  const prompt = String(input.prompt ?? '');
  const negativePrompt = String(input.negativePrompt ?? '');
  const keyword = String(input.keyword ?? '');
  const productName = String(input.productName ?? task.productName ?? '产品');
  const referenceImages = (input.referenceImages as string[]) ?? [];
  const ratio = String(input.ratio ?? '1:1');
  const generationParams = (input.generationParams as {
    width?: number;
    height?: number;
    samples?: number;
    steps?: number;
    cfgScale?: number;
    seed?: number;
    resolution?: '1k' | '2k' | '4k';
    aspect?: string;
  } | undefined) ?? {};

  if (!prompt.trim()) {
    throw new Marketing2Error('INPUT_INVALID', `第 ${index} 张提示词为空`);
  }

  const model = await resolveItemModel(item, 'batch_generation');
  const adapter = createImageAdapter(model);
  const fallbackSize = ratioToSize(ratio);
  const width = generationParams.width ?? fallbackSize.width;
  const height = generationParams.height ?? fallbackSize.height;
  const samples = Math.min(4, Math.max(1, generationParams.samples ?? 1));
  const requestParams = {
    width,
    height,
    samples,
    steps: generationParams.steps,
    cfgScale: generationParams.cfgScale,
    seed: generationParams.seed,
  };

  let urls: string[];
  if (referenceImages.length > 0) {
    // 参考图生成：走图生图通道并携带参考图
    const reference = await resolveImageToDataURL(referenceImages[0]);
    urls = await adapter.imageToImage({
      image: reference,
      prompt,
      negativePrompt: negativePrompt || undefined,
      ...requestParams,
      strength: 0.6,
    });
  } else {
    urls = await adapter.textToImage({
      prompt,
      negativePrompt: negativePrompt || undefined,
      ...requestParams,
    });
  }
  if (!urls.length) {
    throw new Marketing2Error('UPSTREAM_FAILED', '生成未返回图片', { httpStatus: 502 });
  }

  const snapshot = buildModelSnapshot(model);

  // 父级资产：参考图中属于本任务的净化底图
  let parentAssetId: string | null = null;
  if (referenceImages.length > 0) {
    const parent = await prisma.asset.findFirst({
      where: { marketingTaskId: task.id, stepKey: 'background_cleanup' },
      orderBy: { createdAt: 'asc' },
    });
    parentAssetId = parent?.id ?? null;
  }

  const assets = [];
  for (const [outputIndex, url] of urls.slice(0, samples).entries()) {
    const buffer = await fetchGeneratedImage(url);
    const filename = buildImageFilename({
      productName,
      kind,
      index,
      keyword,
      collisionSuffix: outputIndex > 0 ? String(outputIndex + 1) : undefined,
    });
    const created = await createDerivedAsset({
      userId: item.userId,
      taskId: task.id,
      stepKey: 'batch_generation',
      buffer,
      filename,
      derivedReason: kind === 'main_image' ? '主图生成' : '详情页生成',
      parentAssetId,
      prompt,
      negativePrompt: negativePrompt || null,
      modelSnapshot: snapshot,
      parameters: { ratio, keyword, index, referenceImages, generationParams },
    });
    assets.push({ asset: created.asset, url: created.url, filename: created.asset.filename });
  }

  const first = assets[0];

  return {
    kind,
    index,
    assetId: first.asset.id,
    url: first.url,
    filename: first.filename,
    assetIds: assets.map((entry) => entry.asset.id),
    urls: assets.map((entry) => entry.url),
    filenames: assets.map((entry) => entry.filename),
    generationParams,
    modelSnapshot: snapshot,
  };
}

// --------------------------------------------
// quality_check：十项结构化质检（vision + jsonMode）
// --------------------------------------------

const QUALITY_CHECK_LABELS: Record<string, string> = {
  appearance_consistency: '外观一致性：产品外观与外观锁定描述一致',
  subject_recognition: '主体辨识度：产品主体清晰可识别',
  fact_truthfulness: '信息真实性：不含虚构参数与认证',
  layout_and_text: '版式与文字：文字清晰、排版规范',
  detail_decision_chain: '详情页决策链：信息顺序支持购买决策',
  visual_unity: '视觉统一性：与同任务其它图片风格一致',
  prop_subordination: '道具从属性：道具不喧宾夺主',
  safe_margin: '安全边距：主体与文字不被裁切',
  click_conversion: '点击转化力：卖点突出、吸引点击',
  splice_fit: '拼接适配度：适配详情页长图拼接',
};

async function executeQualityCheck(
  task: MarketingTask,
  item: MarketingTaskItem,
  assetId: string
): Promise<QualityCheckResult> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: item.userId },
  });
  if (!asset) {
    throw new Marketing2Error('ITEM_NOT_FOUND', '质检目标资产不存在', { httpStatus: 404 });
  }

  const model = await resolveItemModel(item, 'quality_repair');
  const client = createTextClient(model);
  const imageDataUrl = await resolveImageToDataURL(getAssetUrl(asset.filepath));

  const result = await completeJSON(
    client,
    {
      messages: [
        {
          role: 'system',
          content:
            '你是电商图片质检专家。对图片逐项检查并给出 passed/warning/failed 与证据，' +
            '只基于可见内容判断，不得臆测。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `任务：${task.productName}\n检查项（全部输出）：\n` +
                Object.entries(QUALITY_CHECK_LABELS)
                  .map(([key, label]) => `- ${key}: ${label}`)
                  .join('\n') +
                '\n输出 JSON：{"items":[{"key":string,"status":"passed"|"warning"|"failed","score":number,"evidence":string}]}',
            },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.1,
      maxTokens: 3000,
    },
    qualityCheckModelSchema,
    {
      label: '十项质检',
      repair: true,
      repairPrompt: QUALITY_CHECK_REPAIR_PROMPT,
    }
  );

  const checkedAt = new Date().toISOString();
  const items = result.items.map((check) => ({
    ...check,
    modelId: model.id,
    checkedAt,
  }));
  const hasFailed = items.some((check) => check.status === 'failed');
  const hasWarning = items.some((check) => check.status === 'warning');

  return {
    overallStatus: hasFailed ? 'needs_repair' : hasWarning ? 'needs_review' : 'passed',
    items,
    blockingIssues: items
      .filter((check) => check.status === 'failed')
      .map((check) => `${QUALITY_CHECK_LABELS[check.key] ?? check.key}：${check.evidence ?? ''}`),
    reviewedByUser: false,
  };
}

// --------------------------------------------
// repair：返修（imageEditing + referenceImage）
// --------------------------------------------

async function executeRepair(
  task: MarketingTask,
  item: MarketingTaskItem,
  assetId: string,
  issueType: string
): Promise<Record<string, unknown>> {
  const input = itemInput(item);
  const instruction = String(input.instruction ?? '按质检意见返修');

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: item.userId },
  });
  if (!asset) {
    throw new Marketing2Error('ITEM_NOT_FOUND', '返修目标资产不存在', { httpStatus: 404 });
  }

  const model = await resolveItemModel(item, 'quality_repair:repair');
  const adapter = createImageAdapter(model);
  const imageDataUrl = await resolveImageToDataURL(getAssetUrl(asset.filepath));

  const prompt = `${instruction}。保持产品主体、品类、外观与整体版式不变。`;
  const urls = await adapter.imageToImage({
    image: imageDataUrl,
    prompt,
    width: asset.width ?? 1024,
    height: asset.height ?? 1024,
    samples: 1,
    strength: 0.4,
  });
  if (!urls.length) {
    throw new Marketing2Error('UPSTREAM_FAILED', '返修未返回图片', { httpStatus: 502 });
  }

  const buffer = await fetchGeneratedImage(urls[0]);
  const snapshot = buildModelSnapshot(model);
  const ext = asset.filename.includes('.') ? asset.filename.split('.').pop() : 'png';
  const stem = asset.filename.replace(/\.[^.]+$/, '');
  const { asset: derived, url } = await createDerivedAsset({
    userId: item.userId,
    taskId: task.id,
    stepKey: 'quality_repair',
    buffer,
    filename: `${stem}_返修_${issueType}.${ext}`,
    derivedReason: `repair:${issueType}`,
    parentAssetId: asset.id,
    prompt,
    modelSnapshot: snapshot,
    parameters: { issueType, sourceAssetId: asset.id },
  });

  return {
    sourceAssetId: asset.id,
    derivedAssetId: derived.id,
    issueType,
    url,
    modelSnapshot: snapshot,
  };
}
