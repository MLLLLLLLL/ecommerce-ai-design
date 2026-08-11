# AI服务层使用指南

## 概述

AI服务层提供统一的接口来对接多种AI图像生成服务，支持OpenAI、阿里百炼和自定义中转站。

## 支持的服务

### 1. OpenAI (DALL-E)
- **DALL-E 2**: 256x256, 512x512, 1024x1024
- **DALL-E 3**: 1024x1024, 1792x1024, 1024x1792
- 支持文生图和图生图（变体）

### 2. 阿里百炼（通义万相）
- 模型：wanx-v1
- 支持自定义尺寸
- 支持负向提示词
- 完整的参数控制

### 3. 中转站
- **OpenAI格式**：兼容OpenAI API的中转站
- **Stable Diffusion格式**：原生SD WebUI API
- 灵活配置，支持各种自建服务

## 快速开始

### 1. 配置服务

```typescript
import { AIServiceConfig } from '@/types/ai';

const config: AIServiceConfig = {
  id: 'my-service',
  provider: 'openai', // 'openai' | 'alibaba' | 'relay'
  name: 'My OpenAI Service',
  apiKey: 'sk-your-api-key',
  model: 'dall-e-3', // 可选
  maxConcurrent: 50, // 可选，默认50
};
```

### 2. 创建适配器

```typescript
import { AIServiceManager } from '@/lib/ai/AIServiceManager';

const adapter = AIServiceManager.getAdapter(config);
```

### 3. 文生图

```typescript
const images = await adapter.textToImage({
  prompt: '一只可爱的猫咪',
  negativePrompt: '模糊，低质量', // 可选
  width: 1024,
  height: 1024,
  samples: 1, // 生成数量
  steps: 20, // 可选，采样步数
  cfgScale: 7, // 可选，提示词相关度
  seed: 12345, // 可选，随机种子
});

console.log(images); // ['https://...', 'https://...']
```

### 4. 图生图

```typescript
const images = await adapter.imageToImage({
  image: 'https://example.com/image.jpg', // 或 base64
  prompt: '将背景改为蓝天',
  width: 1024,
  height: 1024,
  samples: 1,
  strength: 0.75, // 0-1，原图影响强度
});
```

### 5. 测试连接

```typescript
const isConnected = await adapter.testConnection();
console.log('连接状态:', isConnected);
```

## API路由使用

### 测试连接

```bash
POST /api/ai/test-connection

Body:
{
  "provider": "openai",
  "name": "Test Service",
  "apiKey": "sk-your-key",
  "model": "dall-e-3"
}

Response:
{
  "success": true,
  "message": "Successfully connected to Test Service",
  "provider": "openai"
}
```

### 文生图

```bash
POST /api/ai/text-to-image

Body:
{
  "config": {
    "id": "service-1",
    "provider": "openai",
    "name": "My Service",
    "apiKey": "sk-your-key"
  },
  "params": {
    "prompt": "一只可爱的猫咪",
    "width": 1024,
    "height": 1024,
    "samples": 1
  }
}

Response:
{
  "success": true,
  "images": ["https://..."],
  "count": 1,
  "provider": "openai"
}
```

## 安全特性

### API Key加密

所有API Key使用AES-256-GCM加密存储：

```typescript
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';

// 加密
const encrypted = encryptApiKey('sk-your-api-key');
// 格式: "iv:authTag:encrypted"

// 解密
const decrypted = decryptApiKey(encrypted);
```

### 环境变量

确保设置 `ENCRYPTION_SECRET`：

```bash
# .env
ENCRYPTION_SECRET="你的32字节密钥（64位hex）"
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 配置热更新

使用事件系统实现配置热更新：

```typescript
import { configEmitter } from '@/lib/ai/AIServiceManager';

// 更新服务配置
updateServiceConfig(serviceId, newConfig);

// 发出更新事件
configEmitter.emit('service:updated', serviceId);

// AIServiceManager会自动清除缓存
// 下次请求将使用新配置
```

## 测试页面

访问 `/ai-test` 页面进行交互式测试：

```
http://localhost:3000/ai-test
```

功能：
- 选择服务提供商
- 输入API配置
- 测试连接
- 查看结果

## 适配器详情

### OpenAI适配器

```typescript
// 支持的模型
model: 'dall-e-2' | 'dall-e-3'

// DALL-E 3特点
- 每次只能生成1张图
- 更高的图片质量
- 更好的提示词理解

// DALL-E 2特点
- 可批量生成（最多10张）
- 支持图生图变体
- 更快的生成速度
```

### 阿里百炼适配器

```typescript
// 默认模型
model: 'wanx-v1'

// 尺寸格式
size: '1024*1024' // 注意是星号

// 支持参数
- prompt: 提示词
- negative_prompt: 负向提示词
- steps: 采样步数
- seed: 随机种子
```

### 中转站适配器

```typescript
// OpenAI格式
{
  provider: 'relay',
  baseURL: 'https://api.example.com/v1',
  relayType: 'openai',
  apiKey: 'your-key'
}

// Stable Diffusion格式
{
  provider: 'relay',
  baseURL: 'http://localhost:7860',
  relayType: 'sd',
  apiKey: '' // SD通常不需要key
}
```

## 错误处理

```typescript
try {
  const images = await adapter.textToImage(params);
} catch (error) {
  console.error('生成失败:', error.message);
  
  // 常见错误
  // - API Key无效
  // - 配额不足
  // - 参数错误
  // - 网络超时
}
```

## 最佳实践

### 1. 使用适配器缓存

```typescript
// 推荐：使用AIServiceManager（自动缓存）
const adapter = AIServiceManager.getAdapter(config);

// 不推荐：每次创建新实例
const adapter = AIServiceManager.createAdapter(config);
```

### 2. 预热服务

```typescript
// 应用启动时预热常用服务
await AIServiceManager.warmup(config);
```

### 3. 配置验证

```typescript
import { validateConfig } from '@/lib/ai/factory';

const errors = validateConfig(config);
if (errors.length > 0) {
  console.error('配置错误:', errors);
}
```

### 4. 错误重试

```typescript
async function generateWithRetry(adapter, params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await adapter.textToImage(params);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

## 性能优化

### 1. 并发控制

每个服务配置 `maxConcurrent` 参数（默认50）：

```typescript
const config = {
  ...
  maxConcurrent: 10, // 限制并发数
};
```

### 2. 缓存统计

```typescript
const stats = AIServiceManager.getCacheStats();
console.log('缓存大小:', stats.size);
console.log('服务列表:', stats.services);
```

### 3. 清除缓存

```typescript
// 清除所有缓存
AIServiceManager.clearCache();

// 清除指定服务
AIServiceManager.clearServiceCache(serviceId);
```

## 下一步

- Week 4: 实现ConfigStore（Zustand状态管理）
- Week 4: 实现HighConcurrencyQueue（50并发队列）
- Week 4: 实现FileStorage（文件存储服务）

## 参考文档

- [technical_design.md](../docs/technical_design.md) - 技术设计
- [api_relay_station_guide.md](../docs/api_relay_station_guide.md) - 中转站指南
- [config_hot_reload_high_concurrency.md](../docs/config_hot_reload_high_concurrency.md) - 配置热更新
