import { z } from 'zod';

// ============================================
// 营销助手2契约 Schema（V2 4.2 / 交互 3）
// 每个 workflowKey 有独立输入/输出 Schema，
// 禁止共用未约束输入；数量规则与文件名清洗在此冻结。
// ============================================

// --------------------------------------------
// 错误码
// --------------------------------------------

export const MARKETING2_ERROR_CODES = [
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_DISABLED',
  'INPUT_INVALID',
  'IMAGE_LIMIT_EXCEEDED',
  'MODEL_NOT_FOUND',
  'MODEL_DISABLED',
  'MODEL_CAPABILITY_MISSING',
  'MODEL_TEST_REQUIRED',
  'MODEL_TEST_FAILED',
  'STEP_NOT_FOUND',
  'STEP_DEPENDENCY_MISSING',
  'STEP_STATE_INVALID',
  'STEP_SKIP_FORBIDDEN',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_KEY_MISSING',
  'ITEM_NOT_FOUND',
  'ITEM_RETRY_FORBIDDEN',
  'TASK_NOT_FOUND',
  'TASK_STATE_INVALID',
  'FORBIDDEN_FIELDS',
  'EXPORT_FAILED',
  'UPSTREAM_FAILED',
  'UPSTREAM_RATE_LIMITED',
  'OUTPUT_INVALID',
] as const;

export type Marketing2ErrorCode = (typeof MARKETING2_ERROR_CODES)[number];

export class Marketing2Error extends Error {
  readonly code: Marketing2ErrorCode;
  readonly httpStatus: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: Marketing2ErrorCode,
    message: string,
    options?: { httpStatus?: number; fieldErrors?: Record<string, string[]> }
  ) {
    super(message);
    this.name = 'Marketing2Error';
    this.code = code;
    this.httpStatus = options?.httpStatus ?? 400;
    this.fieldErrors = options?.fieldErrors;
  }
}

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// --------------------------------------------
// 数量规则（交互 6.1）
// --------------------------------------------

export const MAIN_IMAGE_COUNT_RANGE = { min: 1, max: 10 } as const;
export const DETAIL_PAGE_COUNT_RANGE = { min: 1, max: 20 } as const;
export const TOTAL_IMAGE_ITEM_LIMIT = 30;
export const PRODUCT_IMAGE_RANGE = { min: 1, max: 5 } as const;

/** 'auto' 或范围内整数；服务端与前端共同执行。 */
const countField = (range: { min: number; max: number }) =>
  z.union([z.literal('auto'), z.number().int().min(range.min).max(range.max)]);

export function resolveImageCounts(
  mainImageCount: number | 'auto',
  detailPageCount: number | 'auto'
): { main: number; detail: number } {
  const main = mainImageCount === 'auto' ? 5 : mainImageCount;
  const detail = detailPageCount === 'auto' ? 8 : detailPageCount;
  return { main, detail };
}

export function assertTotalImageLimit(main: number, detail: number): void {
  if (main + detail > TOTAL_IMAGE_ITEM_LIMIT) {
    throw new Marketing2Error(
      'IMAGE_LIMIT_EXCEEDED',
      `主图（${main}）与详情页（${detail}）合计 ${main + detail} 个，超过单次任务上限 ${TOTAL_IMAGE_ITEM_LIMIT} 个`,
      { fieldErrors: { mainImageCount: ['主图与详情页合计不能超过 30 个生图子项'] } }
    );
  }
}

// --------------------------------------------
// 文件名清洗与命名规则（交互 6.4）
// --------------------------------------------

/** 清洗产品名/关键词为安全文件名片段。 */
export function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 32);
  return cleaned || 'item';
}

export type MarketingImageKind = 'main_image' | 'detail_page';

/** 规则：[产品名]_主图_[序号]_[关键词].png，重名由调用方追加任务短 ID 与版本号。 */
export function buildImageFilename(options: {
  productName: string;
  kind: MarketingImageKind;
  index: number;
  keyword?: string;
  collisionSuffix?: string;
}): string {
  const product = sanitizeFilenamePart(options.productName);
  const kindLabel = options.kind === 'main_image' ? '主图' : '详情页';
  const keyword = sanitizeFilenamePart(options.keyword ?? '');
  const suffix = options.collisionSuffix ? `_${options.collisionSuffix}` : '';
  return `${product}_${kindLabel}_${options.index}_${keyword}${suffix}.png`;
}

// --------------------------------------------
// 共享输入片段
// --------------------------------------------

const productImageListSchema = z
  .array(z.string().min(1).max(2000))
  .min(PRODUCT_IMAGE_RANGE.min, { message: '至少需要 1 张产品图' })
  .max(PRODUCT_IMAGE_RANGE.max, { message: `最多上传 ${PRODUCT_IMAGE_RANGE.max} 张产品图` });

const platformSchema = z
  .enum(['taobao', 'tmall', 'jd', 'douyin', 'xiaohongshu', 'amazon', 'other'])
  .default('taobao');

const ratioSchema = z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional();

// --------------------------------------------
// 工作流 1：marketing2-image-detail-full
// --------------------------------------------

export const fullWorkflowInputSchema = z
  .object({
    productImages: productImageListSchema,
    primaryImageId: z.string().min(1).max(2000).optional(),
    cleanupEnabled: z.boolean().default(false),
    productName: z.string().trim().min(1, '产品名称必填').max(100),
    brandName: z.string().trim().max(80).optional(),
    category: z.string().trim().max(60).optional(),
    platform: platformSchema,
    language: z.string().min(2).max(10).default('zh-CN'),
    mainImageCount: countField(MAIN_IMAGE_COUNT_RANGE),
    detailPageCount: countField(DETAIL_PAGE_COUNT_RANGE),
    mainImageRatio: ratioSchema,
    detailPageRatio: ratioSchema,
    sellPoints: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    parameters: z.record(z.string(), z.string().max(200)).optional(),
    targetAudience: z.string().trim().max(200).optional(),
    scenes: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    positioning: z.string().trim().max(200).optional(),
    designStyle: z.string().trim().max(120).optional(),
    forbidden: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
    extraRequirements: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.primaryImageId && !value.productImages.includes(value.primaryImageId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['primaryImageId'],
        message: '主参考图必须来自已上传的产品图',
      });
    }
    if (value.mainImageCount !== 'auto' && value.detailPageCount !== 'auto') {
      const total = value.mainImageCount + value.detailPageCount;
      if (total > TOTAL_IMAGE_ITEM_LIMIT) {
        ctx.addIssue({
          code: 'custom',
          path: ['mainImageCount'],
          message: `主图与详情页合计 ${total} 个，超过单次任务上限 ${TOTAL_IMAGE_ITEM_LIMIT} 个`,
        });
      }
    }
  });

export type FullWorkflowInput = z.infer<typeof fullWorkflowInputSchema>;

/** V3 的模型选择只保存模型 ID；不同页面与不同图片互不继承。 */
export const marketing2V3ModelSelectionsSchema = z.object({
  backgroundCleanup: z.string().min(1).optional(),
  visualAnalysis: z.string().min(1).optional(),
  promptGeneration: z.string().min(1).optional(),
  imageGeneration: z.object({ items: z.record(z.string(), z.string().min(1)).default({}) }).default({ items: {} }),
  quality: z.object({ items: z.record(z.string(), z.string().min(1)).default({}) }).default({ items: {} }),
  repair: z.object({ items: z.record(z.string(), z.string().min(1)).default({}) }).default({ items: {} }),
});

export type Marketing2V3ModelSelections = z.infer<typeof marketing2V3ModelSelectionsSchema>;

// --------------------------------------------
// 步骤输出 Schema（审批时服务端只接受合法字段）
// --------------------------------------------

export const materialValidateOutputSchema = z.object({
  imageCount: z.number().int().min(0),
  warnings: z.array(z.string()).default([]),
  pendingParams: z.array(z.string()).default([]),
  checkedAt: z.string(),
});

export const backgroundCleanupOutputSchema = z.object({
  cleanedImages: z
    .array(
      z.object({
        sourceAssetId: z.string(),
        derivedAssetId: z.string(),
        url: z.string(),
      })
    )
    .default([]),
  modelSnapshot: z
    .object({ modelId: z.string(), name: z.string(), model: z.string() })
    .optional(),
});

export const visualAnalysisOutputSchema = z.object({
  appearanceLock: z.string().min(1, '外观锁定描述不能为空').max(4000),
  visibleTexts: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  structure: z.string().max(2000).default(''),
  risks: z.array(z.string()).default([]),
  pendingFacts: z.array(z.string()).default([]),
});

export const promptPlanItemSchema = z.object({
  kind: z.enum(['main_image', 'detail_page']),
  index: z.number().int().min(1).max(30),
  keyword: z.string().trim().max(60).default(''),
  responsibility: z.string().trim().max(300).default(''),
  sellPoint: z.string().trim().max(200).default(''),
  placeholderParams: z.array(z.string()).default([]),
  prompt: z.string().trim().min(1).max(4000),
  negativePrompt: z.string().trim().max(1000).optional(),
  textModules: z.array(z.string().trim().max(200)).default([]),
  generationParams: z.object({
    width: z.number().int().min(256).max(16384),
    height: z.number().int().min(256).max(16384),
    samples: z.number().int().min(1).max(4).default(1),
    steps: z.number().int().min(10).max(50).optional(),
    cfgScale: z.number().min(1).max(20).optional(),
    seed: z.number().int().min(0).optional(),
    resolution: z.enum(['1k', '2k', '4k']).optional(),
    aspect: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
  }).strict().optional(),
});

export const promptPlanningOutputSchema = z
  .object({
    appearanceLock: z.string().max(4000).optional(),
    plans: z.array(promptPlanItemSchema).min(1, '至少生成 1 条规划').max(TOTAL_IMAGE_ITEM_LIMIT),
  })
  .superRefine((value, ctx) => {
    const main = value.plans.filter((plan) => plan.kind === 'main_image').length;
    const detail = value.plans.filter((plan) => plan.kind === 'detail_page').length;
    if (main > MAIN_IMAGE_COUNT_RANGE.max) {
      ctx.addIssue({ code: 'custom', path: ['plans'], message: '主图数量超过 10 张上限' });
    }
    if (detail > DETAIL_PAGE_COUNT_RANGE.max) {
      ctx.addIssue({ code: 'custom', path: ['plans'], message: '详情页数量超过 20 页上限' });
    }
    if (value.plans.length > TOTAL_IMAGE_ITEM_LIMIT) {
      ctx.addIssue({ code: 'custom', path: ['plans'], message: '规划总数超过 30 上限' });
    }
  });

export type PromptPlanItem = z.infer<typeof promptPlanItemSchema>;
export type PromptPlanningOutput = z.infer<typeof promptPlanningOutputSchema>;

// --------------------------------------------
// 质检结果 Schema（交互 6.5）
// --------------------------------------------

export const QUALITY_CHECK_KEYS = [
  'appearance_consistency', // 外观一致性
  'subject_recognition', // 主体辨识度
  'fact_truthfulness', // 信息真实性
  'layout_and_text', // 版式与文字
  'detail_decision_chain', // 详情页决策链
  'visual_unity', // 视觉统一性
  'prop_subordination', // 道具从属性
  'safe_margin', // 安全边距
  'click_conversion', // 点击转化力
  'splice_fit', // 拼接适配度
] as const;

export type QualityCheckKey = (typeof QUALITY_CHECK_KEYS)[number];

export const qualityCheckItemSchema = z.object({
  key: z.enum(QUALITY_CHECK_KEYS),
  status: z.enum(['passed', 'warning', 'failed', 'manual_override']),
  score: z.number().min(0).max(10).optional(),
  evidence: z.string().max(500).optional(),
  modelId: z.string(),
  checkedAt: z.string(),
});

export const qualityCheckResultSchema = z.object({
  overallStatus: z.enum(['passed', 'needs_repair', 'needs_review']),
  items: z.array(qualityCheckItemSchema),
  blockingIssues: z.array(z.string()).default([]),
  reviewedByUser: z.boolean().default(false),
});

export type QualityCheckItem = z.infer<typeof qualityCheckItemSchema>;
export type QualityCheckResult = z.infer<typeof qualityCheckResultSchema>;

export const REPAIR_ISSUE_TYPES = [
  'appearance_distortion', // 外观变形
  'text_garbled', // 文字乱码
  'fabricated_params', // 虚构参数
  'low_design_quality', // 设计质感不足
] as const;

export type RepairIssueType = (typeof REPAIR_ISSUE_TYPES)[number];

// --------------------------------------------
// 工作流输入分发
// --------------------------------------------

export const WORKFLOW_KEYS = [
  'marketing2-image-detail-full',
] as const;

export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];

export type WorkflowInputMap = {
  'marketing2-image-detail-full': FullWorkflowInput;
};

/** 按 workflowKey 校验任务输入；非法时抛出带字段定位的 Marketing2Error。 */
export function parseWorkflowInput(workflowKey: string, input: unknown): unknown {
  const result = (() => {
    switch (workflowKey) {
      case 'marketing2-image-detail-full':
        return fullWorkflowInputSchema.safeParse(input);
      default:
        throw new Marketing2Error('WORKFLOW_NOT_FOUND', `未知工作流：${workflowKey}`, {
          httpStatus: 404,
        });
    }
  })();

  if (!result.success) {
    throw new Marketing2Error('INPUT_INVALID', '工作流输入校验失败', {
      fieldErrors: zodFieldErrors(result.error),
    });
  }
  return result.data;
}
