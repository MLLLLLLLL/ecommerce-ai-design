# API配置热更新与高并发设计方案

## 1. 需求分析

### 1.1 配置热更新需求

**场景**：
- 用户在设置界面修改API Key
- 用户切换不同的AI服务提供商
- 用户更新中转站地址
- **要求**：无需重启应用，配置立即生效

**挑战**：
- 正在执行的请求如何处理？
- 如何避免配置更新导致的竞态条件？
- 如何通知所有使用配置的组件？

### 1.2 高并发需求

**场景**：
- 用户批量生成大量图片（如100张）
- 工作流执行多个AI节点
- 多个标签页同时使用
- **要求**：支持50个并发请求

**目标**：
- 支持高并发（50个同时进行）
- **不限制速率**：全速执行
- 自动重试失败请求
- 实时进度反馈

---

## 2. 配置热更新设计

### 2.1 架构设计

```
配置更新触发
    ↓
ConfigStore (Zustand)
    ↓
发布配置变更事件
    ↓
AIServiceManager 监听事件
    ↓
重新加载 AIServiceAdapter
    ↓
正在执行的请求继续使用旧配置
新请求使用新配置
```

### 2.2 核心实现

#### ConfigStore（配置状态管理）

```typescript
// src/stores/useConfigStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EventEmitter } from 'events';

export const configEmitter = new EventEmitter();

interface AIServiceConfig {
  id: string;
  provider: 'openai' | 'alibaba' | 'relay';
  name: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  relayType?: 'openai' | 'sd';
  isActive: boolean;
  
  // 高并发配置
  maxConcurrent?: number;  // 默认50，可调整
}

interface ConfigState {
  services: AIServiceConfig[];
  activeServiceId: string | null;
  version: number;  // 配置版本号，用于检测变更
  
  // 获取方法
  getActiveService: () => AIServiceConfig | null;
  getServiceById: (id: string) => AIServiceConfig | null;
  
  // 更新方法
  addService: (config: Omit<AIServiceConfig, 'id'>) => void;
  updateService: (id: string, updates: Partial<AIServiceConfig>) => void;
  deleteService: (id: string) => void;
  setActiveService: (id: string) => void;
  
  // 测试连接
  testConnection: (id: string) => Promise<boolean>;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      services: [],
      activeServiceId: null,
      version: 0,
      
      getActiveService: () => {
        const { services, activeServiceId } = get();
        return services.find(s => s.id === activeServiceId) || null;
      },
      
      getServiceById: (id) => {
        return get().services.find(s => s.id === id) || null;
      },
      
      addService: (config) => {
        const newService = {
          ...config,
          id: crypto.randomUUID(),
          maxConcurrent: config.maxConcurrent || 50  // 默认50并发
        };
        
        set(state => ({
          services: [...state.services, newService],
          version: state.version + 1
        }));
        
        // 发布配置新增事件
        configEmitter.emit('service:added', newService);
      },
      
      updateService: (id, updates) => {
        set(state => {
          const services = state.services.map(s =>
            s.id === id ? { ...s, ...updates } : s
          );
          
          return {
            services,
            version: state.version + 1
          };
        });
        
        // 发布配置更新事件
        const updatedService = get().getServiceById(id);
        configEmitter.emit('service:updated', updatedService);
      },
      
      deleteService: (id) => {
        set(state => ({
          services: state.services.filter(s => s.id !== id),
          activeServiceId: state.activeServiceId === id ? null : state.activeServiceId,
          version: state.version + 1
        }));
        
        configEmitter.emit('service:deleted', id);
      },
      
      setActiveService: (id) => {
        set({ activeServiceId: id });
        configEmitter.emit('service:activated', id);
      },
      
      testConnection: async (id) => {
        const service = get().getServiceById(id);
        if (!service) return false;
        
        try {
          const adapter = AIServiceManager.createAdapter(service);
          return await adapter.testConnection();
        } catch {
          return false;
        }
      }
    }),
    {
      name: 'ai-service-config',
      // 加密敏感字段
      partialize: (state) => ({
        ...state,
        services: state.services.map(s => ({
          ...s,
          apiKey: encryptApiKey(s.apiKey)
        }))
      })
    }
  )
);
```

#### AIServiceManager（服务管理器）

```typescript
// src/lib/ai/AIServiceManager.ts
import { AIServiceAdapter } from './base';
import { createAIService } from './factory';
import { configEmitter } from '@/stores/useConfigStore';

class AIServiceManagerClass {
  private adapters: Map<string, AIServiceAdapter> = new Map();
  private configVersion: number = 0;
  
  constructor() {
    this.setupConfigListeners();
  }
  
  // 监听配置变更
  private setupConfigListeners() {
    configEmitter.on('service:updated', (service) => {
      console.log(`[AIServiceManager] Service updated: ${service.id}`);
      // 移除旧的适配器，下次请求时会重新创建
      this.adapters.delete(service.id);
    });
    
    configEmitter.on('service:deleted', (serviceId) => {
      console.log(`[AIServiceManager] Service deleted: ${serviceId}`);
      this.adapters.delete(serviceId);
    });
    
    configEmitter.on('service:activated', (serviceId) => {
      console.log(`[AIServiceManager] Service activated: ${serviceId}`);
    });
  }
  
  // 获取或创建适配器
  getAdapter(config: AIServiceConfig): AIServiceAdapter {
    const cacheKey = config.id;
    
    // 检查缓存
    if (this.adapters.has(cacheKey)) {
      return this.adapters.get(cacheKey)!;
    }
    
    // 创建新适配器
    const adapter = createAIService(config);
    this.adapters.set(cacheKey, adapter);
    
    return adapter;
  }
  
  // 创建临时适配器（用于测试连接，不缓存）
  static createAdapter(config: AIServiceConfig): AIServiceAdapter {
    return createAIService(config);
  }
  
  // 清除所有缓存（用于强制刷新）
  clearCache() {
    this.adapters.clear();
  }
  
  // 预热适配器（提前创建，避免首次请求慢）
  async warmup(config: AIServiceConfig) {
    try {
      const adapter = this.getAdapter(config);
      await adapter.testConnection();
      console.log(`[AIServiceManager] Warmed up: ${config.name}`);
    } catch (error) {
      console.error(`[AIServiceManager] Warmup failed: ${config.name}`, error);
    }
  }
}

export const AIServiceManager = new AIServiceManagerClass();
```

### 2.3 React Hook封装

```typescript
// src/hooks/useAIService.ts
import { useMemo } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { AIServiceManager } from '@/lib/ai/AIServiceManager';

export function useAIService() {
  const activeService = useConfigStore(state => state.getActiveService());
  const version = useConfigStore(state => state.version);
  
  // 当配置版本变化时，返回新的适配器
  const adapter = useMemo(() => {
    if (!activeService) return null;
    return AIServiceManager.getAdapter(activeService);
  }, [activeService?.id, version]);
  
  return {
    adapter,
    config: activeService,
    isReady: !!adapter
  };
}
```

---

## 3. 高并发控制设计

### 3.1 高并发队列实现

```typescript
// src/lib/ai/HighConcurrencyQueue.ts
import PQueue from 'p-queue';

interface QueueTask<T> {
  id: string;
  execute: () => Promise<T>;
  onProgress?: (progress: number) => void;
}

interface QueueConfig {
  concurrency: number;          // 并发数，默认50
  timeout?: number;             // 单个请求超时时间
  retries?: number;             // 重试次数
}

export class HighConcurrencyQueue {
  private queue: PQueue;
  private activeRequests: Map<string, AbortController> = new Map();
  private stats = {
    total: 0,
    completed: 0,
    failed: 0,
    active: 0
  };
  
  constructor(private config: QueueConfig) {
    this.queue = new PQueue({
      concurrency: config.concurrency || 50,  // 默认50并发
      timeout: config.timeout || 180000,      // 3分钟超时
      throwOnTimeout: false
    });
    
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    this.queue.on('active', () => {
      this.stats.active = this.queue.pending + this.queue.size;
      this.emitStats();
    });
    
    this.queue.on('idle', () => {
      console.log('[HighConcurrencyQueue] All tasks completed');
      this.stats.active = 0;
      this.emitStats();
    });
  }
  
  // 添加任务到队列
  async add<T>(task: QueueTask<T>): Promise<T> {
    this.stats.total++;
    this.stats.active++;
    
    const abortController = new AbortController();
    this.activeRequests.set(task.id, abortController);
    
    try {
      const result = await this.queue.add(
        () => this.executeWithRetry(task, abortController.signal)
      );
      
      this.stats.completed++;
      return result as T;
      
    } catch (error) {
      this.stats.failed++;
      throw error;
      
    } finally {
      this.stats.active--;
      this.activeRequests.delete(task.id);
      this.emitStats();
    }
  }
  
  // 带重试的执行
  private async executeWithRetry<T>(
    task: QueueTask<T>,
    signal: AbortSignal
  ): Promise<T> {
    const maxRetries = this.config.retries || 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error('Task cancelled');
      }
      
      try {
        return await task.execute();
        
      } catch (error: any) {
        lastError = error;
        
        // 某些错误不应该重试（如401、403）
        if (this.shouldNotRetry(error)) {
          throw error;
        }
        
        // 最后一次尝试失败
        if (attempt === maxRetries) {
          throw error;
        }
        
        // 指数退避
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`[HighConcurrencyQueue] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }
  
  private shouldNotRetry(error: any): boolean {
    const noRetryStatuses = [400, 401, 403, 404];
    return noRetryStatuses.includes(error.response?.status);
  }
  
  // 取消任务
  cancel(taskId: string) {
    const controller = this.activeRequests.get(taskId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(taskId);
    }
  }
  
  // 取消所有任务
  cancelAll() {
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
    this.queue.clear();
  }
  
  // 暂停队列
  pause() {
    this.queue.pause();
  }
  
  // 恢复队列
  resume() {
    this.queue.start();
  }
  
  // 获取统计信息
  getStats() {
    return {
      ...this.stats,
      pending: this.queue.pending,
      size: this.queue.size
    };
  }
  
  private emitStats() {
    console.log('[HighConcurrencyQueue] Stats:', this.getStats());
  }
  
  // 动态调整并发数（热更新）
  setConcurrency(concurrency: number) {
    this.queue.concurrency = concurrency;
    console.log(`[HighConcurrencyQueue] Concurrency updated to ${concurrency}`);
  }
}
```

### 3.2 队列管理器

```typescript
// src/lib/ai/QueueManager.ts
import { HighConcurrencyQueue } from './HighConcurrencyQueue';
import { configEmitter } from '@/stores/useConfigStore';
import { EventEmitter } from 'events';

export const queueEmitter = new EventEmitter();

class QueueManagerClass {
  private queues: Map<string, HighConcurrencyQueue> = new Map();
  
  constructor() {
    this.setupConfigListeners();
  }
  
  private setupConfigListeners() {
    // 当配置更新时，动态调整并发数
    configEmitter.on('service:updated', (service) => {
      const queue = this.queues.get(service.id);
      if (queue && service.maxConcurrent) {
        queue.setConcurrency(service.maxConcurrent);
      }
    });
  }
  
  // 获取或创建队列
  getQueue(serviceId: string, config: AIServiceConfig): HighConcurrencyQueue {
    if (!this.queues.has(serviceId)) {
      const queue = new HighConcurrencyQueue({
        concurrency: config.maxConcurrent || 50,  // 默认50并发
        timeout: 180000,    // 3分钟超时
        retries: 3          // 重试3次
      });
      
      this.queues.set(serviceId, queue);
    }
    
    return this.queues.get(serviceId)!;
  }
  
  // 添加任务
  async addTask<T>(
    serviceId: string,
    config: AIServiceConfig,
    task: {
      id: string;
      execute: () => Promise<T>;
    }
  ): Promise<T> {
    const queue = this.getQueue(serviceId, config);
    
    return queue.add({
      id: task.id,
      execute: task.execute
    });
  }
  
  // 取消任务
  cancelTask(serviceId: string, taskId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.cancel(taskId);
    }
  }
  
  // 取消所有任务
  cancelAllTasks(serviceId: string) {
    const queue = this.queues.get(serviceId);
    if (queue) {
      queue.cancelAll();
    }
  }
  
  // 获取队列统计
  getQueueStats(serviceId: string) {
    const queue = this.queues.get(serviceId);
    return queue?.getStats() || null;
  }
}

export const QueueManager = new QueueManagerClass();
```


### 3.3 API层集成

```typescript
// src/app/api/ai/text-to-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AIServiceManager } from '@/lib/ai/AIServiceManager';
import { QueueManager } from '@/lib/ai/QueueManager';
import { useConfigStore } from '@/stores/useConfigStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, width, height, samples } = body;
    
    // 获取当前活跃的服务配置
    const config = useConfigStore.getState().getActiveService();
    if (!config) {
      return NextResponse.json(
        { error: 'No active AI service configured' },
        { status: 400 }
      );
    }
    
    // 获取适配器
    const adapter = AIServiceManager.getAdapter(config);
    
    // 通过高并发队列执行任务
    const taskId = crypto.randomUUID();
    const images = await QueueManager.addTask(
      config.id,
      config,
      {
        id: taskId,
        execute: () => adapter.textToImage({
          prompt,
          width,
          height,
          samples
        })
      }
    );
    
    // 保存到资源库...
    
    return NextResponse.json({ images });
    
  } catch (error: any) {
    console.error('[API] Text-to-image error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### 3.4 前端UI集成

```typescript
// src/components/ai/GenerationStatus.tsx
import { useEffect, useState } from 'react';
import { QueueManager } from '@/lib/ai/QueueManager';
import { useConfigStore } from '@/stores/useConfigStore';

export function GenerationStatus() {
  const activeService = useConfigStore(state => state.getActiveService());
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    active: 0
  });
  
  useEffect(() => {
    if (!activeService) return;
    
    const interval = setInterval(() => {
      const newStats = QueueManager.getQueueStats(activeService.id);
      if (newStats) {
        setStats(newStats);
      }
    }, 500);  // 每500ms更新一次
    
    return () => clearInterval(interval);
  }, [activeService?.id]);
  
  if (!activeService || stats.total === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 min-w-[300px]">
      <h3 className="font-semibold mb-3">生成状态</h3>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">总任务:</span>
          <span className="font-medium">{stats.total}</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">进行中:</span>
          <span className="font-medium text-blue-600">{stats.active}</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">已完成:</span>
          <span className="font-medium text-green-600">{stats.completed}</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">失败:</span>
          <span className="font-medium text-red-600">{stats.failed}</span>
        </div>
      </div>
      
      {stats.active > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">总进度</span>
            <span className="font-medium">
              {Math.round((stats.completed / stats.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${(stats.completed / stats.total) * 100}%`
              }}
            />
          </div>
        </div>
      )}
      
      <div className="mt-3 text-xs text-gray-500">
        并发数: {activeService.maxConcurrent || 50}
      </div>
    </div>
  );
}
```

---

## 4. 高级特性

### 4.1 批量生成优化

```typescript
// src/lib/ai/BatchGenerator.ts
import { QueueManager } from './QueueManager';
import { AIServiceManager } from './AIServiceManager';

export class BatchGenerator {
  /**
   * 批量生成图片
   * @param config AI服务配置
   * @param params 生成参数
   * @param count 生成数量
   * @param onProgress 进度回调
   */
  async generateBatch(
    config: AIServiceConfig,
    params: TextToImageParams,
    count: number,
    onProgress?: (completed: number, total: number) => void
  ) {
    const adapter = AIServiceManager.getAdapter(config);
    let completed = 0;
    
    // 创建所有任务
    const tasks = Array.from({ length: count }, (_, i) => ({
      id: `batch-${Date.now()}-${i}`,
      execute: async () => {
        const result = await adapter.textToImage({
          ...params,
          seed: params.seed !== undefined ? params.seed + i : undefined
        });
        
        completed++;
        if (onProgress) {
          onProgress(completed, count);
        }
        
        return result;
      }
    }));
    
    // 高并发执行所有任务（50个并发）
    const results = await Promise.allSettled(
      tasks.map(task => QueueManager.addTask(config.id, config, task))
    );
    
    // 提取成功的结果
    const images = results
      .filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
    
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason);
    
    return {
      images,
      errors,
      successCount: images.length,
      failCount: errors.length
    };
  }
}
```

### 4.2 使用示例

```typescript
// src/components/text-to-image/BatchGenerationDialog.tsx
import { useState } from 'react';
import { BatchGenerator } from '@/lib/ai/BatchGenerator';
import { useAIService } from '@/hooks/useAIService';

export function BatchGenerationDialog() {
  const { config, adapter } = useAIService();
  const [count, setCount] = useState(100);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [generating, setGenerating] = useState(false);
  
  const handleGenerate = async () => {
    if (!config) return;
    
    setGenerating(true);
    setProgress({ completed: 0, total: count });
    
    try {
      const batchGen = new BatchGenerator();
      const result = await batchGen.generateBatch(
        config,
        {
          prompt: '商品主图，白色背景',
          width: 1024,
          height: 1024,
          samples: 1
        },
        count,
        (completed, total) => {
          setProgress({ completed, total });
        }
      );
      
      toast.success(`成功生成 ${result.successCount} 张图片`);
      if (result.failCount > 0) {
        toast.warning(`${result.failCount} 张失败`);
      }
      
    } catch (error) {
      toast.error('批量生成失败');
    } finally {
      setGenerating(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <div>
        <label>生成数量</label>
        <input
          type="number"
          min="1"
          max="1000"
          value={count}
          onChange={(e) => setCount(parseInt(e.target.value))}
          disabled={generating}
        />
      </div>
      
      {generating && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>进度</span>
            <span>{progress.completed} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${(progress.completed / progress.total) * 100}%`
              }}
            />
          </div>
        </div>
      )}
      
      <button
        onClick={handleGenerate}
        disabled={generating || !config}
        className="w-full btn-primary"
      >
        {generating ? '生成中...' : `开始生成 ${count} 张图片`}
      </button>
      
      <p className="text-sm text-gray-500">
        当前并发: {config?.maxConcurrent || 50}，预计耗时: {Math.ceil(count / (config?.maxConcurrent || 50))} 轮
      </p>
    </div>
  );
}
```

---

## 5. 配置管理UI

### 5.1 服务配置界面

```typescript
// src/components/settings/ServiceConfigPanel.tsx
import { useState } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';

export function ServiceConfigPanel() {
  const services = useConfigStore(state => state.services);
  const updateService = useConfigStore(state => state.updateService);
  
  const [editing, setEditing] = useState<string | null>(null);
  
  return (
    <div className="space-y-4">
      {services.map(service => (
        <div key={service.id} className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{service.name}</h3>
              <p className="text-sm text-gray-500">{service.provider}</p>
            </div>
            
            <button onClick={() => setEditing(service.id)}>
              编辑
            </button>
          </div>
          
          {editing === service.id && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  最大并发数
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={service.maxConcurrent || 50}
                  onChange={(e) => updateService(service.id, {
                    maxConcurrent: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  同时进行的最多请求数，默认50。根据服务器性能调整。
                </p>
              </div>
              
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-sm text-blue-800">
                  ⚡ 高并发模式：无速率限制，全速执行
                </p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditing(null);
                    toast.success('配置已保存并立即生效');
                  }}
                  className="btn-primary"
                >
                  保存（立即生效）
                </button>
                <button onClick={() => setEditing(null)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 5.2 实时监控面板

```typescript
// src/components/settings/PerformanceMonitor.tsx
import { useEffect, useState } from 'react';
import { QueueManager } from '@/lib/ai/QueueManager';
import { useConfigStore } from '@/stores/useConfigStore';

export function PerformanceMonitor() {
  const services = useConfigStore(state => state.services);
  const [stats, setStats] = useState<Map<string, any>>(new Map());
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newStats = new Map();
      services.forEach(service => {
        const stat = QueueManager.getQueueStats(service.id);
        if (stat) {
          newStats.set(service.id, stat);
        }
      });
      setStats(newStats);
    }, 500);  // 500ms刷新一次
    
    return () => clearInterval(interval);
  }, [services]);
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">性能监控</h3>
      
      {services.map(service => {
        const stat = stats.get(service.id);
        if (!stat || stat.total === 0) return null;
        
        return (
          <div key={service.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">{service.name}</h4>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {service.maxConcurrent || 50} 并发
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{stat.total}</div>
                <div className="text-xs text-gray-500">总任务</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {stat.active}
                </div>
                <div className="text-xs text-gray-500">进行中</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {stat.completed}
                </div>
                <div className="text-xs text-gray-500">已完成</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {stat.failed}
                </div>
                <div className="text-xs text-gray-500">失败</div>
              </div>
            </div>
            
            {stat.active > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>进度</span>
                  <span>{Math.round((stat.completed / stat.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${(stat.completed / stat.total) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

---

## 6. 测试方案

### 6.1 配置热更新测试

```typescript
// src/lib/ai/__tests__/hot-reload.test.ts
import { useConfigStore } from '@/stores/useConfigStore';
import { AIServiceManager } from '@/lib/ai/AIServiceManager';

describe('Config Hot Reload', () => {
  it('should reload adapter when config changes', async () => {
    const store = useConfigStore.getState();
    
    // 添加服务
    store.addService({
      provider: 'openai',
      name: 'Test Service',
      apiKey: 'old-key',
      isActive: true,
      maxConcurrent: 50
    });
    
    const service = store.services[0];
    const adapter1 = AIServiceManager.getAdapter(service);
    
    // 更新配置
    store.updateService(service.id, {
      apiKey: 'new-key'
    });
    
    // 获取新适配器
    const updatedService = store.getServiceById(service.id)!;
    const adapter2 = AIServiceManager.getAdapter(updatedService);
    
    // 应该是不同的实例
    expect(adapter1).not.toBe(adapter2);
  });
});
```

### 6.2 高并发测试

```typescript
// src/lib/ai/__tests__/high-concurrency.test.ts
import { HighConcurrencyQueue } from '@/lib/ai/HighConcurrencyQueue';

describe('High Concurrency Queue', () => {
  it('should handle 50 concurrent requests', async () => {
    const queue = new HighConcurrencyQueue({
      concurrency: 50
    });
    
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: `task-${i}`,
      execute: async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        currentConcurrent--;
        return i;
      }
    }));
    
    await Promise.all(tasks.map(task => queue.add(task)));
    
    // 应该达到50并发
    expect(maxConcurrent).toBe(50);
  });
  
  it('should retry failed requests', async () => {
    const queue = new HighConcurrencyQueue({
      concurrency: 50,
      retries: 3
    });
    
    let attempts = 0;
    
    const task = {
      id: 'retry-task',
      execute: async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      }
    };
    
    const result = await queue.add(task);
    
    expect(attempts).toBe(3);
    expect(result).toBe('success');
  });
  
  it('should handle massive concurrent load', async () => {
    const queue = new HighConcurrencyQueue({
      concurrency: 50
    });
    
    const startTime = Date.now();
    
    // 1000个任务
    const tasks = Array.from({ length: 1000 }, (_, i) => ({
      id: `task-${i}`,
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return i;
      }
    }));
    
    const results = await Promise.all(tasks.map(task => queue.add(task)));
    
    const duration = Date.now() - startTime;
    
    expect(results).toHaveLength(1000);
    console.log(`1000 tasks completed in ${duration}ms`);
  });
});
```

---

## 7. 最佳实践

### 7.1 并发数设置建议

| 场景 | 推荐并发数 | 说明 |
|------|-----------|------|
| 默认配置 | 50 | 适合大多数场景 |
| 自建服务器 | 100+ | 根据服务器性能 |
| 云服务API | 30-50 | 避免触发限制 |
| 本地GPU | 1-5 | 受GPU限制 |

### 7.2 性能优化建议

**1. 预热适配器**
```typescript
// 应用启动时预热
const config = useConfigStore.getState().getActiveService();
if (config) {
  await AIServiceManager.warmup(config);
}
```

**2. 批量任务优化**
```typescript
// 使用BatchGenerator而不是循环调用
const batchGen = new BatchGenerator();
await batchGen.generateBatch(config, params, 100);
```

**3. 错误处理**
```typescript
// 合理设置重试次数
const queue = new HighConcurrencyQueue({
  concurrency: 50,
  retries: 3,  // 网络不稳定时增加
  timeout: 180000  // 3分钟
});
```

### 7.3 监控和告警

```typescript
// src/lib/ai/Monitor.ts
export class PerformanceMonitor {
  private startTime = Date.now();
  private requestCount = 0;
  
  recordRequest() {
    this.requestCount++;
  }
  
  getRequestsPerSecond() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return this.requestCount / elapsed;
  }
  
  shouldAlert() {
    // 如果请求速率过低，可能有问题
    return this.getRequestsPerSecond() < 1;
  }
}
```

---

## 8. 总结

### 8.1 核心特性

✅ **配置热更新**
- 无需重启应用
- 事件驱动架构
- 适配器自动刷新
- 正在执行的请求不受影响

✅ **高并发支持**
- 默认50并发，可调整至100+
- 无速率限制，全速执行
- 自动重试机制
- 实时进度反馈

✅ **用户体验**
- 批量生成优化
- 实时状态显示
- 任务可取消
- 性能监控

### 8.2 技术优势

- **高性能**：50并发，适合大批量生成
- **灵活性**：并发数可动态调整
- **可靠性**：自动重试，错误隔离
- **可观测**：实时监控，统计完整

### 8.3 下一步

1. **实现依赖安装**
```bash
pnpm add p-queue eventemitter3 zod
```

2. **集成到项目**
- 实现ConfigStore
- 实现AIServiceManager
- 实现HighConcurrencyQueue
- 添加UI组件

3. **性能测试**
- 50并发压力测试
- 1000+任务批量测试
- 配置热更新测试

---

**文档版本**：v2.0  
**创建日期**：2026-08-11  
**维护人员**：技术团队  
**更新说明**：移除速率限制，支持高并发（50+）
