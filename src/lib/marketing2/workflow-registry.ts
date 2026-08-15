import type { ModelCapabilityKey } from '@/types/model-config';
import type { WorkflowKey } from '@/lib/marketing2/schemas';

// ============================================
// 营销助手2工作流注册表（V2 4.1 / 交互 3）
// 卡片、步骤、依赖与能力要求由版本化注册表统一定义，
// 前后端共用；前端不做最终能力与状态判定。
// ============================================

export type Marketing2StepKey =
  | 'material_validate'
  | 'background_cleanup'
  | 'visual_analysis'
  | 'prompt_planning'
  | 'batch_generation'
  | 'quality_repair';

export type Marketing2StepState =
  | 'idle'
  | 'running'
  | 'awaiting_review'
  | 'approved'
  | 'failed'
  | 'skipped';

export interface WorkflowStepDefinition {
  key: Marketing2StepKey;
  order: number;
  title: string;
  description: string;
  required: boolean;
  dependsOn: Marketing2StepKey[];
  requiredCapabilities: ModelCapabilityKey[];
  allowRetry: boolean;
  allowSkip: boolean;
}

export interface WorkflowCardDefinition {
  key: WorkflowKey;
  version: number;
  /** 是否可从 V3 首页新建；旧定义只用于打开历史任务。 */
  discoverable: boolean;
  title: string;
  description: string;
  requiredInputs: string[];
  optionalInputs: string[];
  outputTypes: string[];
  requiredCapabilities: ModelCapabilityKey[];
  importSources: string[];
  steps: WorkflowStepDefinition[];
}

export const MARKETING2_MODULE = 'marketing2-image-detail';

// --------------------------------------------
// 步骤能力矩阵（交互 7.2）
// --------------------------------------------

export const STEP_CAPABILITY_MATRIX: Record<string, ModelCapabilityKey[]> = {
  material_validate: [],
  background_cleanup: ['imageEditing', 'referenceImage'],
  visual_analysis: ['vision', 'jsonMode'],
  prompt_planning: ['jsonMode'],
  batch_generation: ['imageGeneration', 'referenceImage'],
  quality_repair: ['vision', 'jsonMode'],
  // 伪步骤 key：quality_repair 的返修模型单独选择
  'quality_repair:repair': ['imageEditing', 'referenceImage'],
};

export const CAPABILITY_LABELS: Record<ModelCapabilityKey, string> = {
  vision: '视觉输入',
  jsonMode: 'JSON 输出',
  ocr: 'OCR',
  imageGeneration: '图片生成',
  imageEditing: '图片编辑',
  referenceImage: '参考图',
};

function step(
  key: Marketing2StepKey,
  order: number,
  title: string,
  description: string,
  options: Partial<Pick<WorkflowStepDefinition, 'dependsOn' | 'allowSkip' | 'required'>> = {}
): WorkflowStepDefinition {
  return {
    key,
    order,
    title,
    description,
    required: options.required ?? true,
    dependsOn: options.dependsOn ?? [],
    requiredCapabilities: STEP_CAPABILITY_MATRIX[key],
    allowRetry: true,
    allowSkip: options.allowSkip ?? false,
  };
}

// --------------------------------------------
// 五张首期卡片（交互 3.1）
// --------------------------------------------

export const WORKFLOW_REGISTRY: WorkflowCardDefinition[] = [
  {
    key: 'marketing2-image-detail-full',
    version: 3,
    discoverable: true,
    title: '主图详情页全自动生成',
    description: '一次输入，沿五步完成产品图准备、视觉策划、逐张生图和质量验收。',
    requiredInputs: ['至少 1 张产品图', '产品基本信息'],
    optionalInputs: ['卖点', '参数', '目标人群', '设计风格', '禁止内容'],
    outputTypes: ['底图', '策划', '提示词', '营销图片', '质检报告'],
    requiredCapabilities: ['vision', 'jsonMode', 'imageGeneration', 'imageEditing', 'referenceImage'],
    importSources: [],
    steps: [
      step('material_validate', 1, '素材与参数', '校验产品图与关键参数，生成待补充参数位'),
      step('background_cleanup', 2, '底图净化', '去除背景杂物，保持产品外观一致；可记录原因后跳过', {
        dependsOn: ['material_validate'],
        allowSkip: true,
        required: false,
      }),
      step('visual_analysis', 3, '产品视觉识别', '外观锁定描述、可见文字、材质结构与风险', {
        dependsOn: ['material_validate'],
      }),
      step('prompt_planning', 4, '策划与提示词', '主图规划、详情页规划与逐张提示词', {
        dependsOn: ['visual_analysis'],
      }),
      step('batch_generation', 5, '分批生图', '按提示词顺序生成主图与详情页，支持单项重试', {
        dependsOn: ['prompt_planning'],
      }),
      step('quality_repair', 6, '质检与返修', '十项结构化质检、返修与复检', {
        dependsOn: ['batch_generation'],
      }),
    ],
  },
  {
    key: 'marketing2-background-cleanup',
    version: 1,
    discoverable: false,
    title: '底图净化',
    description: '上传或选择产品图，净化背景并保持产品外观，生成派生底图。',
    requiredInputs: ['至少 1 张产品图'],
    optionalInputs: ['净化指令'],
    outputTypes: ['净化底图', '模型快照'],
    requiredCapabilities: ['imageEditing', 'referenceImage'],
    importSources: ['history_task'],
    steps: [
      step('material_validate', 1, '上传/选择图片', '校验图片来源与格式'),
      step('background_cleanup', 2, '净化', '图片编辑模型净化背景，原图只读保留；可记录原因后跳过', {
        dependsOn: ['material_validate'],
        allowSkip: true,
        required: false,
      }),
    ],
  },
  {
    key: 'marketing2-prompt-planning',
    version: 1,
    discoverable: false,
    title: '视觉策划与提示词',
    description: '基于产品图或底图做视觉识别，输出外观锁定描述与逐张提示词。',
    requiredInputs: ['产品图或底图', '产品参数'],
    optionalInputs: ['平台', '语言', '卖点'],
    outputTypes: ['外观锁定描述', '主图规划', '详情页规划', '提示词'],
    requiredCapabilities: ['vision', 'jsonMode'],
    importSources: ['history_task', 'background_cleanup'],
    steps: [
      step('material_validate', 1, '素材与参数', '校验图片与产品参数'),
      step('visual_analysis', 2, '产品视觉识别', '外观锁定与事实状态识别', {
        dependsOn: ['material_validate'],
      }),
      step('prompt_planning', 3, '策划与提示词', '生成主图与详情页规划及逐张提示词', {
        dependsOn: ['visual_analysis'],
      }),
    ],
  },
  {
    key: 'marketing2-batch-generation',
    version: 1,
    discoverable: false,
    title: '批量生图',
    description: '基于提示词或历史策划结果与参考图，批量生成主图/详情页图片。',
    requiredInputs: ['提示词或历史策划结果', '参考图'],
    optionalInputs: ['比例', '负面提示词'],
    outputTypes: ['主图/详情页图片资产'],
    requiredCapabilities: ['imageGeneration', 'referenceImage'],
    importSources: ['history_task', 'prompt_planning'],
    steps: [
      step('material_validate', 1, '批次配置', '校验提示词与参考图'),
      step('batch_generation', 2, '生成', '按并发上限拆分执行，支持单项重试与暂停继续', {
        dependsOn: ['material_validate'],
      }),
    ],
  },
  {
    key: 'marketing2-quality-repair',
    version: 1,
    discoverable: false,
    title: '质检与返修',
    description: '对已生成图片执行十项质检，失败项返修或人工豁免，并复检。',
    requiredInputs: ['已生成图片'],
    optionalInputs: ['产品名'],
    outputTypes: ['质检报告', '返修图', '复检结果'],
    requiredCapabilities: ['vision', 'jsonMode', 'imageEditing', 'referenceImage'],
    importSources: ['history_task', 'batch_generation'],
    steps: [
      step('material_validate', 1, '素材校验', '校验待质检图片'),
      step('quality_repair', 2, '质检、修复、复检', '结构化质检 → 返修 → 复检闭环', {
        dependsOn: ['material_validate'],
      }),
    ],
  },
];

// --------------------------------------------
// 查询辅助
// --------------------------------------------

export function getWorkflow(key: string): WorkflowCardDefinition | undefined {
  return WORKFLOW_REGISTRY.find((workflow) => workflow.key === key);
}

export function getWorkflowStep(
  workflowKey: string,
  stepKey: string
): WorkflowStepDefinition | undefined {
  return getWorkflow(workflowKey)?.steps.find((item) => item.key === stepKey);
}

/** 依赖步骤必须处于 approved 或 skipped 才能执行当前步骤。 */
export function stepDependenciesMet(
  workflow: WorkflowCardDefinition,
  stepKey: Marketing2StepKey,
  stepStates: Record<string, Marketing2StepState>
): { ok: boolean; missing: string[] } {
  const definition = workflow.steps.find((item) => item.key === stepKey);
  if (!definition) return { ok: false, missing: [stepKey] };
  const missing = definition.dependsOn.filter((dep) => {
    const state = stepStates[dep] ?? 'idle';
    return state !== 'approved' && state !== 'skipped';
  });
  return { ok: missing.length === 0, missing };
}

// --------------------------------------------
// Item kind 约定（V2 6.2）
// --------------------------------------------

export const ITEM_KINDS = {
  materialValidate: 'material_validate',
  backgroundCleanup: 'background_cleanup',
  visualAnalysis: 'visual_analysis',
  promptPlanning: 'prompt_planning',
  promptOutline: 'prompt_outline',
} as const;

export function promptPlanItemKind(kind: 'main_image' | 'detail_page', index: number): string {
  return `prompt_plan:${kind}:${index}`;
}

export function mainImageItemKind(index: number): string {
  return `main_image:${index}`;
}

export function detailPageItemKind(index: number): string {
  return `detail_page:${index}`;
}

export function qualityCheckItemKind(assetId: string): string {
  return `quality_check:${assetId}`;
}

export function repairItemKind(assetId: string, issueType: string): string {
  return `repair:${assetId}:${issueType}`;
}

export function parseItemKind(kind: string):
  | { type: 'main_image' | 'detail_page'; index: number }
  | { type: 'prompt_plan'; kind: 'main_image' | 'detail_page'; index: number }
  | { type: 'quality_check'; assetId: string }
  | { type: 'repair'; assetId: string; issueType: string }
  | { type: 'simple'; key: string } {
  if (kind.startsWith('main_image:')) {
    return { type: 'main_image', index: Number(kind.slice('main_image:'.length)) };
  }
  if (kind.startsWith('detail_page:')) {
    return { type: 'detail_page', index: Number(kind.slice('detail_page:'.length)) };
  }
  if (kind.startsWith('prompt_plan:')) {
    const [, planKind, rawIndex] = kind.split(':');
    if (planKind === 'main_image' || planKind === 'detail_page') {
      return { type: 'prompt_plan', kind: planKind, index: Number(rawIndex) };
    }
  }
  if (kind.startsWith('quality_check:')) {
    return { type: 'quality_check', assetId: kind.slice('quality_check:'.length) };
  }
  if (kind.startsWith('repair:')) {
    const [, assetId, issueType] = kind.split(':');
    return { type: 'repair', assetId, issueType };
  }
  return { type: 'simple', key: kind };
}
