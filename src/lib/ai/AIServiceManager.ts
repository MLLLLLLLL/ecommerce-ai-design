import { EventEmitter } from 'events';
import { AIServiceAdapter } from './base';
import { createAIService } from './factory';
import { AIServiceConfig } from '@/types/ai';

/**
 * 配置变更事件发射器
 * 用于通知AIServiceManager配置已更新
 */
export const configEmitter = new EventEmitter();

/**
 * AI服务管理器
 * 负责创建、缓存和管理AI服务适配器
 * 支持配置热更新
 */
class AIServiceManagerClass {
  private adapters: Map<string, AIServiceAdapter> = new Map();
  private configVersion: number = 0;

  constructor() {
    this.setupConfigListeners();
  }

  /**
   * 设置配置监听器
   * 当配置更新时，自动清除对应的适配器缓存
   */
  private setupConfigListeners() {
    configEmitter.on('service:updated', (serviceId: string) => {
      console.log(`[AIServiceManager] Service updated: ${serviceId}`);
      // 移除旧的适配器，下次请求时会重新创建
      this.adapters.delete(serviceId);
    });

    configEmitter.on('service:deleted', (serviceId: string) => {
      console.log(`[AIServiceManager] Service deleted: ${serviceId}`);
      this.adapters.delete(serviceId);
    });

    configEmitter.on('service:activated', (serviceId: string) => {
      console.log(`[AIServiceManager] Service activated: ${serviceId}`);
    });
  }

  /**
   * 获取或创建适配器
   * 使用缓存机制提高性能
   *
   * @param config AI服务配置
   * @returns AI服务适配器实例
   */
  getAdapter(config: AIServiceConfig): AIServiceAdapter {
    const cacheKey = config.id;

    // 检查缓存
    if (this.adapters.has(cacheKey)) {
      const cached = this.adapters.get(cacheKey)!;
      console.log(`[AIServiceManager] Using cached adapter: ${config.name}`);
      return cached;
    }

    // 创建新适配器
    console.log(`[AIServiceManager] Creating new adapter: ${config.name} (${config.provider})`);
    const adapter = createAIService(config);
    this.adapters.set(cacheKey, adapter);

    return adapter;
  }

  /**
   * 创建临时适配器（不缓存）
   * 用于测试连接等一次性操作
   *
   * @param config AI服务配置
   * @returns AI服务适配器实例
   */
  static createAdapter(config: AIServiceConfig): AIServiceAdapter {
    return createAIService(config);
  }

  /**
   * 清除所有缓存
   * 用于强制刷新所有适配器
   */
  clearCache() {
    console.log('[AIServiceManager] Clearing all adapter cache');
    this.adapters.clear();
  }

  /**
   * 清除指定服务的缓存
   *
   * @param serviceId 服务ID
   */
  clearServiceCache(serviceId: string) {
    console.log(`[AIServiceManager] Clearing cache for service: ${serviceId}`);
    this.adapters.delete(serviceId);
  }

  /**
   * 预热适配器
   * 提前创建并测试连接，避免首次请求慢
   *
   * @param config AI服务配置
   */
  async warmup(config: AIServiceConfig): Promise<boolean> {
    try {
      console.log(`[AIServiceManager] Warming up: ${config.name}`);
      const adapter = this.getAdapter(config);
      const isConnected = await adapter.testConnection();

      if (isConnected) {
        console.log(`[AIServiceManager] Warmup successful: ${config.name}`);
      } else {
        console.warn(`[AIServiceManager] Warmup failed: ${config.name} - Connection test failed`);
      }

      return isConnected;
    } catch (error) {
      console.error(`[AIServiceManager] Warmup failed: ${config.name}`, error);
      return false;
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.adapters.size,
      version: this.configVersion,
      services: Array.from(this.adapters.keys()),
    };
  }
}

/**
 * 导出单例
 */
export const AIServiceManager = new AIServiceManagerClass();
