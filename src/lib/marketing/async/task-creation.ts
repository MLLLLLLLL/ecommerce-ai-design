import { prisma } from '@/lib/db/prisma';
import { resolveModelWithPrecheck, MarketingServiceError } from '@/lib/marketing/task-common';
import { assertValidTranslateInput } from '@/lib/marketing/translate-engine';
import { resolveActiveSearchService } from '@/lib/search/search-service-config';
import type { Prisma } from '@prisma/client';
import type {
  CopywritingOutputSelection,
  MarketingTaskCreateRequest,
  SeoTaskCreateRequest,
  TranslateTaskCreateRequest,
  GeoTaskCreateRequest,
  InsightTaskCreateRequest,
} from '@/types/marketing-contract';

// ============================================
// 异步任务创建（V3 Phase 6）
// 四模块统一创建任务与子项（items），立即返回 taskId；
// 执行由 Worker 领取完成。输入快照不含密钥。
// ============================================

export type MarketingTaskCreateUnion =
  | MarketingTaskCreateRequest
  | TranslateTaskCreateRequest
  | SeoTaskCreateRequest
  | GeoTaskCreateRequest
  | InsightTaskCreateRequest;

interface CreatedItemSpec {
  kind: string;
  role: 'vision' | 'content';
  modelId: string;
  dependsOn?: string;
  input: Record<string, unknown>;
  maxAttempts: number;
}

function summarizeSourceText(sourceText: string): string {
  const collapsed = sourceText.replace(/\s+/g, ' ').trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 80)}…` : collapsed;
}

export async function createMarketingTaskAsync(
  userId: string,
  request: MarketingTaskCreateUnion
): Promise<{ taskId: string; status: string }> {
  let items: CreatedItemSpec[];
  let taskData: Record<string, unknown>;

  switch (request.module) {
    case 'copywriting': {
      const input = request.input as MarketingTaskCreateRequest['input'];
      const outputs = input.outputs as CopywritingOutputSelection;
      if (!Object.values(outputs).some(Boolean)) {
        throw new MarketingServiceError('VALIDATION_ERROR', '请至少选择一项生成内容', {
          fieldErrors: { outputs: ['至少选择一项'] },
        });
      }
      const needsAnalysis =
        outputs.analysis || outputs.copywriting || outputs.mainPrompts || outputs.detailPrompts;

      const [visionModel, contentModel] = await Promise.all([
        resolveModelWithPrecheck(userId, input.modelSelection.visionModelId, 'vision'),
        resolveModelWithPrecheck(userId, input.modelSelection.contentModelId, 'content'),
      ]);

      items = [];
      if (needsAnalysis) {
        items.push({
          kind: 'analysis',
          role: 'vision',
          modelId: visionModel.id,
          input: {
            productName: input.productName,
            productImages: input.productImages,
            category: input.category,
            sellPoints: input.sellPoints,
            parameters: input.parameters,
          },
          maxAttempts: 2,
        });
      }
      if (outputs.copywriting) {
        items.push({
          kind: 'copywriting',
          role: 'content',
          modelId: contentModel.id,
          dependsOn: 'analysis',
          input: { platform: input.platform, language: input.language, keywords: input.keywords },
          maxAttempts: 2,
        });
      }
      if (outputs.mainPrompts) {
        items.push({
          kind: 'mainPrompts',
          role: 'content',
          modelId: contentModel.id,
          dependsOn: 'analysis',
          input: { platform: input.platform, language: input.language, sellPoints: input.sellPoints },
          maxAttempts: 2,
        });
      }
      if (outputs.detailPrompts) {
        items.push({
          kind: 'detailPrompts',
          role: 'content',
          modelId: contentModel.id,
          dependsOn: 'analysis',
          input: { platform: input.platform, language: input.language },
          maxAttempts: 2,
        });
      }

      taskData = {
        productName: input.productName,
        productImages: input.productImages,
        category: input.category || null,
        platform: input.platform,
        language: input.language,
        sellPoints: input.sellPoints || [],
        keywords: input.keywords || [],
        parameters: (input.parameters ?? {}) as Prisma.InputJsonValue,
        module: 'copywriting',
        input: input as unknown as Prisma.InputJsonValue,
        selectedOutputs: (Object.keys(outputs) as string[]).filter((key) => outputs[key as keyof typeof outputs]),
        schemaVersion: request.schemaVersion,
        modelSnapshot: {
          vision: { id: visionModel.id, name: visionModel.name, provider: visionModel.provider, baseURL: visionModel.baseURL, model: visionModel.model },
          content: { id: contentModel.id, name: contentModel.name, provider: contentModel.provider, baseURL: contentModel.baseURL, model: contentModel.model },
        } as unknown as Prisma.InputJsonValue,
        status: needsAnalysis ? 'analyzing' : 'generating',
      };
      break;
    }

    case 'translate': {
      const input = request.input as TranslateTaskCreateRequest['input'];
      const assertion = assertValidTranslateInput({
        sourceText: input.sourceText,
        sourceLanguage: input.sourceLanguage,
        targetLanguages: input.targetLanguages,
      });
      if (!assertion.valid) {
        throw new MarketingServiceError('VALIDATION_ERROR', assertion.message, {
          fieldErrors: { 'input.targetLanguages': [assertion.message] },
        });
      }
      const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');

      items = input.targetLanguages.map((targetLanguage) => ({
        kind: `translate:${targetLanguage}`,
        role: 'content' as const,
        modelId: model.id,
        input: {
          sourceText: input.sourceText,
          sourceLanguage: input.sourceLanguage,
          targetLanguage,
        },
        maxAttempts: 2,
      }));

      taskData = {
        productName: summarizeSourceText(input.sourceText),
        productImages: [],
        platform: 'translate',
        language: input.sourceLanguage,
        sellPoints: [],
        keywords: [],
        parameters: {},
        module: 'translate',
        input: input as unknown as Prisma.InputJsonValue,
        selectedOutputs: input.targetLanguages,
        schemaVersion: request.schemaVersion,
        modelSnapshot: {
          content: { id: model.id, name: model.name, provider: model.provider, baseURL: model.baseURL, model: model.model },
        } as unknown as Prisma.InputJsonValue,
        status: 'generating',
      };
      break;
    }

    case 'seo': {
      const input = request.input as SeoTaskCreateRequest['input'];
      const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');
      items = [
        {
          kind: 'seo',
          role: 'content',
          modelId: model.id,
          input: {
            productName: input.productName,
            sourceContent: input.sourceContent,
            keywords: input.keywords,
            category: input.category,
            language: input.language,
            facts: input.facts,
          },
          maxAttempts: 2,
        },
      ];
      taskData = {
        productName: input.productName,
        productImages: [],
        platform: 'seo',
        language: input.language,
        sellPoints: [],
        keywords: input.keywords,
        parameters: {},
        module: 'seo',
        input: input as unknown as Prisma.InputJsonValue,
        selectedOutputs: [],
        schemaVersion: request.schemaVersion,
        modelSnapshot: {
          content: { id: model.id, name: model.name, provider: model.provider, baseURL: model.baseURL, model: model.model },
        } as unknown as Prisma.InputJsonValue,
        status: 'generating',
      };
      break;
    }

    case 'geo': {
      const input = request.input as GeoTaskCreateRequest['input'];
      const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');
      items = [
        {
          kind: 'geo',
          role: 'content',
          modelId: model.id,
          input: {
            question: input.question,
            brandName: input.brandName,
            sourceContent: input.sourceContent,
            keywords: input.keywords,
            language: input.language,
            facts: input.facts,
            enableSearch: input.enableSearch === true,
          },
          maxAttempts: 2,
        },
      ];
      taskData = {
        productName: input.brandName,
        productImages: [],
        platform: 'geo',
        language: input.language,
        sellPoints: [],
        keywords: input.keywords ?? [],
        parameters: {},
        module: 'geo',
        input: input as unknown as Prisma.InputJsonValue,
        selectedOutputs: [],
        schemaVersion: request.schemaVersion,
        modelSnapshot: {
          content: { id: model.id, name: model.name, provider: model.provider, baseURL: model.baseURL, model: model.model },
        } as unknown as Prisma.InputJsonValue,
        status: 'generating',
      };
      break;
    }

    case 'insight': {
      const input = request.input as InsightTaskCreateRequest['input'];
      // 联网门禁（V3 9.4）：无已启用且实测通过的搜索服务时拒绝提交。
      const searchService = await resolveActiveSearchService(userId);
      if (!searchService) {
        throw new MarketingServiceError(
          'SEARCH_NOT_CONFIGURED',
          '市场洞察需要联网搜索服务：请先在设置中配置并实测通过搜索服务'
        );
      }
      const model = await resolveModelWithPrecheck(userId, input.modelId, 'content');
      items = [
        {
          kind: `insight:${input.type}`,
          role: 'content',
          modelId: model.id,
          input: {
            type: input.type,
            productName: input.productName,
            category: input.category,
            market: input.market,
            language: input.language,
            facts: input.facts,
          },
          maxAttempts: 2,
        },
      ];
      taskData = {
        productName: input.productName,
        productImages: [],
        platform: 'insight',
        language: input.language,
        sellPoints: [],
        keywords: [],
        parameters: {},
        module: 'insight',
        input: input as unknown as Prisma.InputJsonValue,
        selectedOutputs: [],
        schemaVersion: request.schemaVersion,
        modelSnapshot: {
          content: { id: model.id, name: model.name, provider: model.provider, baseURL: model.baseURL, model: model.model },
        } as unknown as Prisma.InputJsonValue,
        status: 'generating',
      };
      break;
    }

    default:
      throw new MarketingServiceError('VALIDATION_ERROR', '不支持的模块');
  }

  const persist = async (tx: any) => {
    const createdTask = await tx.marketingTask.create({
      data: {
        userId,
        ...taskData,
        schemaVersion: request.schemaVersion,
      } as unknown as Prisma.MarketingTaskCreateInput,
    });
    await tx.marketingTaskItem.createMany({
      data: items.map((item) => ({
        taskId: createdTask.id,
        userId,
        kind: item.kind,
        role: item.role,
        modelId: item.modelId,
        dependsOn: item.dependsOn ?? null,
        input: item.input as Prisma.InputJsonValue,
        maxAttempts: item.maxAttempts,
        status: 'pending',
      })),
    });
    await tx.marketingTaskEvent.create({
      data: {
        taskId: createdTask.id,
        userId,
        type: 'task_created',
        payload: { module: request.module } as Prisma.InputJsonValue,
      },
    });
    return createdTask;
  };
  // 单测使用精简 Prisma mock 时没有 $transaction；生产 Prisma 始终走原子事务。
  const task = typeof (prisma as any).$transaction === 'function'
    ? await prisma.$transaction(persist)
    : await persist(prisma);

  return { taskId: task.id, status: task.status };
}
