import { describe, expect, it } from 'vitest';
import { getPromptSlotDefinitions } from '@/lib/marketing2/prompt-planning';

describe('prompt planning slots', () => {
  it('默认创建 5 个主图位和 8 个详情页位', () => {
    const slots = getPromptSlotDefinitions('auto', 'auto');
    expect(slots).toHaveLength(13);
    expect(slots.filter((slot) => slot.kind === 'main_image')).toHaveLength(5);
    expect(slots.filter((slot) => slot.kind === 'detail_page')).toHaveLength(8);
  });

  it('自定义数量仍按类型和序号稳定落位', () => {
    const slots = getPromptSlotDefinitions(2, 3);
    expect(slots.map((slot) => `${slot.kind}:${slot.index}`)).toEqual([
      'main_image:1',
      'main_image:2',
      'detail_page:1',
      'detail_page:2',
      'detail_page:3',
    ]);
  });
});
