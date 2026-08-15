import { z } from 'zod';

type UnknownRecord = Record<string, unknown>;

const FIELD_ALIASES = {
  appearanceLock: [
    'appearanceLock',
    'appearance_lock',
    'appearance',
    'productAppearance',
    'product_appearance',
    'visualDescription',
    'visual_description',
    'description',
    'summary',
    '外观锁定描述',
    '外观描述',
    '产品外观',
    '产品描述',
  ],
  visibleTexts: ['visibleTexts', 'visible_texts', 'visibleText', 'texts', 'text', '可见文字', '文字'],
  materials: ['materials', 'material', '材质', '材质信息'],
  structure: ['structure', 'structuralFeatures', 'structural_features', '结构', '结构特征', '结构描述'],
  risks: ['risks', 'risk', '风险', '风险项'],
  pendingFacts: [
    'pendingFacts',
    'pending_facts',
    'uncertainFacts',
    'uncertain_facts',
    '待确认事实',
    '待确认项',
  ],
} as const;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapModelObject(value: unknown): UnknownRecord | null {
  let candidate = value;

  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(candidate)) {
      const records = candidate.filter(isRecord);
      if (records.length === 0 || records.length !== candidate.length) return null;
      candidate = Object.assign({}, ...records);
      continue;
    }

    if (!isRecord(candidate)) return null;
    const record = candidate;
    const wrapper = ['data', 'result', 'analysis'].find((key) => isRecord(record[key]));
    if (!wrapper) return record;
    candidate = record[wrapper];
  }

  return isRecord(candidate) ? candidate : null;
}

function pick(record: UnknownRecord, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null) return record[alias];
  }
  return undefined;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('；');
  return '';
}

function toTextList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values.map(toText).filter(Boolean);
}

/**
 * 兼容视觉模型常见的输出波动，只重组已返回事实，不补造产品信息。
 */
export function normalizeVisualAnalysisModelOutput(value: unknown): unknown {
  const record = unwrapModelObject(value);
  if (!record) return value;

  const visibleTexts = toTextList(pick(record, FIELD_ALIASES.visibleTexts));
  const materials = toTextList(pick(record, FIELD_ALIASES.materials));
  const structure = toText(pick(record, FIELD_ALIASES.structure));
  const risks = toTextList(pick(record, FIELD_ALIASES.risks));
  const pendingFacts = toTextList(pick(record, FIELD_ALIASES.pendingFacts));
  let appearanceLock = toText(pick(record, FIELD_ALIASES.appearanceLock));

  if (!appearanceLock) {
    appearanceLock = [
      structure && `结构：${structure}`,
      materials.length > 0 && `材质：${materials.join('、')}`,
      visibleTexts.length > 0 && `可见文字：${visibleTexts.join('、')}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join('；');
  }

  return {
    appearanceLock: appearanceLock || undefined,
    visibleTexts,
    materials,
    structure,
    risks,
    pendingFacts,
  };
}

export const visualAnalysisModelSchema = z.preprocess(
  normalizeVisualAnalysisModelOutput,
  z.object({
    appearanceLock: z.string().min(1).max(4000),
    visibleTexts: z.array(z.string()).default([]),
    materials: z.array(z.string()).default([]),
    structure: z.string().max(2000).default(''),
    risks: z.array(z.string()).default([]),
    pendingFacts: z.array(z.string()).default([]),
  })
);
