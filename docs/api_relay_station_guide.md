# AI中转站API接入指南

## 1. 概述

根据调研，主流AI中转站（API Gateway/Relay Station）都遵循 **OpenAI兼容格式**，这是事实上的行业标准。

### 1.1 为什么选择OpenAI格式？

- **行业标准**：几乎所有中转站都支持OpenAI格式
- **兼容性强**：支持Claude、Gemini、通义千问、Kimi等多种模型的统一接入
- **易于切换**：只需更改`base_url`和`api_key`即可切换服务商
- **生态丰富**：大量工具和SDK支持

### 1.2 主流中转站项目

| 项目 | Star | 特点 |
|------|------|------|
| [One-API](https://github.com/songquanpeng/one-api) | 18k+ | 最流行的开源中转站 |
| [New-API](https://github.com/Calcium-Ion/new-api) | 2.5k+ | One-API增强版 |
| [MIXAPI](https://github.com/aiprodcoder/MIXAPI) | - | 集成多种插件，功能超强 |
| [openai-style-api](https://github.com/tian-minghui/openai-style-api) | - | 统一多种模型为OpenAI格式 |
| [Sub2API](https://github.com/Wei-Shaw/sub2api) | - | 订阅转API，支持拼车 |

---

## 2. OpenAI兼容格式详解

### 2.1 通用配置

所有中转站都需要两个核心参数：

```typescript
interface RelayConfig {
  baseURL: string;    // 中转站地址，如 https://api.your-relay.com/v1
  apiKey: string;     // 中转站分配的密钥
}
```

### 2.2 文生图接口（Images API）

#### 标准OpenAI格式

```typescript
// POST {baseURL}/images/generations
{
  "model": "dall-e-3",           // 模型名称
  "prompt": "商品主图，白色背景",  // 提示词
  "n": 1,                         // 生成数量（1-4）
  "size": "1024x1024",            // 尺寸
  "quality": "standard",          // 质量：standard | hd
  "style": "vivid",               // 风格：vivid | natural
  "response_format": "url"        // 返回格式：url | b64_json
}
```

#### 响应格式

```json
{
  "created": 1589478378,
  "data": [
    {
      "url": "https://...",
      "b64_json": "base64_encoded_image"
    }
  ]
}
```

### 2.3 扩展格式（Stable Diffusion风格）

很多中转站支持更详细的参数（通过`extra`字段或直接传递）：

```typescript
// POST {baseURL}/v1/images/generations
{
  "model": "stable-diffusion-xl",
  "prompt": "a cute corgi",
  "negative_prompt": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "steps": 30,                    // 采样步数
  "cfg_scale": 7.5,               // 提示词相关性
  "sampler": "DPM++ 2M Karras",   // 采样器
  "seed": -1,                     // 随机种子
  "batch_size": 1,
  "n_iter": 1
}
```

### 2.4 图生图接口

```typescript
// POST {baseURL}/v1/images/edits
{
  "model": "stable-diffusion-xl",
  "image": "base64_encoded_image",  // 原图
  "prompt": "add flowers",
  "mask": "base64_encoded_mask",    // 可选：蒙版
  "strength": 0.75,                 // 变化强度（0-1）
  "n": 1,
  "size": "1024x1024"
}
```

---

## 3. 适配器实现

### 3.1 统一接口设计

```typescript
// src/lib/ai/base.ts
export interface AIServiceConfig {
  provider: 'openai' | 'alibaba' | 'relay';  // 添加'relay'类型
  apiKey: string;
  baseURL?: string;
  model?: string;
  
  // 中转站特有配置
  relayType?: 'openai' | 'sd';  // openai格式或stable diffusion格式
}

export interface TextToImageParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  samples: number;
  
  // 高级参数
  steps?: number;
  cfgScale?: number;
  seed?: number;
  sampler?: string;
  style?: string;
}
```

### 3.2 中转站适配器

```typescript
// src/lib/ai/adapters/relay.ts
export class RelayStationAdapter implements AIServiceAdapter {
  private config: AIServiceConfig;
  
  constructor(config: AIServiceConfig) {
    this.config = config;
  }
  
  async textToImage(params: TextToImageParams): Promise<string[]> {
    const isSDFormat = this.config.relayType === 'sd';
    
    // 根据格式类型构建请求
    const requestBody = isSDFormat 
      ? this.buildSDRequest(params)
      : this.buildOpenAIRequest(params);
    
    const response = await fetch(`${this.config.baseURL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Relay API Error: ${error.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    
    // 统一处理返回格式
    return data.data.map((item: any) => item.url || item.b64_json);
  }
  
  private buildOpenAIRequest(params: TextToImageParams) {
    return {
      model: this.config.model || 'dall-e-3',
      prompt: params.prompt,
      n: params.samples,
      size: `${params.width}x${params.height}`,
      quality: 'standard',
      response_format: 'url'
    };
  }
  
  private buildSDRequest(params: TextToImageParams) {
    return {
      model: this.config.model || 'stable-diffusion-xl',
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || '',
      width: params.width,
      height: params.height,
      steps: params.steps || 30,
      cfg_scale: params.cfgScale || 7.5,
      seed: params.seed || -1,
      sampler: params.sampler || 'DPM++ 2M Karras',
      batch_size: params.samples,
      n_iter: 1
    };
  }
  
  async imageToImage(params: ImageToImageParams): Promise<string[]> {
    const requestBody = {
      model: this.config.model || 'stable-diffusion-xl',
      image: params.imageData,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      strength: params.strength,
      width: params.width,
      height: params.height,
      steps: params.steps || 30,
      n: params.samples
    };
    
    const response = await fetch(`${this.config.baseURL}/images/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    return data.data.map((item: any) => item.url);
  }
  
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 3.3 工厂函数更新

```typescript
// src/lib/ai/factory.ts
export function createAIService(config: AIServiceConfig): AIServiceAdapter {
  switch (config.provider) {
    case 'alibaba':
      return new AlibabaAIAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'relay':
      return new RelayStationAdapter(config);  // 新增
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

---

## 4. UI配置界面

### 4.1 配置表单

```typescript
// src/components/settings/RelayStationConfig.tsx
export function RelayStationConfig() {
  const [config, setConfig] = useState({
    baseURL: '',
    apiKey: '',
    model: 'dall-e-3',
    relayType: 'openai' as 'openai' | 'sd'
  });
  
  return (
    <div className="space-y-4">
      <div>
        <label>中转站地址</label>
        <input 
          placeholder="https://api.your-relay.com/v1"
          value={config.baseURL}
          onChange={(e) => setConfig({...config, baseURL: e.target.value})}
        />
        <p className="text-sm text-gray-500">
          常见格式：https://域名/v1
        </p>
      </div>
      
      <div>
        <label>API Key</label>
        <input 
          type="password"
          placeholder="sk-xxxxxxxxxxxx"
          value={config.apiKey}
          onChange={(e) => setConfig({...config, apiKey: e.target.value})}
        />
      </div>
      
      <div>
        <label>接口格式</label>
        <select 
          value={config.relayType}
          onChange={(e) => setConfig({...config, relayType: e.target.value as any})}
        >
          <option value="openai">OpenAI标准格式</option>
          <option value="sd">Stable Diffusion格式</option>
        </select>
        <p className="text-sm text-gray-500">
          大多数中转站使用OpenAI格式
        </p>
      </div>
      
      <div>
        <label>模型名称</label>
        <input 
          placeholder="dall-e-3 或 stable-diffusion-xl"
          value={config.model}
          onChange={(e) => setConfig({...config, model: e.target.value})}
        />
        <p className="text-sm text-gray-500">
          根据中转站支持的模型填写
        </p>
      </div>
      
      <button onClick={testConnection}>
        测试连接
      </button>
    </div>
  );
}
```

---

## 5. 常见中转站配置示例

### 5.1 One-API / New-API

```typescript
const config = {
  provider: 'relay',
  baseURL: 'https://your-domain.com/v1',
  apiKey: 'sk-xxxxx',  // 在中转站后台生成的令牌
  model: 'dall-e-3',   // 或其他支持的模型
  relayType: 'openai'
};
```

### 5.2 自建Stable Diffusion中转

```typescript
const config = {
  provider: 'relay',
  baseURL: 'http://localhost:7860/sdapi/v1',
  apiKey: '',  // 本地部署可能不需要
  model: 'stable-diffusion-xl',
  relayType: 'sd'
};
```

### 5.3 商业中转服务

```typescript
const config = {
  provider: 'relay',
  baseURL: 'https://api.commercial-relay.com/v1',
  apiKey: 'your-api-key',
  model: 'dall-e-3',
  relayType: 'openai'
};
```

---

## 6. 错误处理

### 6.1 常见错误码

```typescript
export const RELAY_ERROR_CODES = {
  401: '无效的API Key',
  403: '余额不足或权限不足',
  429: '请求过于频繁',
  500: '中转站服务器错误',
  502: '上游API不可用',
  504: '请求超时'
};

export function handleRelayError(error: any): string {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message;
  
  return RELAY_ERROR_CODES[status] || message || '未知错误';
}
```

### 6.2 重试策略

```typescript
// src/lib/ai/retry.ts
export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const shouldRetry = [429, 500, 502, 504].includes(error.response?.status);
      
      if (i === maxRetries - 1 || !shouldRetry) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

---

## 7. 数据库Schema更新

```prisma
// prisma/schema.prisma
model Config {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  type          String    // 'ai_service' | 'preference' | 'system'
  
  // AI服务配置
  provider      String?   // 'alibaba' | 'openai' | 'relay'  <- 添加'relay'
  apiKey        String?   // 加密存储
  baseURL       String?
  model         String?
  
  // 中转站特有配置
  relayType     String?   // 'openai' | 'sd'  <- 新增字段
  
  preferences   Json?
  isActive      Boolean   @default(true)
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@unique([userId, type, provider])
  @@index([userId, type])
}
```

---

## 8. 测试方案

### 8.1 单元测试

```typescript
// src/lib/ai/__tests__/relay.test.ts
describe('RelayStationAdapter', () => {
  it('should generate image with OpenAI format', async () => {
    const adapter = new RelayStationAdapter({
      provider: 'relay',
      baseURL: 'https://test.com/v1',
      apiKey: 'test-key',
      relayType: 'openai'
    });
    
    const result = await adapter.textToImage({
      prompt: 'test',
      width: 1024,
      height: 1024,
      samples: 1
    });
    
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^https?:\/\//);
  });
  
  it('should generate image with SD format', async () => {
    // 类似测试...
  });
  
  it('should handle errors gracefully', async () => {
    // 错误处理测试...
  });
});
```

---

## 9. 用户文档

### 9.1 如何配置中转站

**步骤1：获取中转站信息**
- 中转站地址（如：https://api.xxx.com/v1）
- API Key（在中转站后台生成）
- 支持的模型列表

**步骤2：在系统中配置**
1. 进入"设置" → "AI服务配置"
2. 选择"自定义中转站"
3. 填写中转站地址和API Key
4. 选择接口格式（通常选OpenAI格式）
5. 填写模型名称
6. 点击"测试连接"验证配置
7. 保存配置

**步骤3：开始使用**
- 在文生图/图生图界面选择中转站配置
- 正常使用即可

### 9.2 常见问题

**Q: 如何判断中转站使用哪种格式？**
A: 大多数使用OpenAI格式。查看中转站文档或先尝试OpenAI格式。

**Q: 提示"无效的API Key"怎么办？**
A: 检查API Key是否正确，是否有权限，余额是否充足。

**Q: 生成速度很慢？**
A: 可能是中转站负载高或网络延迟，可以尝试更换中转站。

**Q: 支持哪些模型？**
A: 取决于中转站配置，常见的有DALL-E 3、Stable Diffusion XL、Midjourney等。

---

## 10. 参考资料

### 开源项目
- [One-API](https://github.com/songquanpeng/one-api) - 最流行的开源中转站
- [New-API](https://github.com/Calcium-Ion/new-api) - One-API增强版
- [MIXAPI](https://github.com/aiprodcoder/MIXAPI) - 功能丰富的中转平台
- [openai-style-api](https://github.com/tian-minghui/openai-style-api) - 多模型统一为OpenAI格式

### API文档
- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)
- [Stable Diffusion API Guide](https://modelslab.com/blog/stable-diffusion-api/)
- [AUTOMATIC1111 WebUI API](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API)

---

**文档版本**：v1.0  
**创建日期**：2026-08-11  
**维护人员**：技术团队
