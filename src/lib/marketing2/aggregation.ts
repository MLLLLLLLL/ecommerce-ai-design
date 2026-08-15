import { prisma } from '@/lib/db/prisma';
import { appendTaskEvent } from '@/lib/marketing/async/aggregation';
import { MARKETING2_MODULE } from '@/lib/marketing2/workflow-registry';

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

  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId, stepKey: task.currentStep ?? undefined },
    orderBy: { createdAt: 'asc' },
  });
  if (items.length === 0) return false;
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
