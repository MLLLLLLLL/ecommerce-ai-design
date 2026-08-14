import { describe, expect, it } from 'vitest';
import {
  createMarketingTaskSchema,
  geoResultSchema,
  PRODUCT_IMAGE_MAX,
  seoResultSchema,
} from '@/lib/marketing/schemas';

function buildValidRequest() {
  return {
    module: 'copywriting',
    schemaVersion: 1,
    input: {
      productName: '智能保温杯 316 不锈钢',
      productImages: ['/api/files/marketing/abc.jpg'],
      category: '百货杯壶',
      platform: 'taobao',
      language: 'zh-CN',
      sellPoints: ['长效保温', '食品级材质'],
      keywords: ['保温杯', '不锈钢'],
      outputs: {
        analysis: true,
        copywriting: true,
        mainPrompts: true,
        detailPrompts: true,
      },
      modelSelection: {
        visionModelId: '6f3d9c4e-2f1a-4b7e-9d2c-1a2b3c4d5e6f',
        contentModelId: '7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d',
      },
    },
  };
}

describe('createMarketingTaskSchema（POST /api/marketing/tasks 请求契约）', () => {
  it('接受合法请求并应用 schemaVersion 默认值', () => {
    const request = buildValidRequest();
    const parsed = createMarketingTaskSchema.parse(request);
    expect(parsed.module).toBe('copywriting');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.input.productImages).toHaveLength(1);
  });

  it('拒绝未知顶层字段（strict）', () => {
    const request = { ...buildValidRequest(), extra: true };
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('拒绝缺失必填字段 productName', () => {
    const request = buildValidRequest();
    delete (request.input as Record<string, unknown>).productName;
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('拒绝空图片数组（至少 1 张）', () => {
    const request = buildValidRequest();
    request.input.productImages = [];
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it(`拒绝超过 ${PRODUCT_IMAGE_MAX} 张图片`, () => {
    const request = buildValidRequest();
    request.input.productImages = Array.from(
      { length: PRODUCT_IMAGE_MAX + 1 },
      (_, i) => `/api/files/marketing/img-${i}.jpg`
    );
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('拒绝非 UUID 的模型 ID', () => {
    const request = buildValidRequest();
    request.input.modelSelection.visionModelId = 'not-a-uuid';
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('拒绝空 productName（trim 后）', () => {
    const request = buildValidRequest();
    request.input.productName = '   ';
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('接受最小化的合法请求（可选字段缺省）', () => {
    const request = buildValidRequest();
    delete (request.input as Record<string, unknown>).sellPoints;
    delete (request.input as Record<string, unknown>).keywords;
    delete (request.input as Record<string, unknown>).category;
    delete (request.input as Record<string, unknown>).parameters;
    const result = createMarketingTaskSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});

describe('createMarketingTaskSchema 翻译与 SEO 模块', () => {
  it('接受合法翻译请求', () => {
    const parsed = createMarketingTaskSchema.parse({
      module: 'translate',
      schemaVersion: 1,
      input: {
        sourceText: '智能保温杯',
        sourceLanguage: 'auto',
        targetLanguages: ['en-US', 'ja-JP'],
        modelId: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(parsed.module).toBe('translate');
    expect(parsed.input.targetLanguages).toHaveLength(2);
  });

  it('翻译目标语言超过 10 种被拒绝', () => {
    const result = createMarketingTaskSchema.safeParse({
      module: 'translate',
      schemaVersion: 1,
      input: {
        sourceText: 'x',
        sourceLanguage: 'auto',
        targetLanguages: ['en-US', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'ru-RU', 'pt-PT', 'nl-NL', 'pl-PL'],
        modelId: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(result.success).toBe(false);
  });

  it('接受合法 SEO 请求（含用户确认事实）', () => {
    const parsed = createMarketingTaskSchema.parse({
      module: 'seo',
      schemaVersion: 1,
      input: {
        productName: '智能保温杯',
        keywords: ['保温杯'],
        language: 'zh-CN',
        facts: [{ key: '材质', value: '316 不锈钢', status: 'confirmed', sourceType: 'user' }],
        modelId: '44444444-4444-4444-8444-444444444444',
      },
    });
    expect(parsed.module).toBe('seo');
    expect(parsed.input.facts).toHaveLength(1);
  });

  it('SEO 关键词为空被拒绝', () => {
    const result = createMarketingTaskSchema.safeParse({
      module: 'seo',
      schemaVersion: 1,
      input: {
        productName: 'x',
        keywords: [],
        language: 'zh-CN',
        modelId: '44444444-4444-4444-8444-444444444444',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('seoResultSchema（SEO 输出结构校验，V3 9.2）', () => {
  it('完整 SEO 结果通过校验（jsonLd 保持对象结构）', () => {
    const result = seoResultSchema.parse({
      keywordIntent: [{ keyword: '保温杯', intent: 'commercial', explanation: '购买意图' }],
      pageTitle: { title: '保温杯推荐', metaDescription: '描述', slug: '/x' },
      headingStructure: { h1: 'H1', h2: ['H2'] },
      bodyContent: '正文',
      faq: [{ question: 'Q', answer: 'A' }],
      imageAlt: [{ image: '主图', alt: 'alt' }],
      internalLinks: [{ anchorText: 'x', target: '/y', reason: 'z' }],
      jsonLd: { '@context': 'https://schema.org', '@type': 'Product', name: '保温杯' },
      pendingFacts: [{ key: '销量', value: '销量第一', status: 'pending', sourceType: 'model' }],
    });
    expect(result.jsonLd).toMatchObject({ '@type': 'Product' });
    expect(result.pendingFacts).toHaveLength(1);
  });

  it('jsonLd 为字符串被拒绝（必须保持对象结构）', () => {
    const base = {
      keywordIntent: [{ keyword: 'k', intent: 'commercial', explanation: 'e' }],
      pageTitle: { title: 't', metaDescription: 'm', slug: '/s' },
      headingStructure: { h1: 'h', h2: ['h2'] },
      bodyContent: 'b',
      faq: [],
      imageAlt: [],
      internalLinks: [],
      jsonLd: '{"@type":"Product"}',
      pendingFacts: [],
    };
    expect(seoResultSchema.safeParse(base).success).toBe(false);
  });

  it('未知字段被拒绝（strict）', () => {
    const base = {
      keywordIntent: [{ keyword: 'k', intent: 'commercial', explanation: 'e' }],
      pageTitle: { title: 't', metaDescription: 'm', slug: '/s' },
      headingStructure: { h1: 'h', h2: ['h2'] },
      bodyContent: 'b',
      faq: [],
      imageAlt: [],
      internalLinks: [],
      jsonLd: {},
      pendingFacts: [],
      searchVolume: 100,
    };
    expect(seoResultSchema.safeParse(base).success).toBe(false);
  });
});

describe('GEO 模块 Schema（V3 9.3 离线版）', () => {
  it('接受合法 GEO 请求', () => {
    const parsed = createMarketingTaskSchema.parse({
      module: 'geo',
      schemaVersion: 1,
      input: {
        question: '什么保温杯保温效果好？',
        brandName: 'XX 保温杯',
        language: 'zh-CN',
        facts: [{ key: 'material', value: '316 不锈钢', status: 'confirmed', sourceType: 'user' }],
        modelId: '55555555-5555-4555-8555-555555555555',
      },
    });
    expect(parsed.module).toBe('geo');
    expect(parsed.input.brandName).toBe('XX 保温杯');
  });

  it('问题为空被拒绝', () => {
    const result = createMarketingTaskSchema.safeParse({
      module: 'geo',
      schemaVersion: 1,
      input: {
        question: '   ',
        brandName: 'X',
        language: 'zh-CN',
        modelId: '55555555-5555-4555-8555-555555555555',
      },
    });
    expect(result.success).toBe(false);
  });

  it('geoResultSchema 拒绝来源列表等伪造字段（strict）', () => {
    const base = {
      question: 'q',
      directAnswer: 'a',
      supportingContent: 's',
      faq: [],
      claims: [{ text: 't', factKey: 'k' }],
      pendingFacts: [],
      sourceList: [{ url: 'https://fake' }],
    };
    expect(geoResultSchema.safeParse(base).success).toBe(false);
  });

  it('geoResultSchema 拒绝 verified 标识字段', () => {
    const base = {
      question: 'q',
      directAnswer: 'a',
      supportingContent: 's',
      faq: [],
      claims: [],
      pendingFacts: [],
      verified: true,
    };
    expect(geoResultSchema.safeParse(base).success).toBe(false);
  });

  it('合法 GEO 结果通过校验', () => {
    const result = geoResultSchema.parse({
      question: 'q',
      directAnswer: 'a',
      supportingContent: 's',
      faq: [{ question: 'fq', answer: 'fa' }],
      claims: [{ text: 't', factKey: 'material' }],
      pendingFacts: [{ key: 'x', value: 'y', status: 'pending', sourceType: 'model' }],
    });
    expect(result.claims).toHaveLength(1);
  });
});
