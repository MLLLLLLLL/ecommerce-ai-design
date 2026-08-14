import type { MarketingTask, MarketingTaskItem } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { aggregateOutcomeStatus } from '@/lib/marketing/task-status';
import { ITEM_TERMINAL_STATUSES } from '@/lib/marketing/async/types';
import type { Prisma } from '@prisma/client';
import type {
  MarketingFact,
  MarketingTaskResultSnapshot,
  MarketingTaskStatus,
} from '@/types/marketing-contract';

// ============================================
// 任务聚合（V3 Phase 6）
// 所有 item 到达终态后一次写回任务状态与结果，
// 避免多个 Worker 对同一 JSON 字段的丢失更新。
// 同时维护旧接口兼容字段（analysis/copywriting/mainPrompts/detailPrompts）。
// ============================================

export async function appendTaskEvent(
  taskId: string,
  userId: string,
  type: string,
  payload?: Record<string, unknown>,
  itemId?: string
): Promise<void> {
  await prisma.marketingTaskEvent
    .create({
      data: {
        taskId,
        userId,
        itemId: itemId ?? null,
        type,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);
}

function buildFacts(
  taskInput: Record<string, unknown>,
  analysis: Record<string, unknown> | null
): { facts: MarketingFact[]; pendingFacts: MarketingFact[] } {
  const facts: MarketingFact[] = [];
  const pendingFacts: MarketingFact[] = [];
  const now = new Date().toISOString();

  const productName = taskInput.productName;
  if (typeof productName === 'string' && productName) {
    facts.push({ key: 'productName', value: productName, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }
  for (const point of (taskInput.sellPoints as string[] | undefined) ?? []) {
    facts.push({ key: 'sellPoint', value: point, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }
  for (const keyword of (taskInput.keywords as string[] | undefined) ?? []) {
    facts.push({ key: 'keyword', value: keyword, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }
  for (const [key, value] of Object.entries((taskInput.parameters as Record<string, string> | undefined) ?? {})) {
    facts.push({ key: `parameter:${key}`, value, status: 'confirmed', sourceType: 'user', retrievedAt: now });
  }

  if (analysis) {
    const confirmed = analysis.confirmed;
    if (confirmed && typeof confirmed === 'object' && !Array.isArray(confirmed)) {
      for (const [key, value] of Object.entries(confirmed as Record<string, unknown>)) {
        if (typeof value === 'string' && value) {
          facts.push({ key: `analysis:${key}`, value, status: 'pending', sourceType: 'image_analysis', retrievedAt: now });
        }
      }
    }
    const placeholders = analysis.placeholders;
    if (placeholders && typeof placeholders === 'object' && !Array.isArray(placeholders)) {
      for (const [key, list] of Object.entries(placeholders as Record<string, unknown>)) {
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === 'string') {
              pendingFacts.push({ key: `placeholder:${key}`, value: item, status: 'pending', sourceType: 'image_analysis', retrievedAt: now });
            }
          }
        }
      }
    }
  }
  return { facts, pendingFacts };
}

/** 聚合各 item 结果为任务统一结果快照。 */
export function mergeItemResults(task: MarketingTask, items: MarketingTaskItem[]): Record<string, unknown> {
  if (task.module === 'translate') {
    const translations: Record<string, { status: 'completed' | 'failed'; translation?: string; error?: string }> = {};
    for (const item of items) {
      if (!item.kind.startsWith('translate:')) continue;
      const language = item.kind.slice('translate:'.length);
      if (item.status === 'completed' && item.result) {
        translations[language] = { status: 'completed', translation: String((item.result as Record<string, unknown>).translation ?? item.result) };
      } else if (item.status === 'failed') {
        translations[language] = { status: 'failed', error: item.error ?? '翻译失败' };
      }
    }
    const taskInput = (task.input as Record<string, unknown>) ?? {};
    return {
      sourceText: (taskInput.sourceText as string) ?? '',
      sourceLanguage: (taskInput.sourceLanguage as string) ?? 'auto',
      translations,
    };
  }

  if (task.module === 'seo' || task.module === 'geo') {
    const item = items.find((candidate) => candidate.status === 'completed' && candidate.result);
    return (item?.result as Record<string, unknown>) ?? {};
  }

  if (task.module === 'insight') {
    const item = items.find((candidate) => candidate.status === 'completed' && candidate.result);
    return (item?.result as Record<string, unknown>) ?? {};
  }

  // copywriting
  const byKind = new Map(items.map((item) => [item.kind, item]));
  const analysisItem = byKind.get('analysis');
  const analysis =
    analysisItem && analysisItem.status === 'completed'
      ? ((analysisItem.result as Record<string, unknown>) ?? null)
      : ((task.analysis as Record<string, unknown>) ?? null);

  const taskInput = (task.input as Record<string, unknown>) ?? {};
  const { facts, pendingFacts } = buildFacts(taskInput, analysis);

  const result: MarketingTaskResultSnapshot = {};
  if (analysis) result.analysis = analysis;
  const copywritingItem = byKind.get('copywriting');
  if (copywritingItem?.status === 'completed' && copywritingItem.result) {
    result.copywriting = copywritingItem.result as unknown;
  }
  const mainItem = byKind.get('mainPrompts');
  if (mainItem?.status === 'completed' && mainItem.result) {
    result.mainPrompts = mainItem.result as unknown;
  }
  const detailItem = byKind.get('detailPrompts');
  if (detailItem?.status === 'completed' && detailItem.result) {
    result.detailPrompts = detailItem.result as unknown;
  }
  result.facts = facts;
  result.pendingFacts = pendingFacts;
  return result as unknown as Record<string, unknown>;
}

/**
 * 若所有 item 已终态，聚合写回任务。返回是否执行了聚合。
 * 取消的任务以 cancelled 聚合；保留已完成结果。
 */
export async function maybeAggregateTask(taskId: string): Promise<boolean> {
  const task = await prisma.marketingTask.findUnique({ where: { id: taskId } });
  if (!task) return false;

  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
  if (items.length === 0) return false;
  if (!items.every((item) => ITEM_TERMINAL_STATUSES.includes(item.status as never))) {
    return false;
  }

  const result = mergeItemResults(task, items) as Prisma.InputJsonValue;

  if (task.cancelRequestedAt) {
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', result },
    });
    await appendTaskEvent(taskId, task.userId, 'task_cancelled', { result: true });
    return true;
  }

  const status = aggregateOutcomeStatus(
    items.map((item) => ({ status: item.status as never }))
  ) as MarketingTaskStatus;

  const failedItems = items.filter((item) => item.status === 'failed');
  const errorMessage =
    failedItems.length > 0
      ? failedItems.map((item) => `${item.kind}: ${item.error ?? '失败'}`).join('；').slice(0, 2000)
      : null;

  const analysisItem = items.find((item) => item.kind === 'analysis');
  const analysisValue =
    analysisItem?.status === 'completed'
      ? (analysisItem.result as Prisma.InputJsonValue)
      : (task.analysis as Prisma.InputJsonValue | null);

  await prisma.marketingTask.update({
    where: { id: taskId },
    data: {
      status,
      error: errorMessage,
      result,
      ...(task.module === 'copywriting'
        ? {
            ...(analysisValue ? { analysis: analysisValue } : {}),
            ...((result as Record<string, unknown>).copywriting
              ? { copywriting: (result as Record<string, unknown>).copywriting as Prisma.InputJsonValue }
              : {}),
            ...((result as Record<string, unknown>).mainPrompts
              ? { mainPrompts: (result as Record<string, unknown>).mainPrompts as Prisma.InputJsonValue }
              : {}),
            ...((result as Record<string, unknown>).detailPrompts
              ? { detailPrompts: (result as Record<string, unknown>).detailPrompts as Prisma.InputJsonValue }
              : {}),
          }
        : {}),
    },
  });

  await appendTaskEvent(
    taskId,
    task.userId,
    status === 'completed' ? 'task_completed' : status === 'partial_failed' ? 'task_completed' : 'task_failed',
    { status }
  );
  return true;
}
