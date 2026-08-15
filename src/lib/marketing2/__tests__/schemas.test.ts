import { describe, expect, it } from 'vitest';
import {
  assertTotalImageLimit,
  buildImageFilename,
  fullWorkflowInputSchema,
  Marketing2Error,
  parseWorkflowInput,
  promptPlanningOutputSchema,
  qualityCheckResultSchema,
  resolveImageCounts,
  sanitizeFilenamePart,
  TOTAL_IMAGE_ITEM_LIMIT,
} from '@/lib/marketing2/schemas';

// ============================================
// 营销助手2契约 Schema 测试（V2 12.1）
// ============================================

describe('full workflow input schema', () => {
  const baseInput = {
    productImages: ['/api/files/user-data/marketing/a.png'],
    productName: '测试产品',
    mainImageCount: 'auto',
    detailPageCount: 'auto',
  };

  it('接受合法输入并应用默认值', () => {
    const parsed = fullWorkflowInputSchema.parse(baseInput);
    expect(parsed.platform).toBe('taobao');
    expect(parsed.language).toBe('zh-CN');
    expect(parsed.sellPoints).toEqual([]);
  });

  it('至少 1 张产品图', () => {
    const result = fullWorkflowInputSchema.safeParse({ ...baseInput, productImages: [] });
    expect(result.success).toBe(false);
  });

  it('产品图最多 5 张', () => {
    const result = fullWorkflowInputSchema.safeParse({
      ...baseInput,
      productImages: Array.from({ length: 6 }, (_, i) => `/img/${i}.png`),
    });
    expect(result.success).toBe(false);
  });

  it('主图手动范围 1-10，详情页 1-20', () => {
    expect(fullWorkflowInputSchema.safeParse({ ...baseInput, mainImageCount: 11 }).success).toBe(false);
    expect(fullWorkflowInputSchema.safeParse({ ...baseInput, detailPageCount: 21 }).success).toBe(false);
    expect(fullWorkflowInputSchema.safeParse({ ...baseInput, mainImageCount: 10 }).success).toBe(true);
  });

  it('主图与详情页合计等于 30 为合法边界，超限由 assertTotalImageLimit 拦截', () => {
    const result = fullWorkflowInputSchema.safeParse({
      ...baseInput,
      mainImageCount: 10,
      detailPageCount: 20,
    });
    expect(result.success).toBe(true);
    expect(() => assertTotalImageLimit(10, 21)).toThrow(Marketing2Error);
  });

  it('resolveImageCounts 与 assertTotalImageLimit', () => {
    expect(resolveImageCounts('auto', 'auto')).toEqual({ main: 5, detail: 8 });
    expect(() => assertTotalImageLimit(15, 16)).toThrow(Marketing2Error);
    expect(() => assertTotalImageLimit(10, 20)).not.toThrow();
    expect(TOTAL_IMAGE_ITEM_LIMIT).toBe(30);
  });
});

describe('output schemas', () => {
  it('提示词规划输出限制主图 10、详情页 20', () => {
    const plans = Array.from({ length: 11 }, (_, i) => ({
      kind: 'main_image' as const,
      index: i + 1,
      prompt: '提示词',
    }));
    expect(promptPlanningOutputSchema.safeParse({ plans }).success).toBe(false);
  });

  it('质检结果 Schema 校验状态枚举', () => {
    const valid = qualityCheckResultSchema.safeParse({
      overallStatus: 'needs_repair',
      items: [
        {
          key: 'appearance_consistency',
          status: 'failed',
          modelId: 'm1',
          checkedAt: new Date().toISOString(),
        },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = qualityCheckResultSchema.safeParse({
      overallStatus: 'unknown',
      items: [],
    });
    expect(invalid.success).toBe(false);
  });
});

describe('filename rules', () => {
  it('清洗非法字符', () => {
    expect(sanitizeFilenamePart('产品/A:B*C?')).toBe('产品ABC');
    expect(sanitizeFilenamePart('  ')).toBe('item');
    expect(sanitizeFilenamePart('a'.repeat(60)).length).toBeLessThanOrEqual(32);
  });

  it('命名规则：[产品名]_主图_[序号]_[关键词].png', () => {
    expect(
      buildImageFilename({ productName: '保温杯', kind: 'main_image', index: 2, keyword: '户外' })
    ).toBe('保温杯_主图_2_户外.png');
    expect(
      buildImageFilename({ productName: '保温杯', kind: 'detail_page', index: 1, keyword: '细节' })
    ).toBe('保温杯_详情页_1_细节.png');
  });

  it('重名时追加冲突后缀', () => {
    expect(
      buildImageFilename({
        productName: '杯',
        kind: 'main_image',
        index: 1,
        keyword: '图',
        collisionSuffix: 'abcd1234_v2',
      })
    ).toBe('杯_主图_1_图_abcd1234_v2.png');
  });
});

describe('parseWorkflowInput', () => {
  it('未知 workflowKey 抛 WORKFLOW_NOT_FOUND', () => {
    expect(() => parseWorkflowInput('unknown-workflow', {})).toThrowError(Marketing2Error);
  });

  it('已移除的独立工作流返回 WORKFLOW_NOT_FOUND', () => {
    try {
      parseWorkflowInput('marketing2-background-cleanup', { productImages: [] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Marketing2Error);
      expect((error as Marketing2Error).code).toBe('WORKFLOW_NOT_FOUND');
    }
  });
});
