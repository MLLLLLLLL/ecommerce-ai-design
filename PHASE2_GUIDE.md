# Phase 2 执行指南 - 核心基础设施

## 📋 概述

**阶段**: Phase 2 - 核心基础设施  
**时间**: Week 3-4  
**目标**: 实现AI服务层、配置热更新和高并发队列系统

**参考文档**:
- [technical_design.md](./docs/technical_design.md) - 第3.1节
- [config_hot_reload_high_concurrency.md](./docs/config_hot_reload_high_concurrency.md)
- [development_plan.md](./docs/development_plan.md) - Phase 2部分

---

## Week 3: AI服务层实现

### Day 1-2: 基础接口与加密工具 🔄 进行中

#### 任务清单
- [ ] 定义AI服务接口
- [ ] 创建工厂函数
- [ ] 实现加密工具
- [ ] 创建基础类型定义

#### 步骤1: 创建类型定义

创建 `src/types/ai.ts`:
```typescript
// AI服务配置
export interface AIServiceConfig {
  id: string;
  provider: 'openai' | 'alibaba' | 'relay';
  name: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  relayType?: 'openai' | 'sd';
  maxConcurrent?: number;
}

// 文生图参数
export interface TextToImageParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  samples: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

// 图生图参数
export interface ImageToImageParams extends TextToImageParams {
  image: string;  // base64 or URL
  strength?: number;
  mask?: string;
}

// AI服务响应
export interface AIServiceResponse {
  images: string[];  // URLs or base64
  metadata?: {
    seed?: number;
    model?: string;
    cost?: number;
  };
}
```

#### 步骤2: 创建AI服务接口

创建 `src/lib/ai/base.ts`:
```typescript
import { 
  AIServiceConfig,
  TextToImageParams,
  ImageToImageParams,
  AIServiceResponse 
} from '@/types/ai';

export abstract class AIServiceAdapter {
  protected config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  // 测试连接
  abstract testConnection(): Promise<boolean>;

  // 文生图
  abstract textToImage(params: TextToImageParams): Promise<string[]>;

  // 图生图
  abstract imageToImage(params: ImageToImageParams): Promise<string[]>;

  // 获取配置
  getConfig(): AIServiceConfig {
    return this.config;
  }
}
```

#### 步骤3: 创建加密工具

创建 `src/lib/security/encryption.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.ENCRYPTION_SECRET!;

if (!SECRET || SECRET.length !== 64) {
  throw new Error('ENCRYPTION_SECRET must be 32 bytes (64 hex characters)');
}

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(
    ALGORITHM,
    Buffer.from(SECRET, 'hex'),
    iv
  );

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptApiKey(encrypted: string): string {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(':');

  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Invalid encrypted format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(SECRET, 'hex'),
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

#### 步骤4: 创建工厂函数

创建 `src/lib/ai/factory.ts`:
```typescript
import { AIServiceConfig } from '@/types/ai';
import { AIServiceAdapter } from './base';
import { OpenAIAdapter } from './adapters/openai';
import { AlibabaAdapter } from './adapters/alibaba';
import { RelayAdapter } from './adapters/relay';

export function createAIService(config: AIServiceConfig): AIServiceAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config);
    
    case 'alibaba':
      return new AlibabaAdapter(config);
    
    case 'relay':
      return new RelayAdapter(config);
    
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

#### 验收标准
- [ ] 类型定义完整
- [ ] AI服务接口创建
- [ ] 加密工具测试通过
- [ ] 工厂函数可用

---

### Day 3-4: 具体适配器实现

#### 任务清单
- [ ] OpenAI适配器
- [ ] 阿里百炼适配器
- [ ] 中转站适配器
- [ ] 单元测试

#### OpenAI适配器

创建 `src/lib/ai/adapters/openai.ts`:
```typescript
import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams } from '@/types/ai';

export class OpenAIAdapter extends AIServiceAdapter {
  private baseURL: string;

  constructor(config: any) {
    super(config);
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async textToImage(params: TextToImageParams): Promise<string[]> {
    const response = await fetch(`${this.baseURL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model || 'dall-e-3',
        prompt: params.prompt,
        n: params.samples,
        size: `${params.width}x${params.height}`,
        quality: 'standard',
        response_format: 'url'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => item.url);
  }

  async imageToImage(params: ImageToImageParams): Promise<string[]> {
    // OpenAI doesn't support image-to-image directly
    // Use edits or variations endpoint
    throw new Error('OpenAI image-to-image not implemented yet');
  }
}
```

#### 验收标准
- [ ] OpenAI适配器实现
- [ ] 阿里百炼适配器实现
- [ ] 中转站适配器实现
- [ ] 单元测试通过

---

### Day 5: AIServiceManager实现

#### 任务清单
- [ ] 实现AIServiceManager
- [ ] 实现配置监听
- [ ] 实现适配器缓存
- [ ] 测试热更新

#### AIServiceManager

创建 `src/lib/ai/AIServiceManager.ts`:
```typescript
import { AIServiceAdapter } from './base';
import { createAIService } from './factory';
import { AIServiceConfig } from '@/types/ai';
import { EventEmitter } from 'events';

export const configEmitter = new EventEmitter();

class AIServiceManagerClass {
  private adapters: Map<string, AIServiceAdapter> = new Map();
  
  constructor() {
    this.setupConfigListeners();
  }
  
  private setupConfigListeners() {
    configEmitter.on('service:updated', (serviceId: string) => {
      console.log(`[AIServiceManager] Service updated: ${serviceId}`);
      this.adapters.delete(serviceId);
    });
    
    configEmitter.on('service:deleted', (serviceId: string) => {
      console.log(`[AIServiceManager] Service deleted: ${serviceId}`);
      this.adapters.delete(serviceId);
    });
  }
  
  getAdapter(config: AIServiceConfig): AIServiceAdapter {
    const cacheKey = config.id;
    
    if (this.adapters.has(cacheKey)) {
      return this.adapters.get(cacheKey)!;
    }
    
    const adapter = createAIService(config);
    this.adapters.set(cacheKey, adapter);
    
    return adapter;
  }
  
  static createAdapter(config: AIServiceConfig): AIServiceAdapter {
    return createAIService(config);
  }
  
  clearCache() {
    this.adapters.clear();
  }
}

export const AIServiceManager = new AIServiceManagerClass();
```

---

## Week 4: 配置管理与高并发队列

### Day 1-2: ConfigStore实现

#### 任务清单
- [ ] 创建ConfigStore
- [ ] 实现配置持久化
- [ ] 实现事件发布
- [ ] 创建useAIService Hook

#### ConfigStore

创建 `src/stores/useConfigStore.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { configEmitter } from '@/lib/ai/AIServiceManager';
import { AIServiceConfig } from '@/types/ai';
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';

interface ConfigState {
  services: AIServiceConfig[];
  activeServiceId: string | null;
  version: number;
  
  getActiveService: () => AIServiceConfig | null;
  getServiceById: (id: string) => AIServiceConfig | null;
  addService: (config: Omit<AIServiceConfig, 'id'>) => void;
  updateService: (id: string, updates: Partial<AIServiceConfig>) => void;
  deleteService: (id: string) => void;
  setActiveService: (id: string) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      services: [],
      activeServiceId: null,
      version: 0,
      
      getActiveService: () => {
        const { services, activeServiceId } = get();
        const service = services.find(s => s.id === activeServiceId);
        if (!service) return null;
        
        // 解密API Key
        return {
          ...service,
          apiKey: decryptApiKey(service.apiKey)
        };
      },
      
      getServiceById: (id) => {
        const service = get().services.find(s => s.id === id);
        if (!service) return null;
        
        return {
          ...service,
          apiKey: decryptApiKey(service.apiKey)
        };
      },
      
      addService: (config) => {
        const newService = {
          ...config,
          id: crypto.randomUUID(),
          apiKey: encryptApiKey(config.apiKey),
          maxConcurrent: config.maxConcurrent || 50
        };
        
        set(state => ({
          services: [...state.services, newService],
          version: state.version + 1
        }));
      },
      
      updateService: (id, updates) => {
        set(state => {
          const services = state.services.map(s =>
            s.id === id ? {
              ...s,
              ...updates,
              apiKey: updates.apiKey ? encryptApiKey(updates.apiKey) : s.apiKey
            } : s
          );
          
          return {
            services,
            version: state.version + 1
          };
        });
        
        configEmitter.emit('service:updated', id);
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
      }
    }),
    {
      name: 'ai-service-config'
    }
  )
);
```

---

### Day 3-4: 高并发队列实现

#### HighConcurrencyQueue

创建 `src/lib/ai/HighConcurrencyQueue.ts`:
(参考 config_hot_reload_high_concurrency.md)

---

### Day 5: 文件存储服务

#### FileStorage

创建 `src/lib/storage/FileStorage.ts`:
(参考 development_plan.md)

---

## ✅ Phase 2 完成检查清单

### Week 3
- [ ] Day 1-2: 基础接口与加密
  - [ ] 类型定义
  - [ ] AI服务接口
  - [ ] 加密工具
  - [ ] 工厂函数
  
- [ ] Day 3-4: 适配器实现
  - [ ] OpenAI适配器
  - [ ] 阿里百炼适配器
  - [ ] 中转站适配器
  - [ ] 单元测试
  
- [ ] Day 5: AIServiceManager
  - [ ] 服务管理器
  - [ ] 配置监听
  - [ ] 适配器缓存

### Week 4
- [ ] Day 1-2: ConfigStore
  - [ ] Zustand Store
  - [ ] 配置持久化
  - [ ] 事件发布
  - [ ] useAIService Hook
  
- [ ] Day 3-4: 高并发队列
  - [ ] HighConcurrencyQueue
  - [ ] QueueManager
  - [ ] 自动重试
  
- [ ] Day 5: 文件存储
  - [ ] FileStorage
  - [ ] 缩略图生成
  - [ ] 文件管理

---

**执行人员**: ___________  
**开始日期**: 2026-08-11  
**预计完成**: Week 4结束  
**状态**: 🔄 Week 3 Day 1-2 进行中
