
**搜索实现**：

```typescript
// src/lib/storage/AssetSearch.ts
export class AssetSearch {
  async search(query: string, filters?: SearchFilters) {
    const where: Prisma.AssetWhereInput = {
      OR: [
        { filename: { contains: query, mode: 'insensitive' } },
        { prompt: { contains: query, mode: 'insensitive' } },
        { tags: { some: { name: { contains: query } } } }
      ]
    };
    
    if (filters?.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end
      };
    }
    
    if (filters?.tags) {
      where.tags = {
        some: { id: { in: filters.tags } }
      };
    }
    
    if (filters?.source) {
      where.source = filters.source;
    }
    
    return await prisma.asset.findMany({
      where,
      include: {
        tags: true,
        folder: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
```

---

## 4. 数据流设计

### 4.1 文生图流程

```
用户输入提示词
    ↓
前端验证 + 参数收集
    ↓
调用 /api/ai/text-to-image
    ↓
获取用户配置的AI服务
    ↓
创建对应的AIServiceAdapter
    ↓
调用第三方API
    ↓
接收图片数据
    ↓
保存到本地文件系统
    ↓
创建Asset数据库记录
    ↓
生成缩略图
    ↓
返回前端显示
```

### 4.2 工作流执行流程

```
用户点击"运行"
    ↓
前端发送 /api/workflow/execute
    ↓
创建WorkflowEngine实例
    ↓
拓扑排序确定执行顺序
    ↓
逐个执行节点：
  - 收集输入数据
  - 调用节点executor
  - 保存输出到context
  - SSE推送进度到前端
    ↓
处理条件分支和循环
    ↓
所有节点执行完成
    ↓
返回最终结果
```

### 4.3 画布导出流程

```
用户点击"导出"
    ↓
Fabric.js生成DataURL
    ↓
前端上传 /api/assets/upload
    ↓
DataURL转Buffer
    ↓
使用sharp进行优化
    ↓
保存到文件系统
    ↓
创建Asset记录
    ↓
返回Asset ID
```

---

## 5. 性能优化

### 5.1 前端优化

**1. 代码分割**
```typescript
// 懒加载重型模块
const CanvasEditor = dynamic(() => import('@/components/canvas/CanvasEditor'), {
  ssr: false,
  loading: () => <Skeleton />
});

const WorkflowEditor = dynamic(() => import('@/components/workflow/WorkflowEditor'), {
  ssr: false
});
```

**2. 虚拟滚动**
```typescript
// 资源库使用虚拟滚动
import { useVirtualizer } from '@tanstack/react-virtual';

function AssetGrid({ assets }: { assets: Asset[] }) {
  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5
  });
  
  // 只渲染可见区域的素材...
}
```

**3. 图片懒加载**
```typescript
<Image
  src={asset.thumbnail}
  alt={asset.filename}
  loading="lazy"
  placeholder="blur"
/>
```

### 5.2 后端优化

**1. 数据库索引**
```prisma
model Asset {
  // ...
  @@index([createdAt])
  @@index([folderId])
  @@index([source])
  @@fulltext([filename, prompt]) // 全文搜索
}
```

**2. 缓存策略**
```typescript
// 使用React Query缓存
const { data } = useQuery({
  queryKey: ['assets', folderId],
  queryFn: () => fetchAssets(folderId),
  staleTime: 5 * 60 * 1000 // 5分钟
});
```

**3. 文件流式传输**
```typescript
// API路由返回流
export async function GET(req: Request) {
  const fileStream = createReadStream(filePath);
  return new Response(fileStream as any, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}
```

### 5.3 AI请求优化

**1. 请求队列**
```typescript
class AIRequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private concurrent = 3; // 最多3个并发请求
  
  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }
  
  private async process() {
    // 控制并发数...
  }
}
```

**2. 结果缓存**
```typescript
// 相同提示词+参数缓存结果
const cacheKey = hash(JSON.stringify({ prompt, params }));
const cached = await redis.get(cacheKey);
if (cached) return cached;
```

---

## 6. 安全设计

### 6.1 API Key加密存储

```typescript
// 使用crypto加密
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.ENCRYPTION_SECRET!;

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(SECRET, 'hex'), iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptApiKey(encrypted: string): string {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(':');
  
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

### 6.2 文件上传验证

```typescript
// 验证文件类型和大小
export function validateImageFile(file: File): boolean {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  const maxSize = 20 * 1024 * 1024; // 20MB
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('不支持的文件格式');
  }
  
  if (file.size > maxSize) {
    throw new Error('文件大小超过限制');
  }
  
  return true;
}
```

### 6.3 存储空间限制

```typescript
export async function checkStorageQuota(userId: string): Promise<boolean> {
  const totalSize = await prisma.asset.aggregate({
    where: { userId },
    _sum: { filesize: true }
  });
  
  const used = totalSize._sum.filesize || 0;
  const limit = 5 * 1024 * 1024 * 1024; // 5GB
  
  return used < limit;
}
```

---

## 7. 部署方案

### 7.1 本地部署（推荐）

**Docker Compose配置**：

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ecommerce_ai
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: ecommerce_ai_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://ecommerce_ai:changeme@postgres:5432/ecommerce_ai_db
      NODE_ENV: production
    volumes:
      - ./user-data:/app/user-data
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

**启动命令**：
```bash
# 1. 启动数据库
docker-compose up -d postgres

# 2. 初始化数据库
pnpm prisma migrate deploy

# 3. 启动应用
pnpm build
pnpm start
```

### 7.2 云端部署（扩展方案）

**Vercel + Supabase**：
- 前端部署到Vercel
- 数据库使用Supabase PostgreSQL
- 文件存储使用Supabase Storage或AWS S3

---

## 8. 扩展性设计

### 8.1 插件系统（后期）

```typescript
// 插件接口
export interface WorkflowPlugin {
  id: string;
  name: string;
  version: string;
  nodes: PluginNode[];
}

export interface PluginNode {
  type: string;
  category: string;
  execute: (inputs: any, context: any) => Promise<any>;
  ui: React.ComponentType<any>;
}

// 注册插件
export class PluginManager {
  private plugins = new Map<string, WorkflowPlugin>();
  
  register(plugin: WorkflowPlugin) {
    this.plugins.set(plugin.id, plugin);
  }
  
  getNode(type: string): PluginNode | undefined {
    for (const plugin of this.plugins.values()) {
      const node = plugin.nodes.find(n => n.type === type);
      if (node) return node;
    }
  }
}
```

### 8.2 云端同步（后期）

```typescript
// 同步服务
export class SyncService {
  async syncToCloud(assets: Asset[]) {
    // 上传到云存储...
  }
  
  async syncFromCloud() {
    // 从云端下载...
  }
  
  async enableAutoSync() {
    // 监听本地变化，自动同步...
  }
}
```

### 8.3 多租户支持（后期）

```typescript
// 数据库增加用户隔离
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  name      String
  assets    Asset[]
  projects  Project[]
  configs   Config[]
}

// 所有查询都带上 userId 过滤
const assets = await prisma.asset.findMany({
  where: { userId: currentUser.id }
});
```

---

## 9. 开发计划

### Phase 1: 项目初始化（1周）
- ✅ 搭建Next.js项目
- ✅ 配置TypeScript、ESLint、Prettier
- ✅ 集成Tailwind CSS和shadcn/ui
- ✅ 配置Prisma和PostgreSQL
- ✅ 创建基础目录结构
- ✅ 设置Docker开发环境

### Phase 2: AI服务集成（2周）
- ✅ 实现AI适配器基类
- ✅ 对接阿里百炼API
- ✅ 对接OpenAI API
- ✅ 实现API Key加密存储
- ✅ 创建配置管理界面

### Phase 3: 文生图功能（2周）
- ✅ 设计UI界面
- ✅ 实现提示词输入
- ✅ 参数配置面板
- ✅ 图片生成和展示
- ✅ 保存到资源库

### Phase 4: 图生图功能（2周）
- ✅ 图片上传组件
- ✅ 相似度控制
- ✅ 局部重绘功能
- ✅ 背景替换工具

### Phase 5: 资源库（2周）
- ✅ 文件存储系统
- ✅ 文件夹管理
- ✅ 标签系统
- ✅ 搜索功能
- ✅ 批量操作

### Phase 6: 无限画布（3周）
- ✅ 集成Fabric.js
- ✅ 基础编辑功能
- ✅ 图层管理
- ✅ 文字和形状工具
- ✅ 导出功能

### Phase 7: 工作流引擎（4周）
- ✅ 集成React Flow
- ✅ 实现20种节点
- ✅ 执行引擎开发
- ✅ 条件分支和循环
- ✅ 工作流保存/加载

### Phase 8: 优化和测试（2周）
- ✅ 性能优化
- ✅ 用户体验优化
- ✅ 单元测试
- ✅ 集成测试
- ✅ 文档完善

---

## 10. 技术风险和应对

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| AI API不稳定 | 高 | 实现重试机制、降级方案、错误友好提示 |
| 大文件存储性能 | 中 | 使用缩略图、懒加载、分页加载 |
| 工作流执行超时 | 中 | 设置超时限制、支持中断和恢复 |
| 浏览器兼容性 | 低 | 使用Polyfill、提示升级浏览器 |
| 存储空间不足 | 低 | 监控提醒、自动清理临时文件 |

---

## 11. 监控和日志

### 11.1 错误监控

```typescript
// 集成Sentry（可选）
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### 11.2 日志系统

```typescript
// src/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### 11.3 性能监控

```typescript
// 监控AI请求耗时
export async function measureAIRequest<T>(
  fn: () => Promise<T>,
  metadata: Record<string, any>
): Promise<T> {
  const start = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    
    logger.info('AI request completed', {
      ...metadata,
      duration,
      success: true
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    
    logger.error('AI request failed', {
      ...metadata,
      duration,
      error: error.message
    });
    
    throw error;
  }
}
```

---

## 12. 附录

### 12.1 环境变量

```bash
# .env.example

# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/db"

# 加密密钥（生成：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"）
ENCRYPTION_SECRET="your-32-byte-hex-secret"

# 应用配置
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 可选：错误监控
NEXT_PUBLIC_SENTRY_DSN=""

# 用户数据存储路径
USER_DATA_PATH="./user-data"
```

### 12.2 推荐的VSCode扩展

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### 12.3 Git提交规范

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关

示例：
feat: 添加文生图功能
fix: 修复资源库搜索bug
docs: 更新技术文档
```

---

**文档版本**：v1.0  
**创建日期**：2026-08-11  
**维护人员**：技术团队

### 8.4 中转站支持（Relay Station）

#### 8.4.1 为什么支持中转站？

中转站（API Gateway/Relay）是目前AI服务接入的主流方案：
- **成本优化**：拼车共享、批量购买降低成本
- **稳定性**：多个上游API自动切换
- **统一接口**：OpenAI格式统一所有模型
- **灵活性**：快速切换不同服务商

#### 8.4.2 主流中转站项目

根据调研，主流开源中转站包括：
- [One-API](https://github.com/songquanpeng/one-api) (18k+ stars) - 最流行
- [New-API](https://github.com/Calcium-Ion/new-api) - One-API增强版
- [MIXAPI](https://github.com/aiprodcoder/MIXAPI) - 功能丰富
- [openai-style-api](https://github.com/tian-minghui/openai-style-api) - 多模型统一

**共同特点**：都遵循 **OpenAI兼容格式**

#### 8.4.3 中转站适配器实现

```typescript
// src/lib/ai/adapters/relay.ts
export class RelayStationAdapter implements AIServiceAdapter {
  private config: AIServiceConfig;
  
  constructor(config: AIServiceConfig) {
    this.config = config;
  }
  
  async textToImage(params: TextToImageParams): Promise<string[]> {
    const isSDFormat = this.config.relayType === 'sd';
    
    // 支持两种格式：OpenAI标准格式和Stable Diffusion格式
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
    return data.data.map((item: any) => item.url || item.b64_json);
  }
  
  // OpenAI格式请求
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
  
  // Stable Diffusion格式请求
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

#### 8.4.4 配置界面

```typescript
// src/components/settings/RelayStationConfig.tsx
export function RelayStationConfig() {
  return (
    <div className="space-y-4">
      <div>
        <label>中转站地址</label>
        <input 
          placeholder="https://api.your-relay.com/v1"
          className="w-full"
        />
        <p className="text-sm text-muted-foreground">
          常见格式：https://域名/v1
        </p>
      </div>
      
      <div>
        <label>API Key</label>
        <input 
          type="password"
          placeholder="sk-xxxxxxxxxxxx"
        />
      </div>
      
      <div>
        <label>接口格式</label>
        <select>
          <option value="openai">OpenAI标准格式（推荐）</option>
          <option value="sd">Stable Diffusion格式</option>
        </select>
      </div>
      
      <div>
        <label>模型名称</label>
        <input 
          placeholder="dall-e-3 或 stable-diffusion-xl"
        />
        <p className="text-sm text-muted-foreground">
          根据中转站支持的模型填写，如 dall-e-3, midjourney, stable-diffusion-xl
        </p>
      </div>
      
      <Button onClick={testConnection}>
        测试连接
      </Button>
    </div>
  );
}
```

#### 8.4.5 常见中转站配置示例

**One-API / New-API**
```typescript
{
  provider: 'relay',
  baseURL: 'https://your-domain.com/v1',
  apiKey: 'sk-xxxxx',  // 在中转站后台生成
  model: 'dall-e-3',
  relayType: 'openai'
}
```

**自建Stable Diffusion**
```typescript
{
  provider: 'relay',
  baseURL: 'http://localhost:7860/sdapi/v1',
  apiKey: '',  // 本地可能不需要
  model: 'stable-diffusion-xl',
  relayType: 'sd'
}
```

#### 8.4.6 错误处理

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

---

## 13. 更新后的配置接口

### 13.1 扩展的AIServiceConfig

```typescript
// src/lib/ai/base.ts
export interface AIServiceConfig {
  provider: 'openai' | 'alibaba' | 'relay';  // 新增 'relay'
  apiKey: string;
  baseURL?: string;
  model?: string;
  
  // 中转站特有配置
  relayType?: 'openai' | 'sd';  // openai格式或stable diffusion格式
}
```

### 13.2 数据库Schema更新

```prisma
model Config {
  id            String    @id @default(uuid())
  userId        String
  
  type          String
  provider      String?   // 'alibaba' | 'openai' | 'relay'  <- 添加'relay'
  apiKey        String?
  baseURL       String?
  model         String?
  
  relayType     String?   // 'openai' | 'sd'  <- 新增
  
  preferences   Json?
  isActive      Boolean   @default(true)
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@unique([userId, type, provider])
}
```

---

## 14. 参考资料

### 中转站相关
- [One-API](https://github.com/songquanpeng/one-api) - 最流行的开源中转站
- [New-API](https://github.com/Calcium-Ion/new-api) - One-API增强版
- [MIXAPI](https://github.com/aiprodcoder/MIXAPI) - 功能丰富的中转平台
- [openai-style-api](https://github.com/tian-minghui/openai-style-api) - 多模型统一

### API文档
- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)
- [Stable Diffusion API Guide](https://modelslab.com/blog/stable-diffusion-api/)
- [AUTOMATIC1111 WebUI API](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API)

