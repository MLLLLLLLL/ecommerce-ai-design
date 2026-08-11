# 电商AI设计工作台 - 功能模块划分文档

## 1. 模块总览

```
电商AI设计工作台
├── 1. 用户界面层 (UI Layer)
│   ├── 1.1 布局组件
│   ├── 1.2 导航系统
│   └── 1.3 通用组件
├── 2. 核心功能模块 (Core Features)
│   ├── 2.1 文生图模块
│   ├── 2.2 图生图模块
│   ├── 2.3 无限画布模块
│   ├── 2.4 工作流编排模块
│   └── 2.5 资源库模块
├── 3. 基础设施模块 (Infrastructure)
│   ├── 3.1 AI服务层
│   ├── 3.2 文件存储层
│   ├── 3.3 数据访问层
│   └── 3.4 配置管理层
└── 4. 辅助模块 (Supporting)
    ├── 4.1 项目管理
    ├── 4.2 历史记录
    └── 4.3 系统设置
```

---

## 2. 详细模块设计

### 2.1 文生图模块 (Text-to-Image Module)

**职责**：将文字描述转换为图片

#### 组件结构
```
src/components/text-to-image/
├── TextToImagePage.tsx           # 主页面
├── PromptInput.tsx               # 提示词输入
├── PromptOptimizer.tsx           # 提示词优化建议
├── ParameterPanel.tsx            # 参数配置面板
│   ├── SizeSelector.tsx          # 尺寸选择器
│   ├── StyleSelector.tsx         # 风格选择器
│   └── AdvancedSettings.tsx      # 高级设置
├── GenerationPreview.tsx         # 生成预览区
├── ResultGallery.tsx             # 结果展示
├── TemplateLibrary.tsx           # 提示词模板库
└── BatchGeneration.tsx           # 批量生成
```

#### API接口
```typescript
// src/app/api/ai/text-to-image/route.ts
export async function POST(req: Request) {
  const { prompt, negativePrompt, width, height, samples, ...params } = await req.json();
  
  // 1. 验证参数
  // 2. 获取用户配置的AI服务
  // 3. 调用AI适配器
  // 4. 保存生成的图片
  // 5. 创建Asset记录
  // 6. 返回结果
}
```

#### 状态管理
```typescript
// src/stores/useTextToImageStore.ts
interface TextToImageState {
  prompt: string;
  negativePrompt: string;
  parameters: GenerationParams;
  results: GeneratedImage[];
  isGenerating: boolean;
  history: GenerationHistory[];
}
```

#### 关键功能
- ✅ 提示词输入和优化
- ✅ 电商场景模板（商品主图、场景图等）
- ✅ 实时参数预览
- ✅ 批量生成（多个变体）
- ✅ 生成历史记录
- ✅ 一键保存到资源库

---

### 2.2 图生图模块 (Image-to-Image Module)

**职责**：基于参考图进行AI再创作

#### 组件结构
```
src/components/image-to-image/
├── ImageToImagePage.tsx          # 主页面
├── ImageUploader.tsx             # 图片上传
├── ReferenceImageViewer.tsx      # 参考图查看器
├── StrengthControl.tsx           # 相似度控制
├── MaskEditor.tsx                # 蒙版编辑器
│   ├── BrushTool.tsx             # 画笔工具
│   ├── EraserTool.tsx            # 橡皮擦
│   └── ShapeTool.tsx             # 形状工具
├── BackgroundRemover.tsx         # 背景移除
├── BackgroundReplacer.tsx        # 背景替换
├── StyleTransfer.tsx             # 风格转换
└── InpaintingPanel.tsx           # 局部重绘
```

#### API接口
```typescript
// src/app/api/ai/image-to-image/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const image = formData.get('image') as File;
  const prompt = formData.get('prompt') as string;
  const strength = parseFloat(formData.get('strength') as string);
  
  // 处理图片转换
}

// src/app/api/ai/remove-background/route.ts
export async function POST(req: Request) {
  // 移除背景
}

// src/app/api/ai/upscale/route.ts
export async function POST(req: Request) {
  // 超分辨率
}
```

#### 关键功能
- ✅ 图片上传和预览
- ✅ 相似度滑块控制
- ✅ 蒙版编辑（局部重绘）
- ✅ 一键去背景
- ✅ 背景替换（纯色/渐变/场景）
- ✅ 图片超分辨率
- ✅ 风格迁移

---

### 2.3 无限画布模块 (Infinite Canvas Module)

**职责**：提供自由排版和多素材拼接能力

#### 组件结构
```
src/components/canvas/
├── CanvasPage.tsx                # 主页面
├── CanvasEditor.tsx              # 画布编辑器（核心）
├── Toolbar.tsx                   # 工具栏
│   ├── SelectTool.tsx            # 选择工具
│   ├── DrawTool.tsx              # 绘制工具
│   ├── TextTool.tsx              # 文字工具
│   ├── ShapeTool.tsx             # 形状工具
│   └── ImageTool.tsx             # 图片工具
├── LayerPanel.tsx                # 图层面板
├── PropertyPanel.tsx             # 属性面板
│   ├── TransformProperty.tsx     # 变换属性
│   ├── StyleProperty.tsx         # 样式属性
│   └── FilterProperty.tsx        # 滤镜属性
├── AssetBrowser.tsx              # 资源浏览器（从资源库拖入）
├── ExportDialog.tsx              # 导出对话框
└── TemplateManager.tsx           # 模板管理
```

#### 核心库封装
```typescript
// src/lib/canvas/CanvasManager.ts
export class CanvasManager {
  private canvas: fabric.Canvas;
  private history: HistoryManager;
  
  // 初始化
  constructor(elementId: string, options?: CanvasOptions)
  
  // 对象操作
  addImage(url: string, options?: ImageOptions): void
  addText(text: string, options?: TextOptions): void
  addShape(type: ShapeType, options?: ShapeOptions): void
  
  // 编辑操作
  deleteSelected(): void
  duplicateSelected(): void
  groupSelected(): void
  ungroupSelected(): void
  
  // 对齐工具
  alignLeft(): void
  alignCenter(): void
  alignRight(): void
  distributeHorizontal(): void
  
  // 图层操作
  bringToFront(): void
  sendToBack(): void
  moveUp(): void
  moveDown(): void
  
  // 历史操作
  undo(): void
  redo(): void
  
  // 导出
  exportToPNG(options?: ExportOptions): string
  exportToJSON(): CanvasJSON
  loadFromJSON(json: CanvasJSON): void
}
```

#### 状态管理
```typescript
// src/stores/useCanvasStore.ts
interface CanvasState {
  activeCanvas: string | null;
  canvases: CanvasProject[];
  selectedObjects: fabric.Object[];
  clipboardData: any;
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
}
```

#### 关键功能
- ✅ 无限画布（缩放、平移）
- ✅ 多种工具（选择、绘制、文字、形状）
- ✅ 图层管理
- ✅ 对象编辑（移动、缩放、旋转、裁剪）
- ✅ 对齐和分布
- ✅ 撤销/重做
- ✅ 快捷键支持
- ✅ 导出（PNG/JPG/WebP）
- ✅ 保存为模板

---

### 2.4 工作流编排模块 (Workflow Module)

**职责**：可视化节点编排实现自动化处理

#### 组件结构
```
src/components/workflow/
├── WorkflowPage.tsx              # 主页面
├── WorkflowEditor.tsx            # 工作流编辑器
├── NodePalette.tsx               # 节点面板
│   ├── InputNodes.tsx            # 输入节点
│   ├── AINodes.tsx               # AI处理节点
│   ├── ImageNodes.tsx            # 图片处理节点
│   ├── TextNodes.tsx             # 文字处理节点
│   └── LogicNodes.tsx            # 逻辑控制节点
├── NodeEditor.tsx                # 节点编辑器
├── ConnectionLine.tsx            # 连接线
├── ExecutionPanel.tsx            # 执行控制面板
├── LogViewer.tsx                 # 日志查看器
├── WorkflowTemplates.tsx         # 工作流模板
└── WorkflowExport.tsx            # 导出/分享
```

#### 工作流引擎
```typescript
// src/lib/workflow/engine.ts
export class WorkflowEngine {
  private workflow: Workflow;
  private context: ExecutionContext;
  private eventEmitter: EventEmitter;
  
  constructor(workflow: Workflow)
  
  // 执行控制
  async execute(): Promise<ExecutionResult>
  pause(): void
  resume(): void
  stop(): void
  
  // 状态查询
  getProgress(): number
  getCurrentNode(): WorkflowNode | null
  getLogs(): LogEntry[]
  
  // 事件监听
  on(event: 'start' | 'progress' | 'complete' | 'error', handler: Function): void
}
```

#### 节点定义
```typescript
// src/lib/workflow/nodes/
├── base.ts                       # 基类
├── input/
│   ├── TextInputNode.ts
│   ├── ImageInputNode.ts
│   └── AssetInputNode.ts
├── ai/
│   ├── TextToImageNode.ts
│   ├── ImageToImageNode.ts
│   ├── UpscaleNode.ts
│   ├── RemoveBackgroundNode.ts
│   ├── StyleTransferNode.ts
│   └── SmartCropNode.ts
├── image/
│   ├── AdjustColorNode.ts
│   ├── FilterNode.ts
│   ├── CompositeNode.ts
│   ├── WatermarkNode.ts
│   └── ResizeNode.ts
├── text/
│   ├── TextRenderNode.ts
│   └── TemplateNode.ts
├── logic/
│   ├── ConditionNode.ts
│   ├── LoopNode.ts
│   └── RandomNode.ts
└── output/
    └── SaveNode.ts
```

#### API接口
```typescript
// src/app/api/workflow/execute/route.ts
export async function POST(req: Request) {
  const { workflowId, inputs } = await req.json();
  
  // 1. 加载工作流定义
  // 2. 创建执行引擎
  // 3. 使用SSE推送进度
  // 4. 返回执行结果
}
```

#### 关键功能
- ✅ 拖拽式节点编排
- ✅ 20种预定义节点
- ✅ 节点参数配置
- ✅ 实时执行预览
- ✅ 条件分支和循环
- ✅ 错误处理和重试
- ✅ 执行日志和调试
- ✅ 工作流模板保存
- ✅ 导出/导入工作流

---

### 2.5 资源库模块 (Asset Library Module)

**职责**：统一管理所有素材资源

#### 组件结构
```
src/components/assets/
├── AssetLibraryPage.tsx          # 主页面
├── AssetGrid.tsx                 # 网格视图
├── AssetList.tsx                 # 列表视图
├── AssetCard.tsx                 # 素材卡片
├── AssetPreview.tsx              # 素材预览（大图）
├── AssetDetails.tsx              # 素材详情面板
├── FolderTree.tsx                # 文件夹树
├── SearchBar.tsx                 # 搜索栏
├── FilterPanel.tsx               # 筛选面板
│   ├── DateFilter.tsx            # 日期筛选
│   ├── TypeFilter.tsx            # 类型筛选
│   ├── TagFilter.tsx             # 标签筛选
│   └── SizeFilter.tsx            # 尺寸筛选
├── TagManager.tsx                # 标签管理
├── BulkActions.tsx               # 批量操作
├── UploadDialog.tsx              # 上传对话框
└── StorageIndicator.tsx          # 存储空间指示器
```

#### 数据服务
```typescript
// src/lib/storage/AssetService.ts
export class AssetService {
  // 查询
  async findAssets(query: AssetQuery): Promise<Asset[]>
  async searchAssets(keyword: string, filters?: Filters): Promise<Asset[]>
  async getAssetById(id: string): Promise<Asset>
  
  // 创建
  async createAsset(file: File, metadata: AssetMetadata): Promise<Asset>
  async uploadAsset(data: UploadData): Promise<Asset>
  
  // 更新
  async updateAsset(id: string, updates: Partial<Asset>): Promise<Asset>
  async addTags(assetId: string, tagIds: string[]): Promise<void>
  async removeTags(assetId: string, tagIds: string[]): Promise<void>
  async moveToFolder(assetIds: string[], folderId: string): Promise<void>
  
  // 删除
  async deleteAsset(id: string): Promise<void>
  async bulkDelete(ids: string[]): Promise<void>
  
  // 统计
  async getStorageUsage(userId: string): Promise<StorageStats>
  async getAssetStats(userId: string): Promise<AssetStats>
}
```

#### API接口
```typescript
// src/app/api/assets/
├── route.ts                      # GET: 列表, POST: 上传
├── [id]/route.ts                 # GET: 详情, PATCH: 更新, DELETE: 删除
├── search/route.ts               # POST: 搜索
├── bulk/route.ts                 # POST: 批量操作
└── stats/route.ts                # GET: 统计信息
```

#### 关键功能
- ✅ 网格/列表视图切换
- ✅ 文件夹多级管理
- ✅ 标签系统（创建、分配、筛选）
- ✅ 全文搜索
- ✅ 高级筛选（日期、类型、尺寸、来源）
- ✅ 批量操作（打标签、移动、删除）
- ✅ 素材预览和详情查看
- ✅ 存储空间监控
- ✅ 收藏夹功能
- ✅ 拖拽上传

---

### 2.6 AI服务层 (AI Service Layer)

**职责**：统一管理和调用各种AI服务

#### 适配器实现
```
src/lib/ai/
├── base.ts                       # 接口定义
├── factory.ts                    # 工厂函数
├── adapters/
│   ├── alibaba.ts                # 阿里百炼
│   ├── openai.ts                 # OpenAI
│   └── custom.ts                 # 自定义API
├── queue.ts                      # 请求队列
├── cache.ts                      # 结果缓存
└── retry.ts                      # 重试机制
```

#### 核心接口
```typescript
// src/lib/ai/base.ts
export interface AIServiceAdapter {
  // 基础方法
  testConnection(): Promise<boolean>
  
  // 图片生成
  textToImage(params: TextToImageParams): Promise<GeneratedImage[]>
  imageToImage(params: ImageToImageParams): Promise<GeneratedImage[]>
  
  // 图片处理
  upscale(imageData: string, scale: number): Promise<string>
  removeBackground(imageData: string): Promise<string>
  inpaint(params: InpaintParams): Promise<string>
  
  // 流式响应（如果支持）
  streamTextToImage?(params: TextToImageParams): AsyncGenerator<ProgressEvent>
}
```

#### 请求队列
```typescript
// src/lib/ai/queue.ts
export class AIRequestQueue {
  private concurrent: number = 3;
  private queue: QueueItem[] = [];
  private running: number = 0;
  
  async add<T>(task: () => Promise<T>, priority: number = 0): Promise<T>
  pause(): void
  resume(): void
  clear(): void
}
```

#### 关键功能
- ✅ 统一的接口抽象
- ✅ 多服务支持
- ✅ 请求队列（控制并发）
- ✅ 自动重试
- ✅ 结果缓存
- ✅ 错误处理
- ✅ 超时控制

---

### 2.7 配置管理模块 (Configuration Module)

**职责**：管理用户配置和系统设置

#### 组件结构
```
src/components/settings/
├── SettingsPage.tsx              # 设置主页
├── AIServiceConfig.tsx           # AI服务配置
│   ├── ServiceSelector.tsx       # 服务选择
│   ├── APIKeyInput.tsx           # API Key输入
│   └── ConnectionTest.tsx        # 连接测试
├── PreferencesConfig.tsx         # 偏好设置
│   ├── ThemeSelector.tsx         # 主题选择
│   ├── LanguageSelector.tsx      # 语言选择
│   └── DefaultsConfig.tsx        # 默认值配置
├── StorageConfig.tsx             # 存储设置
└── DataManagement.tsx            # 数据管理
    ├── ExportData.tsx            # 导出数据
    ├── ImportData.tsx            # 导入数据
    └── ClearCache.tsx            # 清空缓存
```

#### 状态管理
```typescript
// src/stores/useConfigStore.ts
interface ConfigState {
  // AI服务配置
  activeProvider: 'alibaba' | 'openai' | 'custom';
  services: AIServiceConfig[];
  
  // 偏好设置
  theme: 'light' | 'dark';
  language: 'zh-CN' | 'en-US';
  defaultImageSize: ImageSize;
  
  // 方法
  updateServiceConfig(config: AIServiceConfig): Promise<void>
  testConnection(provider: string): Promise<boolean>
  setPreference(key: string, value: any): void
}
```

#### 加密存储
```typescript
// src/lib/security/encryption.ts
export function encryptApiKey(apiKey: string): string
export function decryptApiKey(encrypted: string): string
export function validateApiKey(provider: string, apiKey: string): boolean
```

---

### 2.8 项目管理模块 (Project Module)

**职责**：组织和管理相关工作

#### 组件结构
```
src/components/projects/
├── ProjectsPage.tsx              # 项目列表
├── ProjectCard.tsx               # 项目卡片
├── ProjectDetail.tsx             # 项目详情
├── CreateProjectDialog.tsx       # 创建项目
├── ProjectAssets.tsx             # 项目素材
├── ProjectWorkflows.tsx          # 项目工作流
└── ProjectSettings.tsx           # 项目设置
```

#### 关键功能
- ✅ 创建/编辑/删除项目
- ✅ 关联素材、工作流、画布
- ✅ 项目统计
- ✅ 项目归档

---

## 3. 模块间交互

### 3.1 数据流图

```
文生图/图生图模块
    ↓ 生成图片
AI服务层
    ↓ 返回图片数据
文件存储层
    ↓ 保存文件
数据访问层
    ↓ 创建Asset记录
资源库模块 ← 显示新素材
    ↓ 拖拽
画布模块 ← 使用素材
    ↓ 导出
资源库模块 ← 保存导出结果
```

### 3.2 工作流执行流程

```
工作流编排模块
    ↓ 触发执行
工作流引擎
    ↓ 调度节点
    ├→ AI服务层 (AI节点)
    ├→ 文件存储层 (读写文件)
    └→ 图片处理库 (图片处理节点)
    ↓ 收集结果
资源库模块 ← 保存输出
```

---

## 4. 技术依赖矩阵

| 模块 | 依赖的库/服务 |
|------|-------------|
| 文生图 | React Query, Zod, AI适配器 |
| 图生图 | React Query, Zod, AI适配器, sharp |
| 无限画布 | Fabric.js, React, Zustand |
| 工作流 | React Flow, 自定义引擎 |
| 资源库 | Prisma, TanStack Virtual, sharp |
| AI服务层 | Axios/Fetch, 第三方SDK |
| 文件存储 | Node.js fs, sharp |
| 数据访问 | Prisma Client |

---

## 5. 开发优先级

### Phase 1 - MVP（8-10周）
1. **配置管理** (1周)
   - API Key配置界面
   - 加密存储实现
   
2. **AI服务层** (1周)
   - 基础适配器架构
   - 阿里百炼/OpenAI适配器
   
3. **文生图** (2周)
   - 基础UI
   - 参数配置
   - 生成和展示
   
4. **资源库** (2周)
   - 文件存储
   - 列表展示
   - 基础搜索
   
5. **集成测试** (2周)

### Phase 2 - 核心功能（6-8周）
6. **图生图** (2周)
7. **资源库增强** (2周)
   - 标签系统
   - 高级搜索
   - 批量操作
8. **画布基础** (2周)

### Phase 3 - 高级功能（8-10周）
9. **画布完整版** (3周)
10. **工作流引擎** (5周)

---

## 6. 代码组织建议

### 6.1 组件命名规范

```
- Page组件：<Feature>Page.tsx
- 容器组件：<Feature>Container.tsx
- 展示组件：<Feature>View.tsx
- 表单组件：<Feature>Form.tsx
- 对话框：<Feature>Dialog.tsx
- 卡片：<Feature>Card.tsx
```

### 6.2 文件导出规范

```typescript
// 每个目录有index.ts统一导出
// src/components/text-to-image/index.ts
export { TextToImagePage } from './TextToImagePage';
export { PromptInput } from './PromptInput';
export { ParameterPanel } from './ParameterPanel';
// ...

// 使用时
import { TextToImagePage, PromptInput } from '@/components/text-to-image';
```

### 6.3 类型定义组织

```
src/types/
├── asset.ts                      # 资源相关类型
├── workflow.ts                   # 工作流相关类型
├── ai.ts                         # AI服务相关类型
├── canvas.ts                     # 画布相关类型
├── user.ts                       # 用户相关类型
└── common.ts                     # 通用类型
```

---

**文档版本**：v1.0  
**创建日期**：2026-08-11  
**维护人员**：技术团队
