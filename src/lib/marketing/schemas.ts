import { z } from 'zod';
import type {
  CopywritingOutputSelection,
  GeoResult,
  InsightResult,
  MarketingFact,
  SeoResult,
} from '@/types/marketing-contract';

// ============================================
// 营销内容模块 V3 Zod Schema（Phase 0 冻结）
// 与 src/types/marketing-contract.ts 一一对应。
// 变更规则：向后兼容用 .optional() 扩展；破坏性变更升级 schemaVersion。
// ============================================

export const MARKETING_SCHEMA_VERSION = 1;

export const marketingModuleSchema = z.enum(['copywriting', 'translate', 'seo', 'geo', 'insight']);

export const marketingTaskStatusSchema = z.enum([
  'draft',
  'analyzing',
  'generating',
  'completed',
  'partial_failed',
  'failed',
]);

export const executionStepStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);

export const executionStepNameSchema = z.enum(['analysis', 'copywriting', 'mainPrompts', 'detailPrompts']);

export const executionStepSchema = z.object({
  status: executionStepStatusSchema,
  role: z.enum(['vision', 'content']).optional(),
  modelId: z.string().uuid().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: z.string().max(1000).optional(),
});

export const executionStepMapSchema = z.record(executionStepNameSchema, executionStepSchema);

// 第一版图片边界（V3 4.2）：1-5 张
export const PRODUCT_IMAGE_MIN = 1;
export const PRODUCT_IMAGE_MAX = 5;
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export const productImageSchema = z.string().min(1).max(2000);

export const copywritingOutputsSchema: z.ZodType<CopywritingOutputSelection> = z.object({
  analysis: z.boolean(),
  copywriting: z.boolean(),
  mainPrompts: z.boolean(),
  detailPrompts: z.boolean(),
});

export const marketingFactSchema: z.ZodType<MarketingFact> = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string().max(4000),
  status: z.enum(['confirmed', 'pending', 'verified', 'rejected']),
  sourceType: z.enum(['user', 'image_analysis', 'web', 'model']),
  sourceUrl: z.string().url().max(2000).optional(),
  retrievedAt: z.string().optional(),
});

/**
 * 宽松事实 Schema：模型输出的 pendingFacts 形态可能不标准
 * （缺 key/value 或直接是字符串），引擎层归一化后过滤无效项。
 */
export const looseMarketingFactSchema = z.union([
  marketingFactSchema,
  z
    .object({
      key: z.string().optional(),
      value: z.string().optional(),
      status: z.string().optional(),
      sourceType: z.string().optional(),
      sourceUrl: z.string().optional(),
      retrievedAt: z.string().optional(),
    })
    .passthrough(),
  z.string(),
]);

// ---- SEO 模块（V3 9.2）----
export const SEO_KEYWORDS_MAX = 20;
export const SEO_SOURCE_CONTENT_MAX_CHARS = 20000;

export const seoInputSchema = z.object({
  productName: z.string().trim().min(1).max(300),
  sourceContent: z.string().max(SEO_SOURCE_CONTENT_MAX_CHARS).optional(),
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(SEO_KEYWORDS_MAX),
  category: z.string().trim().min(1).max(50).optional(),
  language: z.string().trim().min(1).max(20),
  facts: z.array(marketingFactSchema).max(50).optional(),
  modelId: z.string().uuid(),
});

export const keywordIntentSchema = z.object({
  keyword: z.string().min(1).max(200),
  intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  explanation: z.string().min(1).max(500),
});

export const seoResultSchema: z.ZodType<SeoResult> = z
  .object({
    keywordIntent: z.array(keywordIntentSchema).min(1).max(20),
    pageTitle: z.object({
      title: z.string().min(1).max(200),
      metaDescription: z.string().min(1).max(500),
      slug: z.string().min(1).max(300),
    }),
    headingStructure: z.object({
      h1: z.string().min(1).max(200),
      h2: z.array(z.string().min(1).max(200)).min(1).max(20),
    }),
    bodyContent: z.string().min(1).max(50000),
    faq: z
      .array(
        z.object({
          question: z.string().min(1).max(300),
          answer: z.string().min(1).max(2000),
        })
      )
      .max(20),
    imageAlt: z
      .array(
        z.object({
          image: z.string().min(1).max(500),
          alt: z.string().min(1).max(500),
        })
      )
      .max(20),
    internalLinks: z
      .array(
        z.object({
          anchorText: z.string().min(1).max(200),
          target: z.string().min(1).max(300),
          reason: z.string().min(1).max(500),
        })
      )
      .max(20),
    jsonLd: z.record(z.string(), z.unknown()),
    pendingFacts: z.array(looseMarketingFactSchema).max(50),
  })
  .strict() as unknown as z.ZodType<SeoResult>;

export const createSeoTaskSchema = z
  .object({
    module: z.literal('seo'),
    schemaVersion: z.literal(MARKETING_SCHEMA_VERSION).default(MARKETING_SCHEMA_VERSION),
    input: seoInputSchema,
  })
  .strict();

// ---- GEO 模块（V3 9.3 离线版）----
export const GEO_QUESTION_MAX_CHARS = 500;
export const GEO_SOURCE_CONTENT_MAX_CHARS = 20000;

export const geoInputSchema = z.object({
  question: z.string().trim().min(1).max(GEO_QUESTION_MAX_CHARS),
  brandName: z.string().trim().min(1).max(300),
  sourceContent: z.string().max(GEO_SOURCE_CONTENT_MAX_CHARS).optional(),
  keywords: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  language: z.string().trim().min(1).max(20),
  facts: z.array(marketingFactSchema).max(50).optional(),
  modelId: z.string().uuid(),
  /** Phase 7：true 时使用联网搜索来源（需已配置搜索服务）。 */
  enableSearch: z.boolean().optional(),
});

export const geoResultSchema: z.ZodType<GeoResult> = z
  .object({
    question: z.string().min(1).max(GEO_QUESTION_MAX_CHARS),
    directAnswer: z.string().min(1).max(4000),
    supportingContent: z.string().min(1).max(20000),
    faq: z
      .array(
        z.object({
          question: z.string().min(1).max(300),
          answer: z.string().min(1).max(2000),
        })
      )
      .max(10),
    claims: z
      .array(
        z.object({
          text: z.string().min(1).max(1000),
          factKey: z.string().min(1).max(200),
        })
      )
      .max(30),
    pendingFacts: z.array(looseMarketingFactSchema).max(50),
  })
  .strict() as unknown as z.ZodType<GeoResult>;

export const createGeoTaskSchema = z
  .object({
    module: z.literal('geo'),
    schemaVersion: z.literal(MARKETING_SCHEMA_VERSION).default(MARKETING_SCHEMA_VERSION),
    input: geoInputSchema,
  })
  .strict();

// ---- 联网 GEO（V3 Phase 7）----
export const searchSourceSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.string().url().max(2000),
  snippet: z.string().max(4000),
});

export const geoOnlineResultSchema: z.ZodType<GeoResult> = z
  .object({
    question: z.string().min(1).max(GEO_QUESTION_MAX_CHARS),
    directAnswer: z.string().min(1).max(4000),
    supportingContent: z.string().min(1).max(20000),
    faq: z
      .array(
        z.object({
          question: z.string().min(1).max(300),
          answer: z.string().min(1).max(2000),
        })
      )
      .max(10),
    claims: z
      .array(
        z.object({
          text: z.string().min(1).max(1000),
          factKey: z.string().min(1).max(200),
        })
      )
      .max(30),
    pendingFacts: z.array(looseMarketingFactSchema).max(50),
    sources: z.array(searchSourceSchema).max(30),
    degraded: z.boolean(),
    retrievedAt: z.string(),
  })
  .strict() as unknown as z.ZodType<GeoResult>;

// ---- 市场洞察模块（V3 Phase 7）----
export const INSIGHT_MAX_QUERIES = 12;

export const insightInputSchema = z.object({
  type: z.enum(['competitor', 'trends', 'needs', 'pricing']),
  productName: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(50).optional(),
  market: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(1).max(20),
  facts: z.array(marketingFactSchema).max(50).optional(),
  modelId: z.string().uuid(),
});

export const insightResultSchema: z.ZodType<InsightResult> = z
  .object({
    type: z.enum(['competitor', 'trends', 'needs', 'pricing']),
    productName: z.string().min(1).max(300),
    summary: z.string().min(1).max(4000),
    sections: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          content: z.string().min(1).max(10000),
        })
      )
      .min(1)
      .max(10),
    keyFindings: z.array(z.string().min(1).max(1000)).min(1).max(10),
    recommendations: z.array(z.string().min(1).max(1000)).max(10),
    sources: z.array(searchSourceSchema).max(30),
    degraded: z.boolean(),
    retrievedAt: z.string(),
  })
  .strict() as unknown as z.ZodType<InsightResult>;

export const createInsightTaskSchema = z
  .object({
    module: z.literal('insight'),
    schemaVersion: z.literal(MARKETING_SCHEMA_VERSION).default(MARKETING_SCHEMA_VERSION),
    input: insightInputSchema,
  })
  .strict();

// ---- 翻译模块（V3 4.4）----
export const TRANSLATE_TARGET_MAX = 10;
export const TRANSLATE_CONCURRENCY = 3;
export const TRANSLATE_SOURCE_MAX_CHARS = 10000;

export const translateInputSchema = z.object({
  sourceText: z.string().trim().min(1).max(TRANSLATE_SOURCE_MAX_CHARS),
  sourceLanguage: z.string().trim().min(1).max(20),
  targetLanguages: z
    .array(z.string().trim().min(1).max(20))
    .min(1)
    .max(TRANSLATE_TARGET_MAX),
  modelId: z.string().uuid(),
});

export const createTranslateTaskSchema = z
  .object({
    module: z.literal('translate'),
    schemaVersion: z.literal(MARKETING_SCHEMA_VERSION).default(MARKETING_SCHEMA_VERSION),
    input: translateInputSchema,
  })
  .strict();

export const createCopywritingTaskSchema = z
  .object({
    module: z.literal('copywriting'),
    schemaVersion: z.literal(MARKETING_SCHEMA_VERSION).default(MARKETING_SCHEMA_VERSION),
    input: z.object({
      productName: z.string().trim().min(1).max(300),
      productImages: z.array(productImageSchema).min(PRODUCT_IMAGE_MIN).max(PRODUCT_IMAGE_MAX),
      category: z.string().trim().min(1).max(50).optional(),
      platform: z.string().trim().min(1).max(50),
      language: z.string().trim().min(1).max(20),
      sellPoints: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
      keywords: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
      parameters: z.record(z.string(), z.string()).optional(),
      outputs: copywritingOutputsSchema,
      modelSelection: z.object({
        visionModelId: z.string().uuid(),
        contentModelId: z.string().uuid(),
      }),
    }),
  })
  .strict();

export const createMarketingTaskSchema = z.discriminatedUnion('module', [
  createCopywritingTaskSchema,
  createTranslateTaskSchema,
  createSeoTaskSchema,
  createGeoTaskSchema,
  createInsightTaskSchema,
]);

export const favoritePatchSchema = z
  .object({
    isFavorite: z.boolean(),
  })
  .strict();

export const exportTaskSchema = z
  .object({
    format: z.enum(['json', 'markdown']),
  })
  .strict();
