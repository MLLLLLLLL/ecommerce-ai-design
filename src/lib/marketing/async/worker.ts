import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { MarketingTaskItem } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { executeMarketingItem } from '@/lib/marketing/async/executors';
import {
  appendTaskEvent,
  maybeAggregateTask,
} from '@/lib/marketing/async/aggregation';
import { maybeAggregateMarketing2Step } from '@/lib/marketing2/aggregation';
import { MARKETING2_MODULE } from '@/lib/marketing2/workflow-registry';
import {
  LEASE_DURATION_MS,
  WORKER_MAX_CONCURRENT,
  WORKER_POLL_INTERVAL_MS,
} from '@/lib/marketing/async/types';
import { MarketingServiceError } from '@/lib/marketing/task-common';
import { Prisma } from '@prisma/client';

// ============================================
// 营销任务 Worker（V3 Phase 6）
// 单进程内轮询循环；多实例部署时租约保证不重复执行：
// - 领取：原子 updateMany（pending + 租约空/过期 -> running + 新租约）
// - 恢复：租约过期的 running item 回退 pending（进程重启不丢任务）
// - 重试：attempts 未达上限时回退 pending
// - 取消：领取前过滤已取消任务；终态聚合时按 cancelled 处理
// ============================================

const WORKER_ID = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const ENABLED = process.env.MARKETING_WORKER_ENABLED !== 'false';

let started = false;
let loopRunning = false;
let inFlight = 0;

export function startMarketingWorker(): void {
  if (!ENABLED || started) return;
  started = true;
  console.log(`[MarketingWorker] started worker=${WORKER_ID} interval=${WORKER_POLL_INTERVAL_MS}ms`);
  void runLoop();
  setInterval(() => {
    void runLoop();
  }, WORKER_POLL_INTERVAL_MS);
}

export function getMarketingWorkerId(): string {
  return WORKER_ID;
}

async function runLoop(): Promise<void> {
  if (loopRunning) return;
  loopRunning = true;
  try {
    await recoverExpiredLeases();
    while (inFlight < WORKER_MAX_CONCURRENT) {
      const item = await claimNextItem();
      if (!item) break;
      inFlight += 1;
      void executeClaimed(item)
        .catch((error) => {
          console.error('[MarketingWorker] item execution crashed:', error);
        })
        .finally(() => {
          inFlight -= 1;
        });
    }
  } catch (error) {
    console.error('[MarketingWorker] loop error:', error);
  } finally {
    loopRunning = false;
  }
}

/** 进程重启后：把租约过期的 running item 回退 pending，保证任务可继续。 */
export async function recoverExpiredLeases(): Promise<number> {
  const now = new Date();
  const result = await prisma.marketingTaskItem.updateMany({
    where: {
      status: 'running',
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: 'pending',
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  if (result.count > 0) {
    console.warn(`[MarketingWorker] recovered ${result.count} expired lease(s)`);
  }
  return result.count;
}

/** 查询可领取的候选（pending 且依赖已满足、任务未取消、未暂停）。 */
async function findCandidates(limit: number): Promise<MarketingTaskItem[]> {
  const items = await prisma.marketingTaskItem.findMany({
    where: {
      status: 'pending',
      task: { cancelRequestedAt: null, pausedAt: null },
    },
    include: { task: true },
    orderBy: [{ createdAt: 'asc' }],
    take: limit,
  });

  return items.filter((item) => {
    if (!item.dependsOn) return true;
    // 依赖 analysis：任务 analysis 字段已有结果，或 analysis item 已终态成功
    if (item.dependsOn === 'analysis') {
      if (item.task.analysis) return true;
      return false;
    }
    return true;
  });
}

/**
 * 原子领取候选 item：仅当状态仍为 pending 且租约空/过期时成功。
 * 返回领取到的 item 或 null（被别人抢走）。
 */
async function claimCandidate(item: MarketingTaskItem): Promise<MarketingTaskItem | null> {
  const now = new Date();
  const claimed = await prisma.marketingTaskItem.updateMany({
    where: {
      id: item.id,
      status: 'pending',
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      task: { cancelRequestedAt: null, pausedAt: null },
    },
    data: {
      status: 'running',
      leaseOwner: WORKER_ID,
      leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      attempts: { increment: 1 },
      startedAt: now,
    },
  });
  if (claimed.count !== 1) return null;
  const fresh = await prisma.marketingTaskItem.findUnique({ where: { id: item.id } });
  return fresh && fresh.status === 'running' ? fresh : null;
}

async function claimNextItem(): Promise<MarketingTaskItem | null> {
  const candidates = await findCandidates(WORKER_MAX_CONCURRENT * 3);
  for (const candidate of candidates) {
    const claimed = await claimCandidate(candidate);
    if (claimed) return claimed;
  }
  return null;
}

/** 按任务模块分派聚合：营销助手2按步骤聚合，旧模块按全任务聚合。 */
async function aggregateTaskByModule(taskId: string): Promise<void> {
  const task = await prisma.marketingTask.findUnique({
    where: { id: taskId },
    select: { module: true },
  });
  if (task?.module === MARKETING2_MODULE) {
    await maybeAggregateMarketing2Step(taskId);
  } else {
    await maybeAggregateTask(taskId);
  }
}

async function executeClaimed(item: MarketingTaskItem): Promise<void> {
  const startedAt = Date.now();
  try {
    const task = await prisma.marketingTask.findUnique({ where: { id: item.taskId } });
    if (!task) return;
    if (task.cancelRequestedAt) {
      await prisma.marketingTaskItem.update({
        where: { id: item.id },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      await aggregateTaskByModule(item.taskId);
      return;
    }

    await appendTaskEvent(item.taskId, item.userId, 'item_started', { kind: item.kind }, item.id);

    const result = await executeMarketingItem(task, item);
    const now = new Date();
    await prisma.marketingTaskItem.update({
      where: { id: item.id },
      data: {
        status: 'completed',
        result: result as Prisma.InputJsonValue,
        error: null,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });

    // analysis 结果即时写回任务，解除下游依赖
    if (item.kind === 'analysis') {
      await prisma.marketingTask.update({
        where: { id: item.taskId },
        data: { analysis: result as Prisma.InputJsonValue },
      });
    }

    await appendTaskEvent(
      item.taskId,
      item.userId,
      'item_completed',
      { kind: item.kind, durationMs: Date.now() - startedAt },
      item.id
    );
    await aggregateTaskByModule(item.taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : '未知错误';
    const attempts = item.attempts; // claim 时已 increment

    if (attempts < item.maxAttempts) {
      // 未达上限：回退 pending 等待重试（租约清空）
      await prisma.marketingTaskItem.update({
        where: { id: item.id },
        data: {
          status: 'pending',
          error: message,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await appendTaskEvent(
        item.taskId,
        item.userId,
        'item_failed',
        { kind: item.kind, attempt: attempts, retrying: true, error: message },
        item.id
      );
      console.warn(
        `[MarketingWorker] item=${item.id} kind=${item.kind} attempt=${attempts} failed, will retry: ${message.slice(0, 200)}`
      );
    } else {
      await prisma.marketingTaskItem.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          error: message,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await appendTaskEvent(
        item.taskId,
        item.userId,
        'item_failed',
        { kind: item.kind, attempt: attempts, retrying: false, error: message },
        item.id
      );
      await aggregateTaskByModule(item.taskId);
    }
  }
}

/** 取消任务：pending 项标记 cancelled，运行中项完成后聚合为 cancelled。 */
export async function cancelMarketingTask(userId: string, taskId: string): Promise<void> {
  const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', { httpStatus: 404 });
  }
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    throw new MarketingServiceError('VALIDATION_ERROR', '任务已结束，无法取消', { httpStatus: 400 });
  }

  await prisma.marketingTask.update({
    where: { id: taskId },
    data: { cancelRequestedAt: new Date() },
  });
  await prisma.marketingTaskItem.updateMany({
    where: { taskId, status: 'pending' },
    data: { status: 'cancelled', completedAt: new Date() },
  });
  await appendTaskEvent(taskId, userId, 'cancel_requested');
  await aggregateTaskByModule(taskId);
}

/** 重试单个 item：失败/取消项重置为 pending，任务回到执行中。 */
export async function retryMarketingTaskItem(
  userId: string,
  taskId: string,
  itemId: string
): Promise<void> {
  const item = await prisma.marketingTaskItem.findFirst({
    where: { id: itemId, taskId, userId },
  });
  if (!item) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '子任务不存在或不属于当前用户', { httpStatus: 404 });
  }
  if (!['failed', 'cancelled'].includes(item.status)) {
    throw new MarketingServiceError('VALIDATION_ERROR', '仅失败或取消的子任务可以重试', { httpStatus: 400 });
  }

      await prisma.marketingTaskItem.update({
        where: { id: itemId },
        data: {
          status: 'pending',
          error: null,
          attempts: 0,
          result: Prisma.JsonNull,
          startedAt: null,
          completedAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
  await prisma.marketingTask.update({
    where: { id: taskId },
    data: {
      status: item.role === 'vision' ? 'analyzing' : 'generating',
      cancelRequestedAt: null,
      result: Prisma.JsonNull,
    },
  });
  await appendTaskEvent(taskId, userId, 'item_retried', { kind: item.kind }, item.id);
}

/** 任务详情（含 items 与进度）。 */
export async function getMarketingTaskDetail(userId: string, taskId: string) {
  const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', { httpStatus: 404 });
  }
  const items = await prisma.marketingTaskItem.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
  return { task, items };
}

/** 事件流（游标分页）。 */
export async function listTaskEvents(
  userId: string,
  taskId: string,
  after?: string,
  limit = 100
) {
  const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', { httpStatus: 404 });
  }
  const events = await prisma.marketingTaskEvent.findMany({
    where: {
      taskId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 200),
  });
  const last = events[events.length - 1];
  return {
    events,
    nextCursor: last ? last.createdAt.toISOString() : after ?? null,
  };
}
