import { prisma } from '@/lib/db/prisma';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import { runWithConcurrency, marketingConcurrencyKey } from '@/lib/marketing/concurrency';
import { aggregateOutcomeStatus } from '@/lib/marketing/task-status';
import {
  mapUpstreamError,
  MarketingServiceError,
  resolveModelWithPrecheck,
  toStepError,
} from '@/lib/marketing/task-common';
import {
  assertValidTranslateInput,
  TranslateEngine,
} from '@/lib/marketing/translate-engine';
import type { Prisma } from '@prisma/client';
import type {
  ExecutionStep,
  MarketingTaskStatus,
  TranslateTaskCreateRequest,
  TranslateTaskResultSnapshot,
} from '@/types/marketing-contract';

// ============================================
// 翻译任务服务（V3 Phase 3）
// 一次最多 10 种目标语言，最大同时请求 3 种；
// 部分失败保留成功结果；聚合后一次写回。
// ============================================

export interface TranslateTaskOutcome {
  taskId: string;
  status: MarketingTaskStatus;
  result: TranslateTaskResultSnapshot;
  steps: Record<string, ExecutionStep>;
  error?: string;
}

function summarizeSourceText(sourceText: string): string {
  const collapsed = sourceText.replace(/\s+/g, ' ').trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 80)}…` : collapsed;
}

export async function generateTranslateTask(
  userId: string,
  request: TranslateTaskCreateRequest
): Promise<TranslateTaskOutcome> {
  const input = request.input;

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

  const steps: Record<string, ExecutionStep> = {};
  for (const language of input.targetLanguages) {
    steps[language] = { status: 'pending', role: 'content', modelId: model.id };
  }

  const task = await prisma.marketingTask.create({
    data: {
      userId,
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
        content: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          baseURL: model.baseURL,
          model: model.model,
        },
      } as unknown as Prisma.InputJsonValue,
      executionSteps: { languages: steps } as unknown as Prisma.InputJsonValue,
      status: 'generating',
    },
  });
  const taskId = task.id;

  const client = new HttpTextCompletionClient({
    baseURL: model.runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
    apiKey: model.runtimeConfig.apiKey,
    model: model.runtimeConfig.model ?? 'gpt-4o',
  });
  const engine = new TranslateEngine(client);

  const translations: TranslateTaskResultSnapshot['translations'] = {};

  try {
    const settled = await Promise.allSettled(
      input.targetLanguages.map((targetLanguage) =>
        runWithConcurrency(marketingConcurrencyKey(userId, model.id), async () => {
          const startedAt = Date.now();
          steps[targetLanguage] = {
            ...steps[targetLanguage],
            status: 'running',
            startedAt: new Date().toISOString(),
          };
          const translation = await engine.translate({
            sourceText: input.sourceText,
            sourceLanguage: input.sourceLanguage,
            targetLanguage,
          });
          translations[targetLanguage] = { status: 'completed', translation };
          steps[targetLanguage] = {
            ...steps[targetLanguage],
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
          };
        })
      )
    );

    for (const [index, targetLanguage] of input.targetLanguages.entries()) {
      const outcome = settled[index];
      if (outcome.status === 'rejected') {
        const message = outcome.reason instanceof Error ? outcome.reason.message.slice(0, 1000) : '翻译失败';
        translations[targetLanguage] = { status: 'failed', error: message };
        steps[targetLanguage] = {
          ...steps[targetLanguage],
          status: 'failed',
          completedAt: new Date().toISOString(),
          ...toStepError(outcome.reason),
        };
      }
    }

    const result: TranslateTaskResultSnapshot = {
      sourceText: input.sourceText,
      sourceLanguage: input.sourceLanguage,
      translations,
    };

    const status = aggregateOutcomeStatus(
      input.targetLanguages.map((language) => steps[language])
    );
    const failedLanguages = input.targetLanguages.filter(
      (language) => steps[language].status === 'failed'
    );
    const errorMessage =
      failedLanguages.length > 0
        ? failedLanguages
            .map((language) => `${language}: ${steps[language].error ?? '失败'}`)
            .join('；')
            .slice(0, 2000)
        : null;

    // 聚合器一次写回（避免丢失更新）
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: {
        status,
        error: errorMessage,
        result: result as unknown as Prisma.InputJsonValue,
        executionSteps: { languages: steps } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      taskId,
      status,
      result,
      steps,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  } catch (error) {
    const mapped = mapUpstreamError(error);
    await prisma.marketingTask
      .update({
        where: { id: taskId },
        data: {
          status: 'failed',
          error: mapped.message.slice(0, 2000),
          executionSteps: { languages: steps } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    throw mapped;
  }
}
