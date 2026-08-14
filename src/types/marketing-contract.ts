// ============================================
// 营销内容模块 V3 契约（Phase 0 冻结）
// 来源：商图策AI营销内容模块研发实施设计文档V3 第 5-9 节
// 任何字段/状态/错误码变更必须同步更新本文件与 schemas.ts，
// 并升级 schemaVersion。
// ============================================

// ---- 任务模块 ----
export type MarketingModule = 'copywriting' | 'translate' | 'seo' | 'geo' | 'insight';

// ---- 任务状态机（V3 7.2）----
// draft -> analyzing -> generating -> completed | partial_failed | failed
export type MarketingTaskStatus =
  | 'draft'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'partial_failed'
  | 'failed';

// ---- 执行步骤 ----
export type ExecutionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type ExecutionStepName = 'analysis' | 'copywriting' | 'mainPrompts' | 'detailPrompts';

export interface ExecutionStep {
  status: ExecutionStepStatus;
  role?: 'vision' | 'content';
  modelId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export type ExecutionStepMap = Partial<Record<ExecutionStepName, ExecutionStep>>;

// ---- 文案 Tab 输出项（V3 4.2）----
export type CopywritingOutputKey = 'analysis' | 'copywriting' | 'mainPrompts' | 'detailPrompts';

export type CopywritingOutputSelection = Record<CopywritingOutputKey, boolean>;

// ---- 结构化事实（V3 9.1）----
export type MarketingFactStatus = 'confirmed' | 'pending' | 'verified' | 'rejected';

export type MarketingFactSourceType = 'user' | 'image_analysis' | 'web' | 'model';

export interface MarketingFact {
  key: string;
  value: string;
  status: MarketingFactStatus;
  sourceType: MarketingFactSourceType;
  sourceUrl?: string;
  retrievedAt?: string;
}

// ---- 统一结果快照（V3 7.1 result 字段）----
export interface MarketingTaskResultSnapshot {
  analysis?: unknown;
  copywriting?: unknown;
  mainPrompts?: unknown;
  detailPrompts?: unknown;
  facts?: MarketingFact[];
  pendingFacts?: MarketingFact[];
}

// ---- 生成请求（POST /api/marketing/tasks 请求体）----
export interface MarketingTaskCreateInput {
  productName: string;
  productImages: string[];
  category?: string;
  platform: string;
  language: string;
  sellPoints?: string[];
  keywords?: string[];
  parameters?: Record<string, string>;
  outputs: CopywritingOutputSelection;
  modelSelection: {
    visionModelId: string;
    contentModelId: string;
  };
}

export interface MarketingTaskCreateRequest {
  module: MarketingModule;
  schemaVersion: number;
  input: MarketingTaskCreateInput;
}

// ---- 翻译模块输入（V3 4.4）----
export interface TranslateTaskCreateInput {
  sourceText: string;
  /** 源语言代码或 'auto' */
  sourceLanguage: string;
  targetLanguages: string[];
  modelId: string;
}

export interface TranslateTaskCreateRequest {
  module: 'translate';
  schemaVersion: number;
  input: TranslateTaskCreateInput;
}

export interface TranslateLanguageResult {
  status: 'completed' | 'failed';
  translation?: string;
  error?: string;
}

export interface TranslateTaskResultSnapshot {
  sourceText: string;
  sourceLanguage: string;
  translations: Record<string, TranslateLanguageResult>;
}

// ---- SEO 模块（V3 9.2）----
export interface SeoTaskCreateInput {
  productName: string;
  sourceContent?: string;
  keywords: string[];
  category?: string;
  language: string;
  facts?: MarketingFact[];
  modelId: string;
}

export interface SeoTaskCreateRequest {
  module: 'seo';
  schemaVersion: number;
  input: SeoTaskCreateInput;
}

export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface SeoResult {
  keywordIntent: {
    keyword: string;
    intent: KeywordIntent;
    explanation: string;
  }[];
  pageTitle: {
    title: string;
    metaDescription: string;
    slug: string;
  };
  headingStructure: {
    h1: string;
    h2: string[];
  };
  bodyContent: string;
  faq: { question: string; answer: string }[];
  imageAlt: { image: string; alt: string }[];
  internalLinks: { anchorText: string; target: string; reason: string }[];
  /** JSON-LD 在 API 中保持对象结构，导出时才序列化（V3 9.2）。 */
  jsonLd: Record<string, unknown>;
  pendingFacts: MarketingFact[];
}

// ---- GEO 模块（V3 9.3 离线版）----
export interface GeoTaskCreateInput {
  question: string;
  brandName: string;
  sourceContent?: string;
  keywords?: string[];
  language: string;
  facts?: MarketingFact[];
  modelId: string;
  /** Phase 7：true 时使用联网搜索来源（需已配置搜索服务）。 */
  enableSearch?: boolean;
}

export interface GeoTaskCreateRequest {
  module: 'geo';
  schemaVersion: number;
  input: GeoTaskCreateInput;
}

export interface GeoClaim {
  text: string;
  /** 必须引用输入中已确认事实的 key，防止编造引用。 */
  factKey: string;
}

export interface GeoResult {
  question: string;
  directAnswer: string;
  supportingContent: string;
  faq: { question: string; answer: string }[];
  claims: GeoClaim[];
  pendingFacts: MarketingFact[];
  /** 离线声明由前端/导出层强制附加，模型输出不允许出现。 */
  /** 联网版扩展（Phase 7）：搜索来源与降级标记。 */
  sources?: SearchSource[];
  degraded?: boolean;
  retrievedAt?: string;
}

// ---- 联网搜索来源（Phase 7 / ADR-0001）----
export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

// ---- 市场洞察模块（V3 Phase 7）----
export type InsightType = 'competitor' | 'trends' | 'needs' | 'pricing';

export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  competitor: '竞品分析',
  trends: '趋势洞察',
  needs: '用户需求分析',
  pricing: '价格与定位分析',
};

export interface InsightTaskCreateInput {
  type: InsightType;
  productName: string;
  category?: string;
  market?: string;
  language: string;
  facts?: MarketingFact[];
  modelId: string;
}

export interface InsightTaskCreateRequest {
  module: 'insight';
  schemaVersion: number;
  input: InsightTaskCreateInput;
}

export interface InsightSection {
  title: string;
  content: string;
}

export interface InsightResult {
  type: InsightType;
  productName: string;
  summary: string;
  sections: InsightSection[];
  keyFindings: string[];
  recommendations: string[];
  sources: SearchSource[];
  /** 搜索降级：无来源或查询配额用尽时 true。 */
  degraded: boolean;
  retrievedAt: string;
}

// ---- API 响应规范（V3 8.2）----
export type MarketingErrorCode =
  | 'VALIDATION_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_CAPABILITY_MISSING'
  | 'MODEL_TEST_REQUIRED'
  | 'SEARCH_NOT_CONFIGURED'
  | 'UPLOAD_INVALID'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'OUTPUT_INVALID'
  | 'TASK_NOT_FOUND'
  | 'EXPORT_FAILED';

export interface ApiErrorDetail {
  code: MarketingErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorDetail;
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---- POST /api/marketing/tasks 响应 data ----
export type GenerateTaskDataResult =
  | MarketingTaskResultSnapshot
  | TranslateTaskResultSnapshot
  | SeoResult
  | GeoResult
  | InsightResult;

export interface GenerateTaskData {
  taskId: string;
  status: MarketingTaskStatus;
  result: GenerateTaskDataResult;
  steps: ExecutionStepMap | Record<string, ExecutionStep>;
  error?: string;
}

// ---- GET /api/marketing/tasks 列表项 ----
export interface MarketingTaskListItem {
  id: string;
  module: MarketingModule;
  status: MarketingTaskStatus;
  productName: string;
  productImages: string[];
  platform: string;
  language: string;
  selectedOutputs: CopywritingOutputKey[];
  isFavorite: boolean;
  error?: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}
