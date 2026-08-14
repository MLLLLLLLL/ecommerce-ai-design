import { completeJSON } from '@/lib/ai/json-response';
import { TextCompletionError, TextCompletionClient } from '@/lib/ai/text-completion-client';
import { getLanguageOption } from '@/lib/marketing/languages';
import { seoResultSchema } from '@/lib/marketing/schemas';
import type { MarketingFact, SeoResult } from '@/types/marketing-contract';

// ============================================
// SEO 优化引擎（V3 9.2）
// 输出内容优化建议：关键词意图、标题、结构、正文、FAQ、
// Alt、内链、JSON-LD 对象与 pendingFacts。
// 不查询实时搜索量、排名或竞品数据。
// 铁律：未经证实的事实不得进入可发布正文。
// ============================================

export interface SeoParams {
  productName: string;
  sourceContent?: string;
  keywords: string[];
  category?: string;
  language: string;
  facts?: MarketingFact[];
}

const SYSTEM_PROMPT = [
  '你是资深电商 SEO 优化专家。基于用户提供的信息生成结构化 SEO 内容优化建议。',
  '',
  '铁律（必须遵守）：',
  '1. 只使用「已确认事实」和用户提供的信息；任何认证、销量、排名、搜索量、市场份额、奖项、好评率等未经证实或无法核实的声明，绝对不得写入 pageTitle、headingStructure、bodyContent 或 faq，必须列入 pendingFacts（status="pending"，sourceType="model"）；',
  '2. 本工具不提供实时搜索量、排名或竞品数据；keywordIntent 的 intent 仅基于关键词语义判断，explanation 不得编造数据；',
  '3. 正文使用目标输出语言；',
  '4. jsonLd 必须是合法的 schema.org JSON-LD 对象（如 Product 或 WebPage），保持对象结构，不要字符串化；',
  '5. 只输出 JSON，不要任何解释或 Markdown。',
].join('\n');

function buildUserPrompt(params: SeoParams): string {
  const languageLabel = getLanguageOption(params.language)?.label ?? params.language;
  const lines: string[] = [
    `页面主题/商品名称：${params.productName}`,
    ...(params.category ? [`品类：${params.category}`] : []),
    `目标输出语言：${languageLabel}`,
    `目标关键词：${params.keywords.join('、')}`,
    ...(params.sourceContent?.trim() ? [`已有内容：\n${params.sourceContent.trim()}`] : []),
  ];

  const confirmedFacts = (params.facts ?? []).filter((fact) => fact.status === 'confirmed');
  if (confirmedFacts.length > 0) {
    lines.push('已确认事实（可用于正文）：');
    for (const fact of confirmedFacts) {
      lines.push(`- ${fact.key}：${fact.value}`);
    }
  } else {
    lines.push('已确认事实：无（只使用商品名称与关键词，不得编造事实）');
  }

  lines.push(
    '',
    '请输出 JSON，字段：',
    '- keywordIntent：每个关键词的意图（informational/commercial/transactional/navigational）与依据；',
    '- pageTitle：title（含关键词的 SEO 标题）、metaDescription、slug；',
    '- headingStructure：h1 与 h2 数组；',
    '- bodyContent：可直接发布的正文（必须不含任何未经证实声明）；',
    '- faq：常见问题与答案；',
    '- imageAlt：商品主图 Alt 建议（image 用图片职责描述）；',
    '- internalLinks：站内链接建议（anchorText/target/reason）；',
    '- jsonLd：Product 或 WebPage JSON-LD 对象；',
    '- pendingFacts：识别到的未经证实信息（认证、销量、排名、搜索量、业务承诺等）。'
  );

  return lines.join('\n');
}

/** 归一化模型输出的 pendingFacts：兼容字符串与缺字段形态，过滤空值。 */
function normalizePendingFacts(result: SeoResult): SeoResult {
  const now = new Date().toISOString();
  const rawFacts: unknown[] = Array.isArray((result as unknown as { pendingFacts?: unknown[] }).pendingFacts)
    ? ((result as unknown as { pendingFacts: unknown[] }).pendingFacts)
    : [];

  const pendingFacts: MarketingFact[] = [];
  for (const raw of rawFacts) {
    if (typeof raw === 'string') {
      const value = raw.trim();
      if (value) {
        pendingFacts.push({ key: '待确认', value, status: 'pending', sourceType: 'model', retrievedAt: now });
      }
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Record<string, unknown>;
    const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';
    if (!value) continue;
    const sourceTypeRaw = candidate.sourceType;
    const sourceType =
      sourceTypeRaw === 'user' || sourceTypeRaw === 'web' || sourceTypeRaw === 'image_analysis' || sourceTypeRaw === 'model'
        ? sourceTypeRaw
        : 'model';
    pendingFacts.push({
      key: typeof candidate.key === 'string' && candidate.key.trim() ? candidate.key.trim() : '待确认',
      value: value.slice(0, 4000),
      status: 'pending',
      sourceType,
      ...(typeof candidate.sourceUrl === 'string' && candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
      retrievedAt: now,
    });
  }
  return { ...result, pendingFacts };
}

export interface FactViolation {
  fact: MarketingFact;
  location: string;
}

/** 校验未经证实的事实是否进入了可发布内容（V3 9.1/9.2）。 */
export function findFactViolations(result: SeoResult): FactViolation[] {
  const publishableLocations: Array<[string, string]> = [
    ['pageTitle.title', result.pageTitle.title],
    ['pageTitle.metaDescription', result.pageTitle.metaDescription],
    ['headingStructure.h1', result.headingStructure.h1],
    ['headingStructure.h2', result.headingStructure.h2.join('\n')],
    ['bodyContent', result.bodyContent],
    ['faq', result.faq.map((entry) => `${entry.question} ${entry.answer}`).join('\n')],
  ];

  const violations: FactViolation[] = [];
  for (const fact of result.pendingFacts) {
    const needle = fact.value.trim();
    if (needle.length < 3) continue;
    for (const [location, text] of publishableLocations) {
      if (text.includes(needle)) {
        violations.push({ fact, location });
      }
    }
  }
  return violations;
}

export class SeoEngine {
  constructor(private client: TextCompletionClient) {}

  async generate(params: SeoParams): Promise<SeoResult> {
    const request = {
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user' as const, content: buildUserPrompt(params) },
      ],
      responseFormat: 'json_object' as const,
      temperature: 0.2,
      maxTokens: 8000,
    };

    const raw = await completeJSON(this.client, request, seoResultSchema, {
      label: 'SEO 结果',
      repair: false,
    });
    const result = normalizePendingFacts(raw);

    const violations = findFactViolations(result);
    if (violations.length === 0) {
      return result;
    }

    // 事实违规：带强化指令修复一次（不属于盲目重试，仅限合规修复）。
    const violationHint = violations
      .map((violation) => `${violation.fact.key}（${violation.fact.value}）出现在 ${violation.location}`)
      .join('；');
    const repaired = await completeJSON(
      this.client,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              buildUserPrompt(params),
              '',
              '注意：上一次结果违反了铁律，以下未经证实的内容出现在可发布字段中，请从标题/正文/FAQ 中移除（或改写为不涉及具体承诺的表述），并保留在 pendingFacts：',
              violationHint,
              '请重新输出完整 JSON。',
            ].join('\n'),
          },
        ],
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 8000,
      },
      seoResultSchema,
      { label: 'SEO 结果（合规修复）', repair: false }
    );
    const repairedResult = normalizePendingFacts(repaired);
    const secondViolations = findFactViolations(repairedResult);
    if (secondViolations.length > 0) {
      throw new TextCompletionError(
        'SEO 结果包含未经证实的声明，已拦截：' +
          secondViolations.map((violation) => violation.fact.value).join('、'),
        'schema_mismatch',
        { retryable: false }
      );
    }
    return repairedResult;
  }
}
