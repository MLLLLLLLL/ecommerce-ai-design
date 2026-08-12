# 商图策AI「文案 · SEO · GEO · 洞察」模块研发实施设计文档 V2

> **文档状态**：待研发评审
> **版本**：V2.0
> **编制日期**：2026-08-12
> **依据**：`商图策AI营销内容模块借鉴改造文档.md`、参考页面及项目现有实现审查结果
> **目标**：将营销内容模块从借鉴方案收敛为可排期、可实现、可测试、可回滚的研发规格。

---

## 1. 背景与目标

本项目已有商品多模态分析、平台合规约束、文案生成、主图提示词、详情页提示词和营销任务留痕能力。本次改造借鉴参考页面的扁平工作台、语言多选、内容优化与结果回看能力，同时保留本项目的品类 SOP、提示词引擎与“事实不编造”机制。

本期目标：

1. 将 `/marketing` 从串行四步向导升级为五 Tab 工作台。
2. 先稳定交付文案创作、语言体系、会话历史和翻译能力。
3. 以统一异步任务协议支撑多输出并发、部分成功、重试和结果回看。
4. 以结构化事实、待补充项和可追溯来源约束 SEO/GEO 输出。
5. 将联网 GEO 和市场洞察建立在明确的数据源能力之上，未接入前不宣称实时搜索。

不在本期范围：生图、视频生成、素材拖拽、更新公告，以及未经搜索服务接入的“实时洞察”。

---

## 2. 范围与分期

| 阶段 | 交付范围 | 前置条件 | 完成定义 |
| --- | --- | --- | --- |
| A0 | 数据模型、任务协议、工作台壳、文案同步版 | Prisma migration 评审通过 | 可切换五 Tab，文案任务可创建、查询、回看 |
| A1 | 文案多输出并发、会话历史、30 语言选择器、翻译 | A0 任务协议上线 | 子任务独立展示，允许部分成功 |
| B1 | SEO、文案润色、作品收藏与营销作品库 | A1 稳定运行 | SEO 返回结构化结果与待补充事实 |
| B2 | GEO 离线版 | B1 完成 | 明示“未联网核实”，不输出伪造引用 |
| C1 | GEO 联网核实、市场洞察 | 搜索服务 ADR 已批准 | 每条外部结论具备来源、时间和失败降级信息 |
| C2 | 营销结果入素材库、拖拽复用 | C1 或业务另行确认 | 营销作品与文件素材关系可追溯 |

“向导模式”不进入 A0-A1。若后续确认保留，需作为独立需求，补齐入口、默认策略、偏好存储和回归用例，不能隐含在工作台改造中。

---

## 3. 产品与交互规格

### 3.1 工作台

路由为 `/marketing`，采用“左侧输入、右侧结果”桌面布局；窄屏改为上下排列。Tab 包含：文案创作、SEO 优化、GEO 优化、多语言翻译、市场洞察。

每个 Tab 独立维护草稿状态。切换 Tab 不清空表单；刷新页面后只恢复未提交草稿，不恢复敏感模型配置。结果区固定三种视图：

| 视图 | 数据来源 | 行为 |
| --- | --- | --- |
| 本轮作品 | 当前 `taskId` 的任务详情 | 实时显示子任务状态与结果 |
| 当前窗口历史 | `sessionStorage` 保存的 taskId 列表 | 仅记录当前浏览器标签会话，最多 50 条 |
| 全部作品 | 服务端 MarketingTask 列表 API | 支持类型、状态、收藏、关键词、时间筛选 |

生成按钮的可用性由对应 Tab 的前置条件决定，禁用时显示第一条缺失条件：

| Tab | 最低前置条件 |
| --- | --- |
| 文案创作 | 商品名称、至少一个输出项、内容模型；图片为可选，但缺图时展示“仅基于文字生成”提示 |
| SEO | 场景、名称、内容模型；至少提供“已确认事实”或“现有内容”之一 |
| GEO | 场景、名称、内容模型；至少提供事实、现有内容或用户问题之一 |
| 翻译 | 非空原文，长度不超过 2,000 个 Unicode 字符，至少一种目标语言 |
| 洞察 | 品类/关键词、地区、查询类型、已启用的搜索数据源 |

### 3.2 文案创作

输出项拆分为 `analysis`、`corePoints`、`title`、`description`、`seoKeywords`、`mainPrompts`、`detailPrompts`。为兼容既有引擎，服务端可将前三项聚合调用现有 `CopywritingEngine`，但前端必须按选择项显示结果，不得把未勾选内容默认为已生成。

图片不再作为文案创作的硬性校验；上传图片时调用视觉分析，无图片时用用户填写的商品名、卖点和事实生成，并将无法确认的信息写入 `pendingFacts`。

### 3.3 语言选择

新增 `LanguageOption` 和分组常量，第一期固定支持 30 种语言。`Language` 类型改为 `string` 品牌类型或从 `LANGUAGE_OPTIONS` 派生，禁止将语言列表散落在组件中。

平台切换仅在用户未手动改写语言时自动写入 `getPlatformLanguage(platform)` 的默认值；一旦用户在本 Tab 手动选择语言，则设置 `languageOverridden=true`，后续切换平台不得覆盖。

文案创作、SEO 和 GEO 为单语言；翻译为多语言。语言选择器必须支持搜索、分组、已选计数、键盘操作和清空。

---

## 4. 核心数据模型

### 4.1 领域模型

新增或调整以下实体，`MarketingTask` 是营销任务与结果的唯一主记录；`Asset` 继续只表示有物理文件的素材。

```text
MarketingTask 1 --- n MarketingTaskItem
MarketingTask 1 --- n MarketingFact
MarketingTask 1 --- n MarketingSource
MarketingTask 1 --- n MarketingTaskEvent
MarketingTask 0..n --- n Asset (通过 MarketingAssetLink)
```

| 实体 | 核心字段 | 说明 |
| --- | --- | --- |
| MarketingTask | `id`、`userId`、`module`、`input`、`status`、`isFavorite`、`createdAt` | 任务主记录；`module` 为 copywriting/seo/geo/translate/insight |
| MarketingTaskItem | `id`、`taskId`、`type`、`status`、`input`、`result`、`error`、`attempt` | 可独立调度的输出单元 |
| MarketingFact | `taskId`、`key`、`value`、`status`、`sourceType` | `status` 为 confirmed/pending/verified/rejected |
| MarketingSource | `taskId`、`url`、`title`、`publisher`、`retrievedAt`、`snippet` | 只用于联网结果；无来源不得标记已核实 |
| MarketingTaskEvent | `taskId`、`itemId`、`type`、`payload`、`createdAt` | 用于轮询增量、审计与调试 |
| MarketingAssetLink | `taskId`、`assetId`、`role` | 关联已导出的 JSON、上传图片或后续生成文件 |

状态枚举：

```text
Task: draft -> queued -> running -> completed | partial_failed | failed | cancelled
Item: pending -> queued -> running -> completed | failed | skipped | cancelled
```

状态约束：只有所有非 skipped Item 完成时 Task 才可为 `completed`；至少一项完成且至少一项失败时为 `partial_failed`；任务取消不得覆盖已完成 Item 的结果。

### 4.2 与 Asset 的边界

不得将纯文本营销结果“摘录”伪装成图片/视频素材。需要归档时，由 `POST /api/marketing/tasks/:id/export` 生成 JSON 或 Markdown 文件并创建 `Asset`，再通过 `MarketingAssetLink` 关联。这样既复用现有资源库字段（`filepath`、`filesize`、`format`），也保留 `MarketingTask` 的结构化查询能力。

### 4.3 迁移策略

1. 新增表和枚举，不删除现有 `MarketingTask.analysis/copywriting/mainPrompts/detailPrompts` 字段。
2. 以迁移脚本将存量任务映射为 `module=copywriting` 的已完成任务项；无法拆分的结果保留在旧 JSON 字段。
3. 新接口只写新表和兼容快照；旧 `GET /api/marketing/generate?taskId=` 继续读取兼容快照，直到旧前端下线。
4. 迁移前备份数据库；迁移脚本与回滚 SQL 必须随 Prisma migration 一并提交。

---

## 5. 异步任务与并发协议

### 5.1 创建与执行

`POST /api/marketing/tasks` 只负责校验、创建主任务与 Item，并返回 `202 Accepted`。不得在请求生命周期内等待所有模型调用完成。Worker 从数据库领取 queued Item，并按“用户 + 模型配置”维度执行限流。

并发规则：

1. 单个任务最大同时执行 3 个 Item。
2. 单一用户、单一模型配置默认最大并发 3；具体值由模型配置扩展字段 `maxConcurrent` 控制。
3. 仅在分析完成后，依赖分析的 Item 才能入队；翻译可直接入队。
4. `Promise.allSettled` 仅可用于等待已开始的 Item，不作为跨请求后台任务机制。
5. `HighConcurrencyQueue` 只能作为进程内执行器；生产部署若存在多实例，需用数据库租约或外部队列保证不重复领取。

### 5.2 进度回传

首期采用“创建后轮询 + 事件游标”，避免先引入常连接复杂度：

```text
POST /api/marketing/tasks                         -> 202 { taskId, status: "queued" }
GET  /api/marketing/tasks/{taskId}                -> 200 { task, items }
GET  /api/marketing/tasks/{taskId}/events?after=  -> 200 { events, nextCursor }
POST /api/marketing/tasks/{taskId}/retry          -> 202
POST /api/marketing/tasks/{taskId}/cancel         -> 202
```

前端在任务处于 `queued/running` 时每 1.5 秒请求事件；连续错误采用指数退避，最长 10 秒。事件包含 `item.queued`、`item.running`、`item.completed`、`item.failed`、`task.completed`、`task.partial_failed`。后续确有实时性需求时，可在不改变事件结构的前提下增加 SSE。

### 5.3 失败、重试与幂等

创建请求需携带 `Idempotency-Key`，服务端以 `userId + key` 唯一约束保存 24 小时，避免用户双击生成造成重复扣费。Item 最多自动重试 2 次，仅重试明确可恢复的网络超时与 429/5xx；模型 JSON 解析失败最多修复一次。手动重试仅允许 failed Item，保留原 Item 的失败记录并新建 attempt。

取消为协作式：未开始 Item 标记 cancelled；运行中模型请求无法中断时可结束当前调用，但不得继续派发下游 Item。

---

## 6. API 契约

所有请求以 Zod 校验，所有响应统一为：

```typescript
type ApiSuccess<T> = { success: true; data: T; requestId: string };
type ApiFailure = {
  success: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};
```

| API | 请求重点 | 成功响应重点 | 错误 |
| --- | --- | --- | --- |
| `POST /api/marketing/tasks` | `module`、`input`、`modelSelection`、`idempotencyKey` | `taskId`、`status`、`itemIds` | 400 输入错误，409 幂等冲突，422 模型不支持 |
| `GET /api/marketing/tasks` | `module/status/favorite/query/cursor` | 分页任务摘要 | 400 非法筛选 |
| `GET /api/marketing/tasks/:id` | 无 | 主任务、Item、事实、来源、事件摘要 | 404 无归属任务 |
| `POST /api/marketing/tasks/:id/retry` | `itemIds?` | 新 attempt 信息 | 409 状态不允许重试 |
| `POST /api/marketing/tasks/:id/cancel` | 无 | 最新状态 | 409 已终态 |
| `POST /api/marketing/tasks/:id/favorite` | `isFavorite` | 收藏状态 | 404 无归属任务 |
| `POST /api/marketing/tasks/:id/export` | `format=json|markdown` | `assetId`、下载地址 | 422 无可导出结果 |

输入限制：名称最多 300 字符；图片最多 12 张；卖点最多 20 条；关键词最多 30 条；翻译原文最多 2,000 字符；每次翻译目标语言最多 10 个；单个事实键和值各最多 500 字符；URL 仅接受 `https`。

`contentModelId` 与 `visionModelId` 必须属于当前用户，且服务端按用途解析能力，不能信任前端传入的 provider、API Key 或能力标签。

---

## 7. SEO、GEO 与搜索能力

### 7.1 事实模型与不编造规则

所有 SEO/GEO 任务输入和输出使用统一事实结构：

```typescript
type FactStatus = 'confirmed' | 'pending' | 'verified' | 'rejected';
type MarketingFact = {
  key: string;
  value: string;
  status: FactStatus;
  sourceType: 'user' | 'image_analysis' | 'web';
  sourceId?: string;
};
```

规则：用户输入为 `confirmed`；图片模型识别仅为 `pending`，除非用户确认；联网查询结论仅在保留可访问来源、抓取时间和摘要后标记 `verified`。无证据的参数、认证、排名、搜索量、销量和竞争结论必须进入 `pendingFacts`，不得写入可发布正文。

### 7.2 SEO

SEO 结果固定包含：关键词意图、页面标题、标题结构、正文、FAQ、Alt 建议、内链建议、JSON-LD 建议、`pendingFacts`。`structuredData` 必须以对象而非 JSON 字符串在 API 内传输，前端导出时再序列化，以便 Zod 校验 `@context` 和 `@type`。

### 7.3 GEO

先实现 GEO 离线版：结果顶部强制标记“基于用户资料生成，未执行公开信息核实”。离线版不得输出“引用来源”或“已核实事实”。

联网 GEO 及市场洞察必须先完成搜索服务 ADR，至少明确：

1. 供应商、可访问的地区与站点范围、请求限额和计费责任。
2. 搜索查询构造、允许抓取的内容类型、来源去重和缓存 TTL。
3. 来源展示格式、可访问性校验、抓取时间、无法取证时的降级文案。
4. 敏感行业与隐私信息过滤策略。
5. 日志脱敏、用户输入是否发送给第三方以及保留期限。

在 ADR 未批准或模型配置不具备 `webSearch=true` 前，市场洞察 Tab 显示“联网洞察暂未配置”，不可提交；不得降级为模型记忆后仍标记“实时数据”。

模型能力扩展如下：

```typescript
interface ModelCapabilities {
  vision: boolean;
  jsonMode: boolean;
  ocr: boolean;
  imageGeneration: boolean;
  webSearch: boolean;
}
```

`traitTags` 是展示元数据，不参与能力判定；建议存储在 `ModelConfig.displayMetadata` JSON 字段中，避免把“推荐默认”误当作服务能力。

---

## 8. 文件改动建议

| 位置 | 动作 | 说明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 增加营销任务项、事实、来源、事件、关联与收藏字段 |
| `prisma/migrations/*` | 新建 | 数据迁移、回滚 SQL 与存量兼容说明 |
| `src/types/marketing.ts` | 重构 | 统一 Tab 输入、任务项、事实、结果和语言类型 |
| `src/types/model-config.ts` | 修改 | 增加 `webSearch` 与展示元数据类型 |
| `src/lib/marketing/` | 新建/修改 | 任务编排、SEO、GEO、翻译、事实校验引擎 |
| `src/lib/queue/` | 修改 | 增加可持久化的任务领取与每模型限流，不仅依赖内存队列 |
| `src/app/api/marketing/tasks/` | 新建 | 任务创建、查询、事件、重试、取消、收藏、导出 API |
| `src/components/marketing/MarketingWorkspace.tsx` | 重构 | Tab 容器、草稿与任务选择 |
| `src/components/marketing/tabs/` | 新建 | 五个 Tab 的独立输入组件 |
| `src/components/marketing/ResultPanel.tsx` | 新建 | 本轮、会话历史、全部作品及部分失败展示 |
| `src/components/marketing/LanguagePicker.tsx` | 新建 | 分组多选语言选择器 |
| `src/app/(dashboard)/assets/page.tsx` | 后置修改 | 仅在 C2 处理营销导出文件的展示与筛选 |

旧的 `/api/marketing/generate` 在 A1 完成前保留兼容。新前端只使用 `/api/marketing/tasks`，避免双写两套执行逻辑。

---

## 9. 测试与验收

### 9.1 自动化测试

| 类别 | 必测内容 |
| --- | --- |
| 单元测试 | 语言默认值不覆盖手动选择、事实状态转换、任务状态聚合、JSON-LD 校验、翻译字符限制 |
| API 测试 | 归属鉴权、Zod 字段错误、幂等创建、取消、重试、游标事件、模型能力拒绝 |
| 集成测试 | 视觉分析完成后才派发依赖 Item；三个并发 Item 部分失败时任务为 `partial_failed` |
| UI 测试 | 五 Tab 草稿隔离、禁用生成提示、结果逐项出现、会话历史刷新行为、空/加载/失败状态 |
| 回归测试 | 旧任务详情、旧 `/api/marketing/generate`、资产库 JSON 导入与下载 |

### 9.2 验收标准

1. 五个 Tab 均可独立输入，切换后表单内容不丢失，刷新后只恢复草稿而不恢复模型密钥相关信息。
2. 文案任务勾选三个输出项时，最多三个子项并发执行；任一项成功即可即时出现在结果区；一项失败不遮蔽其余成功结果。
3. 任务详情在创建后 2 秒内可查询到 `queued/running`，事件序列无重复、无倒退；取消后不再创建新 Item。
4. 30 种语言可搜索、分组、多选；平台自动语言不会覆盖用户手动选择；翻译保留段落、列表和换行。
5. SEO/GEO 缺失事实必须展示 `pendingFacts`；离线 GEO 必须明示未联网；联网结论必须展示来源 URL 和抓取时间。
6. 市场洞察在没有 `webSearch` 能力时不可提交，页面不能出现“实时”“最新网络数据”等误导性文案。
7. 全部作品列表只返回当前用户数据，收藏和筛选可组合；导出后生成的 Asset 与原 MarketingTask 可双向追溯。
8. 新增数据库迁移可在空库和含旧营销任务的库上执行，提供验证步骤与回滚 SQL。

---

## 10. 风险、决策与排期

| 风险/决策 | 结论 | 责任与截止条件 |
| --- | --- | --- |
| 联网搜索供应商 | 未决，阻塞 C1 | 产品与后端完成 ADR 后进入排期 |
| 多实例任务执行 | 不能仅依赖内存队列 | 后端在 A0 选择数据库租约或外部队列 |
| 模型 RPM 与成本 | 每模型限流、可观测 | 后端记录调用次数、时长、错误码；产品确认预算 |
| 旧接口兼容 | 暂保留，不新增功能 | A1 后统计无调用再制定下线计划 |
| 文案进入素材库 | 通过导出文件建立关联 | C2 再扩展资源库 UI，不改 Asset 的文件语义 |

建议排期：A0 为 3-4 个研发日，A1 为 5-7 个研发日，B1 为 5-7 个研发日，B2 为 3-4 个研发日。C1/C2 取决于搜索供应商、队列基础设施及合规评审，不承诺固定工期。

---

## 11. 研发评审清单

- [ ] 确认 `MarketingTask` 新旧字段的兼容期限和数据迁移策略。
- [ ] 确认后台任务运行位置、实例数与数据库/队列领取策略。
- [ ] 确认模型配置的 `webSearch` 能力来源与搜索服务 ADR。
- [ ] 确认营销作品与文件素材的边界，批准 `MarketingAssetLink` 方案。
- [ ] 确认翻译、SEO、GEO 的模型费用预算与用户可见配额。
- [ ] 确认 A0-A1 的验收用例和发布回滚方案。

在以上六项确认前，只允许启动不依赖未决项的 UI 原型和类型整理，不进入联网 GEO、市场洞察或生产异步执行开发。
