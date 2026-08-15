import {
  DETAIL_PAGE_COUNT_RANGE,
  MAIN_IMAGE_COUNT_RANGE,
} from '@/lib/marketing2/schemas';

export type PromptPlanKind = 'main_image' | 'detail_page';

export interface PromptSlotDefinition {
  kind: PromptPlanKind;
  index: number;
  title: string;
  responsibility: string;
  sellPoint: string;
}

const MAIN_SLOT_TEMPLATES: Omit<PromptSlotDefinition, 'kind' | 'index'>[] = [
  { title: '首屏核心卖点', responsibility: '在首屏清晰呈现产品主体与核心卖点', sellPoint: '核心卖点' },
  { title: '外观角色特写', responsibility: '突出产品外观、角色或核心结构细节', sellPoint: '外观识别' },
  { title: '材质工艺细节', responsibility: '展示材质、工艺和做工可信度', sellPoint: '材质工艺' },
  { title: '使用场景搭配', responsibility: '通过真实使用场景说明产品的适用方式', sellPoint: '使用场景' },
  { title: '包装配件展示', responsibility: '完整展示包装、配件和购买决策信息', sellPoint: '包装配件' },
];

const DETAIL_SLOT_TEMPLATES: Omit<PromptSlotDefinition, 'kind' | 'index'>[] = [
  { title: '详情页首屏', responsibility: '总结产品定位和最重要的购买理由', sellPoint: '核心卖点总结' },
  { title: '角色设计详解', responsibility: '从正面或关键视角拆解角色和外观设计', sellPoint: '角色设计' },
  { title: '趣味元素解析', responsibility: '放大产品中的趣味元素和陪伴感', sellPoint: '趣味元素' },
  { title: '材质工艺说明', responsibility: '说明材质、工艺与使用安全相关信息', sellPoint: '安全材质' },
  { title: '耐用性测试模拟', responsibility: '用可信场景表达产品的耐用性与可靠性', sellPoint: '耐用可靠' },
  { title: '尺寸规格参照', responsibility: '用直观比例和参照物说明尺寸规格', sellPoint: '尺寸规格' },
  { title: '多种佩戴方式', responsibility: '演示不同佩戴、摆放或使用方式', sellPoint: '使用指南' },
  { title: '售后购买须知', responsibility: '清晰呈现售后保障、清洁和购买注意事项', sellPoint: '售后保障' },
];

function normalizeCount(
  value: unknown,
  fallback: number,
  range: { min: number; max: number }
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function createSlots(
  kind: PromptPlanKind,
  count: number,
  templates: Omit<PromptSlotDefinition, 'kind' | 'index'>[]
): PromptSlotDefinition[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const template = templates[offset] ?? {
      title: `${kind === 'main_image' ? '主图' : '详情页'}补充方案 ${index}`,
      responsibility: `补充第 ${index} 个${kind === 'main_image' ? '主图' : '详情页'}表达，避免与其他方案重复`,
      sellPoint: '补充卖点',
    };
    return { kind, index, ...template };
  });
}

export function getPromptSlotDefinitions(
  mainCount: unknown,
  detailCount: unknown
): PromptSlotDefinition[] {
  const main = normalizeCount(mainCount, 5, MAIN_IMAGE_COUNT_RANGE);
  const detail = normalizeCount(detailCount, 8, DETAIL_PAGE_COUNT_RANGE);
  return [
    ...createSlots('main_image', main, MAIN_SLOT_TEMPLATES),
    ...createSlots('detail_page', detail, DETAIL_SLOT_TEMPLATES),
  ];
}

export function promptSlotKey(kind: PromptPlanKind, index: number): string {
  return `${kind}:${index}`;
}
