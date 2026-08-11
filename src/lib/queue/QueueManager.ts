import { HighConcurrencyQueue } from './HighConcurrencyQueue';
import { QueueTask, QueueConfig } from '@/types/ai';

/**
 * 队列管理器
 * 为每个AI服务管理独立的队列
 */
class QueueManagerClass {
  private queues: Map<string, HighConcurrencyQueue>;
  private defaultConfig: QueueConfig;

  constructor() {
    this.queues = new Map();
    this.defaultConfig = {
      concurrency: 50,
      timeout: 120000,
      retries: 3,
    };
  }

  /**
   * 获取或创建队列
   * @param serviceId 服务ID
   * @param config 队列配置（可选）
   */
  getQueue(serviceId: string, config?: Partial<QueueConfig>): HighConcurrencyQueue {
    if (this.queues.has(serviceId)) {
      return this.queues.get(serviceId)!;
    }

    const queueConfig: QueueConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const queue = new HighConcurrencyQueue(queueConfig);

    // 监听队列事件
    queue.on('task:complete', (taskId) => {
      console.log(`[QueueManager] Task completed in ${serviceId}:`, taskId);
    });

    queue.on('task:failed', (taskId, error) => {
      console.error(`[QueueManager] Task failed in ${serviceId}:`, taskId, error);
    });

    queue.on('idle', () => {
      console.log(`[QueueManager] Queue ${serviceId} is idle`);
    });

    this.queues.set(serviceId, queue);
    console.log(`[QueueManager] Created queue for service:`, serviceId);

    return queue;
  }

  /**
   * 添加任务到指定服务的队列
   */
  async addTask<T>(serviceId: string, task: QueueTask<T>): Promise<T> {
    const queue = this.getQueue(serviceId);
    return await queue.add(task);
  }

  /**
   * 批量添加任务
   */
  async addTasks<T>(serviceId: string, tasks: QueueTask<T>[]): Promise<T[]> {
    const queue = this.getQueue(serviceId);
    return await queue.addAll(tasks);
  }

  /**
   * 暂停指定服务的队列
   */
  pauseQueue(serviceId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.pause();
      console.log(`[QueueManager] Paused queue:`, serviceId);
    }
  }

  /**
   * 恢复指定服务的队列
   */
  resumeQueue(serviceId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.resume();
      console.log(`[QueueManager] Resumed queue:`, serviceId);
    }
  }

  /**
   * 清空指定服务的队列
   */
  clearQueue(serviceId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.clear();
      console.log(`[QueueManager] Cleared queue:`, serviceId);
    }
  }

  /**
   * 删除指定服务的队列
   */
  removeQueue(serviceId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.destroy();
      this.queues.delete(serviceId);
      console.log(`[QueueManager] Removed queue:`, serviceId);
    }
  }

  /**
   * 获取指定服务的队列统计
   */
  getQueueStats(serviceId: string) {
    const queue = this.queues.get(serviceId);
    return queue ? queue.getStats() : null;
  }

  /**
   * 获取所有队列的统计
   */
  getAllStats() {
    const stats: Record<string, any> = {};

    this.queues.forEach((queue, serviceId) => {
      stats[serviceId] = queue.getStats();
    });

    return stats;
  }

  /**
   * 暂停所有队列
   */
  pauseAll() {
    this.queues.forEach((queue, serviceId) => {
      queue.pause();
      console.log(`[QueueManager] Paused queue:`, serviceId);
    });
  }

  /**
   * 恢复所有队列
   */
  resumeAll() {
    this.queues.forEach((queue, serviceId) => {
      queue.resume();
      console.log(`[QueueManager] Resumed queue:`, serviceId);
    });
  }

  /**
   * 清空所有队列
   */
  clearAll() {
    this.queues.forEach((queue, serviceId) => {
      queue.clear();
      console.log(`[QueueManager] Cleared queue:`, serviceId);
    });
  }

  /**
   * 销毁所有队列
   */
  destroyAll() {
    this.queues.forEach((queue, serviceId) => {
      queue.destroy();
      console.log(`[QueueManager] Destroyed queue:`, serviceId);
    });
    this.queues.clear();
  }

  /**
   * 等待指定服务的队列空闲
   */
  async waitForIdle(serviceId: string): Promise<void> {
    const queue = this.queues.get(serviceId);
    if (queue) {
      await queue.waitForIdle();
    }
  }

  /**
   * 等待所有队列空闲
   */
  async waitForAllIdle(): Promise<void> {
    const promises = Array.from(this.queues.values()).map((queue) =>
      queue.waitForIdle()
    );
    await Promise.all(promises);
  }

  /**
   * 获取队列数量
   */
  getQueueCount(): number {
    return this.queues.size;
  }

  /**
   * 检查队列是否存在
   */
  hasQueue(serviceId: string): boolean {
    return this.queues.has(serviceId);
  }
}

/**
 * 导出单例
 */
export const QueueManager = new QueueManagerClass();
