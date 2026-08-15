import { describe, expect, it } from 'vitest';
import { visualAnalysisModelSchema } from '@/lib/marketing2/visual-analysis';

describe('visual analysis model output', () => {
  it('接受标准对象', () => {
    const result = visualAnalysisModelSchema.parse({
      appearanceLock: '黑色亚光保温杯',
      visibleTexts: ['Double Wall'],
      materials: ['金属'],
    });

    expect(result.appearanceLock).toBe('黑色亚光保温杯');
    expect(result.structure).toBe('');
    expect(result.risks).toEqual([]);
  });

  it('解包单元素顶层数组', () => {
    const result = visualAnalysisModelSchema.parse([
      {
        appearanceLock: '白色圆柱形杯身',
        visibleTexts: [],
        materials: ['塑料'],
      },
    ]);

    expect(result.appearanceLock).toBe('白色圆柱形杯身');
    expect(result.materials).toEqual(['塑料']);
  });

  it('合并字段分散的对象数组', () => {
    const result = visualAnalysisModelSchema.parse([
      { appearance_lock: '银色金属杯身' },
      { visible_texts: 'ML' },
      { material: '不锈钢' },
    ]);

    expect(result.appearanceLock).toBe('银色金属杯身');
    expect(result.visibleTexts).toEqual(['ML']);
    expect(result.materials).toEqual(['不锈钢']);
  });

  it('兼容中文与蛇形字段名', () => {
    const result = visualAnalysisModelSchema.parse({
      '外观描述': '环形提手与旋盖结构',
      visible_texts: 'Double Wall',
      '材质': '金属',
      pending_facts: '内部材质需确认',
    });

    expect(result.appearanceLock).toBe('环形提手与旋盖结构');
    expect(result.visibleTexts).toEqual(['Double Wall']);
    expect(result.pendingFacts).toEqual(['内部材质需确认']);
  });

  it('appearanceLock 缺失时仅用已返回事实组合', () => {
    const result = visualAnalysisModelSchema.parse({
      structure: '圆柱杯身与环形提手',
      materials: ['金属', '塑料'],
      visibleTexts: ['ML'],
    });

    expect(result.appearanceLock).toBe(
      '结构：圆柱杯身与环形提手；材质：金属、塑料；可见文字：ML'
    );
  });

  it('没有任何外观事实时仍拒绝通过', () => {
    expect(() => visualAnalysisModelSchema.parse({ risks: ['文字较小'] })).toThrow();
  });
});
