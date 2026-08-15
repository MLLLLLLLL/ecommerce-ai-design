import { prisma } from '@/lib/db/prisma';
import { appendTaskEvent } from '@/lib/marketing/async/aggregation';
import { MARKETING2_MODULE, promptPlanItemKind } from '@/lib/marketing2/workflow-registry';
import { getPromptSlotDefinitions, promptSlotKey, type PromptSlotDefinition } from '@/lib/marketing2/prompt-planning';

// ============================================
// 营销助手2步骤聚合（V2 8.1）
// 当前步骤的所有 item 到达终态后：
// 全部成功 -> awaiting_review（等待用户确认推进）；
// 存在失败 -> partial_failed / failed。
// 下游失败不清空上游已确认结果。
// ============================================

const ITEM_TERMINAL = ['completed', 'failed', 'skipped', 'cancelled'];

export async function maybeAggregateMarketing2Step(taskId: string): Promise<boolean> {
  const task = await prisma.marketingTask.findUnique({ where: { id: taskId } });
  if (!task || task.module !== MARKETING2_MODULE) return false;

  const allItems = await prisma.marketingTaskItem.findMany({
    where: { taskId, stepKey: task.currentStep ?? undefined },
    orderBy: { createdAt: 'asc' },
  });
  // 新版提示词拆分后忽略历史遗留的单体 prompt_planning item，避免重跑时旧失败记录污染结果。
  const items = task.currentStep === 'prompt_planning' && allItems.some((item) => item.kind === 'prompt_outline')
    ? allItems.filter((item) => item.kind !== 'prompt_planning')
    : allItems;
  if (items.length === 0) return false;

  // 方案框架完成后拆出独立提示词子项。子项使用固定 kind + index，
  // 聚合器可安全重复调用，避免并发/重启导致重复创建。
  if (task.currentStep === 'prompt_planning') {
    const outlineItem = items.filter((item) => item.kind === 'prompt_outline').at(-1);
    if (outlineItem?.status === 'completed') {
      const input = (task.input as Record<string, unknown>) ?? {};
      const slots = getPromptSlotDefinitions(input.mainImageCount, input.detailPageCount);
      const outline = (outlineItem.result as { slots?: PromptSlotDefinition[] } | null)?.slots ?? [];
      const existingKinds = new Set(items.filter((item) => item.kind.startsWith('prompt_plan:')).map((item) => item.kind));
      const modelId = ((task.stepModels as { promptGeneration?: string } | null)?.promptGeneration ?? '') || null;
      let createdMissing = false;
      for (const slot of slots) {
        const kind = promptPlanItemKind(slot.kind, slot.index);
        if (existingKinds.has(kind)) continue;
        createdMissing = true;
        const outlineSlot = outline.find((item) => promptSlotKey(item.kind, item.index) === promptSlotKey(slot.kind, slot.index));
        const idempotencyKey = `${task.id}:prompt_planning:plan:${slot.kind}:${slot.index}:v1`;
        try {
          await prisma.marketingTaskItem.create({
            data: {
              taskId: task.id,
              userId: task.userId,
              kind,
              role: 'content',
              modelId,
              status: 'pending',
              stepKey: 'prompt_planning',
              input: { outline: outlineSlot ?? slot } as object,
              idempotencyKey,
              maxAttempts: 2,
            },
          });
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2002') throw error;
        }
      }
      const createdItems = await prisma.marketingTaskItem.count({
        where: { taskId, stepKey: 'prompt_planning', kind: { startsWith: 'prompt_plan:' } },
      });
      if (createdItems < slots.length || createdMissing) return false;
    }
  }
  if (!items.every((item) => ITEM_TERMINAL.includes(item.status))) return false;

  if (task.cancelRequestedAt) {
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', awaitingReview: false },
    });
    await appendTaskEvent(taskId, task.userId, 'task_cancelled', { stepKey: task.currentStep });
    return true;
  }

  const failedItems = items.filter((item) => item.status === 'failed');
  const succeeded = items.filter((item) => item.status === 'completed' || item.status === 'skipped');

  if (failedItems.length === 0) {
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: { status: 'awaiting_review', awaitingReview: true, error: null },
    });
    await appendTaskEvent(taskId, task.userId, 'step_completed', {
      stepKey: task.currentStep,
      itemCount: succeeded.length,
    });
  } else {
    const status = succeeded.length > 0 ? 'partial_failed' : 'failed';
    const errorMessage = failedItems
      .map((item) => `${item.kind}: ${item.error ?? '失败'}`)
      .join('；')
      .slice(0, 2000);
    await prisma.marketingTask.update({
      where: { id: taskId },
      data: { status, awaitingReview: false, error: errorMessage },
    });
    await appendTaskEvent(
      taskId,
      task.userId,
      status === 'failed' ? 'task_failed' : 'step_failed',
      { stepKey: task.currentStep, failedCount: failedItems.length, error: errorMessage.slice(0, 300) }
    );
  }
  return true;
}
