import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_CAPABILITIES,
  inferModelCapabilities,
} from '@/types/model-config';
import { toCapabilities, toTestedCapabilities } from '@/lib/model-configs';

// ============================================
// 模型能力模型测试（V2 5.1）
// imageGeneration / imageEditing / referenceImage 三者不能互相推断，
// 能力未知时按不可用处理。
// ============================================

describe('capability defaults and inference', () => {
  it('默认能力全为关闭（jsonMode 除外）', () => {
    expect(DEFAULT_MODEL_CAPABILITIES.imageEditing).toBe(false);
    expect(DEFAULT_MODEL_CAPABILITIES.referenceImage).toBe(false);
  });

  it('文本模型不推断图片能力', () => {
    const capabilities = inferModelCapabilities('gpt-4o');
    expect(capabilities.imageGeneration).toBe(false);
    expect(capabilities.imageEditing).toBe(false);
    expect(capabilities.referenceImage).toBe(false);
  });

  it('图片模型推断生成与编辑能力', () => {
    const capabilities = inferModelCapabilities('gpt-image-1');
    expect(capabilities.imageGeneration).toBe(true);
    expect(capabilities.imageEditing).toBe(true);
    expect(capabilities.jsonMode).toBe(false);
  });
});

describe('toCapabilities / toTestedCapabilities', () => {
  it('缺失字段按 false 处理（能力未知按不可用）', () => {
    const capabilities = toCapabilities({ vision: true });
    expect(capabilities.vision).toBe(true);
    expect(capabilities.imageEditing).toBe(false);
    expect(capabilities.referenceImage).toBe(false);
  });

  it('非法输入返回全 false', () => {
    expect(toCapabilities(null).imageGeneration).toBe(false);
    expect(toCapabilities('bad').imageEditing).toBe(false);
    expect(toTestedCapabilities(undefined)).toBeNull();
  });

  it('实测快照包含图片能力字段', () => {
    const tested = toTestedCapabilities({
      connection: true,
      imageGeneration: true,
      imageEditing: false,
    });
    expect(tested?.imageGeneration).toBe(true);
    expect(tested?.imageEditing).toBe(false);
    expect(tested?.referenceImage).toBe(false);
  });
});
