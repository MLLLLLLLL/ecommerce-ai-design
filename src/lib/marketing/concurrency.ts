import PQueue from 'p-queue';

// ============================================
// 进程内营销模型调用并发限流（V3 5.3）
// 按「用户 + 模型」限制并发 3。仅适用于单实例部署；
// 多实例必须升级为 Phase 6 持久化队列。
// ============================================

const CONCURRENCY = 3;

const queues = new Map<string, PQueue>();

function getQueue(key: string): PQueue {
  let queue = queues.get(key);
  if (!queue) {
    queue = new PQueue({ concurrency: CONCURRENCY });
    queues.set(key, queue);
  }
  return queue;
}

export function runWithConcurrency<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const queue = getQueue(key);
  return queue.add(fn) as Promise<T>;
}

export function marketingConcurrencyKey(userId: string, modelId: string): string {
  return `${userId}:${modelId}`;
}
