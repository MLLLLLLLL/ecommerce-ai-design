import { completeJSON } from '@/lib/ai/json-response';
import { TextCompletionClient } from '@/lib/ai/text-completion-client';
import { getLanguageOption } from '@/lib/marketing/languages';
import { insightResultSchema } from '@/lib/marketing/schemas';
import { QueryBudget, SearchAdapter, SearchSource } from '@/lib/search/SearchAdapter';
import type {
  InsightResult,
  InsightType,
  MarketingFact,
} from '@/types/marketing-contract';

// ============================================
// 市场洞察引擎（V3 Phase 7 / ADR-0001）
// 四种洞察：竞品分析 / 趋势洞察 / 用户需求分析 / 价格与定位分析。
// 流程：搜索（配额内）→ 结果注入 → 模型生成报告（Zod 校验）。
// 每条外部结论必须有来源；无来源时明确降级（degraded）。
// ============================================

export interface InsightParams {
  type: InsightType;
  productName: string;
  category?: string;
  market?: string;
  language: string;
  facts?: MarketingFact[];
}

const TYPE_LABEL: Record<InsightType, string> = {
  competitor: '竞品分析',
  trends: '趋势洞察',
  needs: '用户需求分析',
  pricing: '价格与定位分析',
};

function buildQueries(params: InsightParams): string[] {
  const base = params.productName;
  const market = params.market ? ` ${params.market}` : '';
  switch (params.type) {
    case 'competitor':
      return [`${base} 竞品`, `${base} 对比 评测`, `${base} 口碑 缺点`, `${base}${market} 品牌`];
    case 'trends':
      return [`${base} 趋势`, `${base} 2026 流行`, `${base} 消费趋势`, `${base} 行业报告`];
    case 'needs':
      return [`${base} 用户评价`, `${base} 痛点`, `${base} 差评 常见问题`, `${base} 需求 建议`];
    case 'pricing':
      return [`${base} 价格`, `${base} 多少钱`, `${base} 性价比`, `${base} 价格区间`];
  }
}

const SYSTEM_PROMPT = [
  '你是资深电商市场分析师。基于提供的联网搜索摘要生成市场洞察报告。',
  '',
  '铁律（必须遵守）：',
  '1. 外部结论必须来自下方「搜索摘要」，每条结论在对应 section 中标注来源编号（如 [1]），编号与搜索摘要序号一致；',
  '2. 搜索摘要中没有的信息不得编造；本地已确认事实可以用，但不得与搜索结论混淆；',
  '3. 不编造搜索量、排名、市场份额等具体数字（摘要中明确出现的除外）；',
  '4. 报告使用目标输出语言；',
  '5. 只输出 JSON，不要任何解释或 Markdown。',
].join('\n');

function buildUserPrompt(params: InsightParams, sources: SearchSource[], degraded: boolean): string {
  const languageLabel = getLanguageOption(params.language)?.label ?? params.language;
  const lines: string[] = [
    `洞察类型：${TYPE_LABEL[params.type]}（${params.type}）`,
    `商品/品类：${params.productName}`,
    ...(params.category ? [`品类：${params.category}`] : []),
    ...(params.market ? [`目标市场：${params.market}`] : []),
    `目标输出语言：${languageLabel}`,
  ];

  const confirmedFacts = (params.facts ?? []).filter((fact) => fact.status === 'confirmed');
  if (confirmedFacts.length > 0) {
    lines.push('本地已确认事实：');
    for (const fact of confirmedFacts) {
      lines.push(`- ${fact.key}：${fact.value}`);
    }
  }

  if (sources.length > 0) {
    lines.push('', '搜索摘要（只能引用以下内容）：');
    sources.forEach((source, index) => {
      lines.push(`[${index + 1}] ${source.title}（${source.url}）\n${source.snippet}`);
    });
    lines.push(
      '',
      `联网状态：${degraded ? '部分查询失败或配额用尽，仅以上来源可用' : '查询正常完成'}`
    );
  } else {
    lines.push(
      '',
      '联网状态：未获取到任何联网来源（degraded=true）。报告仅基于本地已确认事实与常识性分析，且必须在 summary 开头注明「未能获取联网信息，以下内容仅基于本地信息」。'
    );
  }

  lines.push(
    '',
    '请输出 JSON：',
    '- type：洞察类型；',
    '- productName：商品/品类；',
    '- summary：执行摘要（3-5 句）；',
    '- sections：分节报告（标题+内容，外部结论标注 [编号]）；',
    '- keyFindings：关键发现（3-8 条）；',
    '- recommendations：行动建议；',
    '- sources：本次使用的来源列表（title/url/snippet，与搜索摘要一致）；',
    '- degraded：是否降级（布尔值）；',
    '- retrievedAt：本次检索时间（由你使用搜索摘要的检索时间）。'
  );

  return lines.join('\n');
}

export interface InsightGeneration {
  report: InsightResult;
  sources: SearchSource[];
  queriesUsed: number;
  degraded: boolean;
}

export class InsightEngine {
  constructor(
    private client: TextCompletionClient,
    private searcher: SearchAdapter,
    private budget: QueryBudget
  ) {}

  async generate(params: InsightParams): Promise<InsightGeneration> {
    const queries = buildQueries(params);
    const sources: SearchSource[] = [];
    let degraded = false;
    let queriesUsed = 0;

    for (const query of queries) {
      if (this.budget.exhausted) {
        degraded = true;
        break;
      }
      this.budget.consume();
      queriesUsed += 1;
      const result = await this.searcher.search(query);
      if (result.degraded) degraded = true;
      sources.push(...result.sources);
    }

    const deduped = dedupeSources(sources);
    const retrievedAt = new Date().toISOString();
    const raw = await completeJSON(
      this.client,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(params, deduped, degraded) },
        ],
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 8000,
      },
      insightResultSchema,
      { label: '洞察报告', repair: false }
    );

    const report: InsightResult = {
      ...raw,
      type: params.type,
      productName: params.productName,
      sources: deduped,
      degraded: degraded || deduped.length === 0,
      retrievedAt,
    };

    return { report, sources: deduped, queriesUsed, degraded: report.degraded };
  }
}

function dedupeSources(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  const result: SearchSource[] = [];
  for (const source of sources) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    result.push(source);
    if (result.length >= 30) break;
  }
  return result;
}
