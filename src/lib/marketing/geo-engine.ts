import { completeJSON } from '@/lib/ai/json-response';
import { TextCompletionError, TextCompletionClient } from '@/lib/ai/text-completion-client';
import { getLanguageOption } from '@/lib/marketing/languages';
import { geoOnlineResultSchema, geoResultSchema } from '@/lib/marketing/schemas';
import { QueryBudget, SearchAdapter, SearchSource } from '@/lib/search/SearchAdapter';
import type { GeoResult, MarketingFact } from '@/types/marketing-contract';

// ============================================
// GEO 优化引擎（V3 9.3 离线版）
// 只基于用户事实与已有内容生成 AI 搜索引擎友好内容。
// 铁律：
// 1. 不联网、不使用模型训练记忆补充事实；
// 2. 不生成来源列表、引用编号、"已核实"标识或实时性文案；
// 3. 未经证实内容进入 pendingFacts，不进入 directAnswer/supportingContent/faq；
// 4. claims 的 factKey 必须引用输入中的已确认事实 key。
// 前端与导出层强制展示"本结果未联网核实"声明。
// ============================================

export interface GeoParams {
  question: string;
  brandName: string;
  sourceContent?: string;
  keywords?: string[];
  language: string;
  facts?: MarketingFact[];
}

const SYSTEM_PROMPT = [
  '你是 GEO（生成引擎优化）内容专家，为 AI 搜索引擎（如 ChatGPT、Perplexity 等）生成品牌友好、可被引用的回答内容。',
  '',
  '铁律（必须遵守）：',
  '1. 只使用「已确认事实」与用户提供的内容生成回答；不得联网、不得使用模型训练记忆补充任何事实；',
  '2. 不得生成来源列表、引用编号（如 [1]）、"已核实/经核实"标识，不得使用"最新""实时""截至20XX年"等实时性文案；',
  '3. 未经证实的内容不得进入 directAnswer、supportingContent 或 faq，必须列入 pendingFacts（status="pending"，sourceType="model"）；',
  '4. claims 是事实断言列表，每条 text 必须基于输入中的已确认事实，factKey 必须填写对应事实的 key（不得编造不存在的 key）；',
  '5. directAnswer 用 2-4 句精炼回答（AI 搜索偏好直接答案），supportingContent 提供支撑细节；',
  '6. 输出使用目标语言；',
  '7. 只输出 JSON，不要任何解释或 Markdown。',
].join('\n');

function buildUserPrompt(params: GeoParams): string {
  const languageLabel = getLanguageOption(params.language)?.label ?? params.language;
  const lines: string[] = [
    `用户问题：${params.question}`,
    `品牌/产品名称：${params.brandName}`,
    `目标输出语言：${languageLabel}`,
    ...(params.keywords?.length ? [`相关关键词：${params.keywords.join('、')}`] : []),
    ...(params.sourceContent?.trim() ? [`已有内容：\n${params.sourceContent.trim()}`] : []),
  ];

  const confirmedFacts = (params.facts ?? []).filter((fact) => fact.status === 'confirmed');
  if (confirmedFacts.length > 0) {
    lines.push('已确认事实（唯一事实来源）：');
    for (const fact of confirmedFacts) {
      lines.push(`- key: ${fact.key}，value: ${fact.value}`);
    }
  } else {
    lines.push('已确认事实：无（只使用品牌名称与已有内容，不得编造事实）');
  }

  lines.push(
    '',
    '请输出 JSON，字段：',
    '- question：回显用户问题；',
    '- directAnswer：2-4 句精炼直接回答；',
    '- supportingContent：支撑性详细内容（段落与列表）；',
    '- faq：AI 搜索可能追问的相关问题与答案；',
    '- claims：事实断言列表（text + factKey 引用已确认事实 key）；',
    '- pendingFacts：无法证实的信息（不得进入上述可发布字段）。'
  );

  return lines.join('\n');
}

/** 禁止模式：来源列表、引用编号、已核实标识、实时性文案（V3 9.3）。 */
const BANNED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /已核实|经核实|核实过/, label: '已核实标识' },
  { pattern: /来源[:：]|参考来源|数据来源/, label: '来源列表' },
  { pattern: /\[\d+\]/, label: '引用编号' },
  { pattern: /截至\s?20\d{2}|最新|实时|最近发布/, label: '实时性文案' },
];

export interface GeoViolation {
  label: string;
  location: string;
  matched: string;
}

/** 校验离线铁律：禁止来源/引用/已核实/实时性文案出现在可发布内容中。 */
export function findBannedContentViolations(result: GeoResult): GeoViolation[] {
  const locations: Array<[string, string]> = [
    ['directAnswer', result.directAnswer],
    ['supportingContent', result.supportingContent],
    ['faq', result.faq.map((entry) => `${entry.question} ${entry.answer}`).join('\n')],
  ];
  const violations: GeoViolation[] = [];
  for (const [location, text] of locations) {
    for (const { pattern, label } of BANNED_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        violations.push({ label, location, matched: match[0] });
      }
    }
  }
  return violations;
}

/** 校验 claims 的 factKey 必须引用输入中的已确认事实 key。 */
export function findClaimKeyViolations(result: GeoResult, factKeys: Set<string>): string[] {
  return result.claims
    .filter((claim) => !factKeys.has(claim.factKey))
    .map((claim) => claim.factKey);
}

/** 校验 pendingFacts 值是否泄漏进可发布内容。 */
export function findGeoFactLeaks(result: GeoResult): string[] {
  const publishable = [
    result.directAnswer,
    result.supportingContent,
    result.faq.map((entry) => `${entry.question} ${entry.answer}`).join('\n'),
  ].join('\n');
  return result.pendingFacts
    .filter((fact) => fact.value.trim().length >= 3 && publishable.includes(fact.value.trim()))
    .map((fact) => fact.value);
}

function normalizePendingFacts(result: GeoResult): GeoResult {
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

export class GeoEngine {
  constructor(private client: TextCompletionClient) {}

  async generate(params: GeoParams): Promise<GeoResult> {
    const factKeys = new Set(
      (params.facts ?? []).filter((fact) => fact.status === 'confirmed').map((fact) => fact.key)
    );

    const request = {
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user' as const, content: buildUserPrompt(params) },
      ],
      responseFormat: 'json_object' as const,
      temperature: 0.2,
      maxTokens: 8000,
    };

    const raw = await completeJSON(this.client, request, geoResultSchema, {
      label: 'GEO 结果',
      repair: false,
    });
    const result = normalizePendingFacts(raw);

    const violations = this.collectViolations(result, factKeys);
    if (violations.length === 0) {
      return result;
    }

    // 离线铁律违规：带强化指令修复一次（合规修复，非盲目重试）。
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
              '注意：上一次结果违反离线铁律，请修正：',
              violations.join('\n'),
              '请重新输出完整 JSON。',
            ].join('\n'),
          },
        ],
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 8000,
      },
      geoResultSchema,
      { label: 'GEO 结果（合规修复）', repair: false }
    );
    const repairedResult = normalizePendingFacts(repaired);
    const secondViolations = this.collectViolations(repairedResult, factKeys);
    if (secondViolations.length > 0) {
      throw new TextCompletionError(
        'GEO 结果违反离线铁律，已拦截：' + secondViolations.join('；'),
        'schema_mismatch',
        { retryable: false }
      );
    }
    return repairedResult;
  }

  private collectViolations(result: GeoResult, factKeys: Set<string>): string[] {
    const violations: string[] = [];

    for (const violation of findBannedContentViolations(result)) {
      violations.push(`[${violation.label}] 出现在 ${violation.location}（匹配：${violation.matched}），请移除并改写为无实时性、无来源声称的表述`);
    }
    for (const leak of findGeoFactLeaks(result)) {
      violations.push(`未经证实内容「${leak}」出现在可发布字段，请移除并保留在 pendingFacts`);
    }
    const badKeys = findClaimKeyViolations(result, factKeys);
    for (const key of badKeys) {
      violations.push(`claims 中 factKey「${key}」不在已确认事实列表中，请改为引用真实的事实 key 或移除该条`);
    }
    return violations;
  }

  // ============================================
  // 联网版（V3 Phase 7 / ADR-0001）
  // 基于搜索来源生成，输出携带 sources/retrievedAt/degraded；
  // 外部结论可追溯，无来源时明确降级。
  // ============================================

  async generateOnline(
    params: GeoParams,
    searcher: SearchAdapter,
    budget: QueryBudget
  ): Promise<GeoResult> {
    const sources: SearchSource[] = [];
    let degraded = false;
    const queries = [
      `${params.brandName} ${params.question}`,
      ...(params.keywords?.slice(0, 2).map((keyword) => `${keyword} 评测`) ?? []),
    ];

    for (const query of queries) {
      if (budget.exhausted) {
        degraded = true;
        break;
      }
      budget.consume();
      const result = await searcher.search(query);
      if (result.degraded) degraded = true;
      sources.push(...result.sources);
    }

    const deduped: SearchSource[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      if (!source.url || seen.has(source.url)) continue;
      seen.add(source.url);
      deduped.push(source);
      if (deduped.length >= 20) break;
    }

    const retrievedAt = new Date().toISOString();
    const onlinePrompt = [
      SYSTEM_PROMPT,
      '',
      '联网版补充规则：',
      '1. 外部结论必须来自下方「搜索摘要」，并标注来源编号 [1]、[2]…（编号与摘要序号一致）；',
      '2. 不得编造摘要中不存在的事实；摘要未覆盖的内容只能使用本地已确认事实；',
      '3. sources 数组必须包含你实际引用的来源（title/url/snippet 与摘要一致）；',
      '4. degraded 为布尔值：查询失败或配额用尽时为 true；retrievedAt 为本次检索时间。',
    ].join('\n');

    const raw = await completeJSON(
      this.client,
      {
        messages: [
          { role: 'system', content: onlinePrompt },
          {
            role: 'user',
            content: [
              buildUserPrompt(params),
              '',
              '搜索摘要（只能引用以下内容）：',
              ...(deduped.length > 0
                ? deduped.map((source, index) => `[${index + 1}] ${source.title}（${source.url}）\n${source.snippet}`)
                : ['（未获取到任何联网来源）']),
              `联网状态：${degraded || deduped.length === 0 ? '降级（部分查询失败/配额用尽/无来源）' : '正常'}`,
              '',
              '请输出 JSON（离线字段 + sources/degraded/retrievedAt）。',
            ].join('\n'),
          },
        ],
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 8000,
      },
      geoOnlineResultSchema,
      { label: 'GEO 联网结果', repair: false }
    );

    const normalized = normalizePendingFacts(raw);
    const factKeys = new Set(
      (params.facts ?? []).filter((fact) => fact.status === 'confirmed').map((fact) => fact.key)
    );
    const violations = this.collectViolations(normalized, factKeys);
    if (violations.length > 0) {
      throw new TextCompletionError(
        'GEO 联网结果违反事实铁律，已拦截：' + violations.join('；'),
        'schema_mismatch',
        { retryable: false }
      );
    }

    return {
      ...normalized,
      sources: deduped,
      degraded: degraded || deduped.length === 0,
      retrievedAt,
    };
  }
}
