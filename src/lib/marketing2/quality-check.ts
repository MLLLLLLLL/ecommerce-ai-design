import { z } from 'zod';

export const QUALITY_CHECK_KEYS = [
  'appearance_consistency',
  'subject_recognition',
  'fact_truthfulness',
  'layout_and_text',
  'detail_decision_chain',
  'visual_unity',
  'prop_subordination',
  'safe_margin',
  'click_conversion',
  'splice_fit',
] as const;

export type QualityCheckKey = (typeof QUALITY_CHECK_KEYS)[number];

const KEY_ALIASES: Record<string, QualityCheckKey> = {
  appearanceConsistency: 'appearance_consistency',
  subjectRecognition: 'subject_recognition',
  factTruthfulness: 'fact_truthfulness',
  layoutAndText: 'layout_and_text',
  detailDecisionChain: 'detail_decision_chain',
  visualUnity: 'visual_unity',
  propSubordination: 'prop_subordination',
  safeMargin: 'safe_margin',
  clickConversion: 'click_conversion',
  spliceFit: 'splice_fit',
};

const STATUS_ALIASES: Record<string, 'passed' | 'warning' | 'failed'> = {
  pass: 'passed',
  passed: 'passed',
  '通过': 'passed',
  warn: 'warning',
  warning: 'warning',
  '警告': 'warning',
  fail: 'failed',
  failed: 'failed',
  '失败': 'failed',
};

const qualityCheckItemSchema = z.object({
  key: z.enum(QUALITY_CHECK_KEYS),
  status: z.enum(['passed', 'warning', 'failed']),
  score: z.number().min(0).max(10).optional(),
  evidence: z.string().max(500).optional(),
});

const normalizedQualityCheckSchema = z
  .object({
    items: z.array(qualityCheckItemSchema).length(QUALITY_CHECK_KEYS.length),
  })
  .superRefine((value, ctx) => {
    const keys = new Set(value.items.map((item) => item.key));
    if (keys.size !== QUALITY_CHECK_KEYS.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: '检查项必须覆盖十个不同的质检维度',
      });
    }
  });

function normalizeScore(value: unknown): number | undefined {
  const score = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(score)) return undefined;
  // 兼容常见的 0-100 与 0-1 评分，内部统一为 0-10。
  if (score > 10 && score <= 100) return score / 10;
  if (score >= 0 && score < 1) return score * 10;
  return score;
}

function normalizeEvidence(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return undefined;
  }
}

function normalizeItem(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const item = value as Record<string, unknown>;
  const rawKey = String(item.key ?? item.checkKey ?? item.name ?? '').trim();
  const rawStatus = String(item.status ?? item.result ?? '').trim().toLowerCase();
  return {
    key: KEY_ALIASES[rawKey] ?? rawKey,
    status: STATUS_ALIASES[rawStatus] ?? rawStatus,
    score: normalizeScore(item.score),
    evidence: normalizeEvidence(item.evidence ?? item.reason ?? item.description),
  };
}

/** 将模型常见的数组/包装对象/评分尺度统一为质检契约。 */
export function normalizeQualityCheckResponse(value: unknown): unknown {
  if (Array.isArray(value)) return { items: value.map(normalizeItem) };
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const rawItems = object.items ?? object.checks ?? object.results;
  return { items: Array.isArray(rawItems) ? rawItems.map(normalizeItem) : rawItems };
}

export const qualityCheckModelSchema = z.preprocess(
  normalizeQualityCheckResponse,
  normalizedQualityCheckSchema
);

export const QUALITY_CHECK_REPAIR_PROMPT =
  '你是电商图片质检 JSON 结构修复器。只输出 JSON 对象，格式为 {"items":[...]}。' +
  'items 必须包含十项且每项 key 唯一，key 只能使用 appearance_consistency、subject_recognition、' +
  'fact_truthfulness、layout_and_text、detail_decision_chain、visual_unity、prop_subordination、' +
  'safe_margin、click_conversion、splice_fit；status 只能是 passed、warning、failed；' +
  'score 统一使用 0-10。只重组原响应已有信息，不补造事实。';
