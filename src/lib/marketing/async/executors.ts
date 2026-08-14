import type { MarketingTask, MarketingTaskItem } from '@prisma/client';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { resolveModelWithPrecheck, MarketingServiceError } from '@/lib/marketing/task-common';
import { ProductAnalyzer, CopywritingEngine, PromptEngine } from '@/lib/marketing';
import { TranslateEngine } from '@/lib/marketing/translate-engine';
import { SeoEngine } from '@/lib/marketing/seo-engine';
import { GeoEngine } from '@/lib/marketing/geo-engine';
import { InsightEngine } from '@/lib/search/insight-engine';
import { QueryBudget } from '@/lib/search/SearchAdapter';
import { resolveActiveSearchService } from '@/lib/search/search-service-config';
import type {
  MarketingFact,
  MarketingTaskCreateInput,
  TranslateTaskCreateInput,
  SeoTaskCreateInput,
  GeoTaskCreateInput,
  InsightTaskCreateInput,
} from '@/types/marketing-contract';

// ============================================
// Item 执行器（V3 Phase 6）
// 每个 item 携带输入快照，执行时重新解析模型运行时配置
// （API Key 解密、能力预检），不依赖创建时的内存状态。
// ============================================

function itemInput(item: MarketingTaskItem): Record<string, unknown> {
  return (item.input as Record<string, unknown>) ?? {};
}

export async function executeMarketingItem(
  task: MarketingTask,
  item: MarketingTaskItem
): Promise<unknown> {
  const input = itemInput(item);
  const purpose = item.role === 'vision' ? 'vision' : 'content';
  const model = await resolveModelWithPrecheck(item.userId, item.modelId ?? '', purpose);
  const client = new HttpTextCompletionClient({
    baseURL: model.runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
    apiKey: model.runtimeConfig.apiKey,
    model: model.runtimeConfig.model ?? 'gpt-4o',
  });

  switch (item.kind) {
    case 'analysis': {
      const analyzer = new ProductAnalyzer(model.runtimeConfig);
      return analyzer.analyze({
        images: (input.productImages as string[]) ?? [],
        productName: (input.productName as string) ?? '',
        userHints: {
          category: input.category as never,
          sellPoints: input.sellPoints as string[] | undefined,
          parameters: input.parameters as Record<string, string> | undefined,
        },
      });
    }

    case 'copywriting': {
      const analysis = task.analysis as unknown as never;
      if (!analysis) throw new Error('缺少产品分析结果');
      const result = await new CopywritingEngine(model.runtimeConfig).generate(
        analysis,
        (input.platform as never) ?? 'taobao',
        (input.language as never) ?? 'zh-CN',
        input.keywords as string[] | undefined
      );
      return result;
    }

    case 'mainPrompts': {
      const analysis = task.analysis as unknown as never;
      if (!analysis) throw new Error('缺少产品分析结果');
      return new PromptEngine(model.runtimeConfig).generateMainImagePrompts(
        analysis,
        (input.platform as never) ?? 'taobao',
        (input.language as never) ?? 'zh-CN',
        input.sellPoints as string[] | undefined
      );
    }

    case 'detailPrompts': {
      const analysis = task.analysis as unknown as never;
      if (!analysis) throw new Error('缺少产品分析结果');
      return new PromptEngine(model.runtimeConfig).generateDetailPagePrompts(
        analysis,
        (input.platform as never) ?? 'taobao',
        (input.language as never) ?? 'zh-CN'
      );
    }

    default: {
      if (item.kind.startsWith('translate:')) {
        const targetLanguage = item.kind.slice('translate:'.length);
        return new TranslateEngine(client).translate({
          sourceText: (input.sourceText as string) ?? '',
          sourceLanguage: (input.sourceLanguage as string) ?? 'auto',
          targetLanguage,
        });
      }
      if (item.kind === 'seo') {
        return new SeoEngine(client).generate({
          productName: (input.productName as string) ?? '',
          sourceContent: input.sourceContent as string | undefined,
          keywords: (input.keywords as string[]) ?? [],
          category: input.category as string | undefined,
          language: (input.language as string) ?? 'zh-CN',
          facts: input.facts as MarketingFact[] | undefined,
        });
      }
      if (item.kind === 'geo') {
        const enableSearch = input.enableSearch === true;
        if (enableSearch) {
          const searchService = await resolveActiveSearchService(item.userId);
          if (!searchService) {
            throw new MarketingServiceError(
              'SEARCH_NOT_CONFIGURED',
              '联网 GEO 需要搜索服务：请先在设置中配置并实测通过搜索服务'
            );
          }
          const budget = new QueryBudget(5);
          return new GeoEngine(client).generateOnline(
            {
              question: (input.question as string) ?? '',
              brandName: (input.brandName as string) ?? '',
              sourceContent: input.sourceContent as string | undefined,
              keywords: input.keywords as string[] | undefined,
              language: (input.language as string) ?? 'zh-CN',
              facts: input.facts as MarketingFact[] | undefined,
            },
            searchService.adapter,
            budget
          );
        }
        return new GeoEngine(client).generate({
          question: (input.question as string) ?? '',
          brandName: (input.brandName as string) ?? '',
          sourceContent: input.sourceContent as string | undefined,
          keywords: input.keywords as string[] | undefined,
          language: (input.language as string) ?? 'zh-CN',
          facts: input.facts as MarketingFact[] | undefined,
        });
      }
      if (item.kind.startsWith('insight:')) {
        const searchService = await resolveActiveSearchService(item.userId);
        if (!searchService) {
          throw new MarketingServiceError(
            'SEARCH_NOT_CONFIGURED',
            '市场洞察需要联网搜索服务：请先在设置中配置并实测通过搜索服务'
          );
        }
        const insightType = item.kind.slice('insight:'.length) as InsightTaskCreateInput['type'];
        const budget = new QueryBudget(searchService.config.maxQueriesPerTask);
        const engine = new InsightEngine(client, searchService.adapter, budget);
        const generation = await engine.generate({
          type: insightType,
          productName: (input.productName as string) ?? '',
          category: input.category as string | undefined,
          market: input.market as string | undefined,
          language: (input.language as string) ?? 'zh-CN',
          facts: input.facts as MarketingFact[] | undefined,
        });
        return generation.report;
      }
      throw new Error(`未知的 item 类型：${item.kind}`);
    }
  }
}

/** 兼容导入：类型引用避免未使用告警。 */
export type ExecutorTask = MarketingTask;
export type ExecutorItem = MarketingTaskItem;
export type ExecutorTaskInput =
  | MarketingTaskCreateInput
  | TranslateTaskCreateInput
  | SeoTaskCreateInput
  | GeoTaskCreateInput
  | InsightTaskCreateInput;
