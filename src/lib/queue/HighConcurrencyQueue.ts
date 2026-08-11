import PQueue from 'p-queue';
import { EventEmitter } from 'events';
import { QueueTask, QueueConfig, QueueStats } from '@/types/ai';

/**
 * 高并发队列
 * 支持50并发，自动重试，优先级队列
 */
export class HighConcurrencyQueue<T = any> extends EventEmitter {
  private queue: PQueue;
  private stats: QueueStats;
  private config: Required<QueueConfig>;
  private taskMap: Map<string, QueueTask<T>>;

  constructor(config: QueueConfig) {
    super();

    this.config = {
      concurrency: config.concurrency,
      timeout: config.timeout || 120000, // 默认2分钟
      retries: config.retries || 3, // 默认重试3次
    };

    this.queue = new PQueue({
      concurrency: this.config.concurrency,
      timeout: this.config.timeout,
    });

    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      active: 0,
      pending: 0,
    };

    this.taskMap = new Map();

    this.setupListeners();
  }

  /**
   * 设置队列事件监听
   */
  private setupListeners() {
    this.queue.on('active', () => {
      this.stats.active = this.queue.pending;
      this.emit('stats', this.getStats());
    });

    this.queue.on('idle', () => {
      this.emit('idle');
      console.log('[Queue] All tasks completed');
    });

    this.queue.on('error', (error) => {
      console.error('[Queue] Error:', error);
      this.emit('error', error);
    });
  }

  /**
   * 添加任务到队列
   */
  async add(task: QueueTask<T>): Promise<T> {
    this.stats.total++;
    this.stats.pending++;
    this.taskMap.set(task.id, task);

    this.emit('task:added', task.id);

    return this.queue.add(
      async () => {
        return await this.executeWithRetry(task);
      },
      {
        priority: task.priority || 0,
      }
    );
  }

  /**
   * 批量添加任务
   */
  async addAll(tasks: QueueTask<T>[]): Promise<T[]> {
    const promises = tasks.map((task) => this.add(task));
    return Promise.all(promises);
  }

  /**
   * 执行任务（带重试）
   */
  private async executeWithRetry(task: QueueTask<T>): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    this.emit('task:start', task.id);

    while (attempt <= this.config.retries) {
      try {
        // 执行任务
        const result = await task.execute();

        // 成功
        this.stats.completed++;
        this.stats.pending--;
        this.taskMap.delete(task.id);

        this.emit('task:complete', task.id, result);
        console.log(`[Queue] Task ${task.id} completed (attempt ${attempt + 1})`);

        return result;
      } catch (error: any) {
        lastError = error;
        attempt++;

        if (attempt <= this.config.retries) {
          // 还有重试机会
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避，最大10秒
          console.warn(
            `[Queue] Task ${task.id} failed (attempt ${attempt}/${this.config.retries}), retrying in ${delay}ms`
          );

          this.emit('task:retry', task.id, attempt, delay);
          await this.sleep(delay);
        }
      }
    }

    // 所有重试都失败
    this.stats.failed++;
    this.stats.pending--;
    this.taskMap.delete(task.id);

    this.emit('task:failed', task.id, lastError);
    console.error(`[Queue] Task ${task.id} failed after ${this.config.retries} retries:`, lastError);

    throw lastError;
  }

  /**
   * 暂停队列
   */
  pause() {
    this.queue.pause();
    this.emit('paused');
    console.log('[Queue] Paused');
  }

  /**
   * 恢复队列
   */
  resume() {
    this.queue.start();
    this.emit('resumed');
    console.log('[Queue] Resumed');
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue.clear();
    this.taskMap.clear();
    this.stats.pending = 0;
    this.emit('cleared');
    console.log('[Queue] Cleared');
  }

  /**
   * 获取队列统计
   */
  getStats(): QueueStats {
    return {
      ...this.stats,
      active: this.queue.pending,
      pending: this.queue.size,
    };
  }

  /**
   * 获取队列大小
   */
  getSize(): number {
    return this.queue.size;
  }

  /**
   * 获取活跃任务数
   */
  getActiveCount(): number {
    return this.queue.pending;
  }

  /**
   * 是否空闲
   */
  isIdle(): boolean {
    return this.queue.size === 0 && this.queue.pending === 0;
  }

  /**
   * 等待队列空闲
   */
  async waitForIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 销毁队列
   */
  destroy() {
    this.queue.clear();
    this.taskMap.clear();
    this.removeAllListeners();
    console.log('[Queue] Destroyed');
  }
}
