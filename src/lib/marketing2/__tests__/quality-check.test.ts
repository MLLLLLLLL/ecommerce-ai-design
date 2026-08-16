import { describe, expect, it } from 'vitest';
import {
  QUALITY_CHECK_KEYS,
  qualityCheckModelSchema,
  normalizeQualityCheckResponse,
} from '@/lib/marketing2/quality-check';

function makeItems(overrides: Record<string, unknown> = {}) {
  return QUALITY_CHECK_KEYS.map((key) => ({
    key,
    status: 'passed',
    score: 8,
    evidence: '清晰可见',
    ...overrides,
  }));
}

describe('quality check response normalization', () => {
  it('接受模型直接返回的数组并保留十项检查', () => {
    const result = qualityCheckModelSchema.parse(makeItems());

    expect(result.items).toHaveLength(10);
    expect(result.items[0].key).toBe('appearance_consistency');
  });

  it('兼容 checks 包装、状态别名和 0-100 分数', () => {
    const raw = {
      checks: makeItems({ status: 'PASS', score: 90, evidence: undefined, reason: '主体清晰' }),
    };
    const result = qualityCheckModelSchema.parse(raw);

    expect(result.items[0]).toMatchObject({
      status: 'passed',
      score: 9,
      evidence: '主体清晰',
    });
  });

  it('兼容 0-1 分数，并拒绝缺少检查项的响应', () => {
    const result = qualityCheckModelSchema.safeParse({
      items: makeItems({ score: 0.8 }).slice(0, 9),
    });

    expect(result.success).toBe(false);
    expect(normalizeQualityCheckResponse(makeItems({ score: 0.8 }))).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ score: 8 })]),
    });
  });

  it('拒绝重复检查项，避免报告缺少质检维度', () => {
    const items = makeItems();
    items[1] = { ...items[1], key: items[0].key };

    expect(qualityCheckModelSchema.safeParse({ items }).success).toBe(false);
  });
});
