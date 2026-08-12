# 商图策AI「文案 · SEO · GEO · 洞察」模块研发实施设计文档 V3

> **文档状态**：待研发评审
> **版本**：V3.0
> **编制日期**：2026-08-12
> **上游文档**：`商图策AI营销内容模块借鉴改造文档.md`、`商图策AI营销内容模块研发实施设计文档V2.md`
> **版本目标**：结合本地项目的真实架构、代码能力和质量基线，形成可渐进实施、可分段验收、可回退的研发方案。

---

## 1. 版本结论

本版本保留 V2 的五 Tab 工作台、结构化事实、防编造、作品回看和联网能力门禁等方向，但调整实施顺序：第一阶段不直接引入独立 Worker、事件表、任务租约和完整异步基础设施，而是先完成一条基于现有 Next.js 单体架构的同步纵向闭环。

总体策略：

1. 先统一模型调用、图片存储、输入校验和测试基线。
2. 再交付“产品分析串行，三类内容并发”的文案工作台。
3. 随后增加语言、翻译、SEO、作品管理和 GEO 离线版。
4. 只有出现明确的长任务、离页执行或多实例部署需求时，才升级为独立 Worker。
5. 联网 GEO 和市场洞察必须等待搜索服务 ADR、成本与合规评审通过。

---

## 2. 本地项目基线

### 2.1 当前架构

| 层级 | 当前实现 | 对本次设计的影响 |
| --- | --- | --- |
| Web 框架 | Next.js 16.3 App Router、React 19 | 新 API 使用 Route Handler；编码前须查阅本地 Next.js 文档 |
| 数据库 | PostgreSQL 15、Prisma 5.22 | 可增量扩展 `MarketingTask`，迁移需兼容现有三条 migration |
| 身份 | `getCurrentUser()` 固定解析本地用户 | 第一阶段继续按 userId 隔离，但不宣称已具备正式登录体系 |
| 营销执行 | 单个 Route Handler 内同步执行 | 第一阶段适合纵向闭环，不适合请求返回后继续后台运行 |
| 并发 | `HighConcurrencyQueue` 基于进程内 `p-queue` | 可用于单进程限流；不能作为多实例可靠队列 |
| 模型接口 | OpenAI `/chat/completions` 兼容协议 | 第一阶段明确只支持该类文本/视觉模型接口 |
| 模型配置 | 能力由用户勾选或名称推断 | 必须增加 JSON/视觉能力实测，不能仅信任声明 |
| 图片输入 | 浏览器转 Base64，前端最多 5 张 | 应先文件化，避免长期把大 Base64 写入任务表 |
| 资源库 | `Asset` 表表示有物理文件的资源 | 文案任务以 `MarketingTask` 为主数据，导出后才创建 Asset |
| 测试 | 存在零散 Jest 风格文件，但无 `test` 脚本 | 开发前补齐 Vitest 和 Playwright 基线 |

### 2.2 当前质量基线

截至本文编制时：

| 检查项 | 状态 | 处理原则 |
| --- | --- | --- |
| `npx tsc --noEmit` | 通过 | 所有阶段必须继续通过 |
| `npm run build` | 通过，存在文件路径追踪警告 | 所有阶段必须通过；警告不得新增 |
| `npx prisma validate` | 通过 | 涉及数据库阶段必须通过 |
| `npx prisma migrate status` | 数据库最新 | 新迁移必须在空库和存量库验证 |
| `npm run lint` | 存量 111 错误、18 警告 | 修改文件零错误；全项目问题数不得增加 |
| 自动化测试脚本 | 缺失 | Phase 0 建立后方可进入核心业务改造 |

全项目 lint 清零不是本需求的前置范围，但任何本次新增或修改文件不得新增 lint 错误。

---

## 3. 产品范围

### 3.1 目标能力

最终工作台包含五个 Tab：

| Tab | 首次交付阶段 | 联网要求 |
| --- | --- | --- |
| 文案创作 | Phase 2 | 无 |
| 多语言翻译 | Phase 3 | 无 |
| SEO 优化 | Phase 4 | 无；不得伪造搜索量或排名 |
| GEO 优化 | Phase 5 离线版；Phase 7 联网版 | 联网版需要搜索服务 |
| 市场洞察 | Phase 7 | 强制需要搜索服务 |

主界面为桌面左右分栏、移动端上下排列：左侧当前 Tab 输入，右侧展示本轮结果、当前窗口历史和全部作品。

### 3.2 明确不做

第一轮不做：独立 Worker、SSE、跨实例任务领取、离页后台执行、素材拖拽、市场洞察离线伪实时版、正式账号登录系统，以及对旧营销任务的复杂拆表迁移。

### 3.3 向导模式

旧四步向导在新工作台上线前保留。新前端稳定后由产品决定是否删除，不在新工作台中增加“双模式开关”，避免维护两套表单状态和生成流程。

---

## 4. 产品与交互规格

### 4.1 Tab 状态

每个 Tab 使用独立表单状态。切换 Tab 不清空内容；`sessionStorage` 仅保存非敏感草稿和本窗口 taskId，最多 50 条。模型 ID 可保存，API Key 永不进入页面状态、浏览器存储、日志和任务输入。

### 4.2 文案创作输入

第一版字段：目标平台、输出语言、商品名称、商品图片、核心卖点、目标关键词、品类、视觉模型、内容模型、输出类型。

第一版商品图片仍为必填，数量统一为 1-5 张、单张不超过 10MB，仅接受 JPEG、PNG、WebP。后续只有在引入独立 `ProductContext` 文本上下文模型后，才允许无图片生成文案。

第一版输出任务粒度保持：

```text
analysis
copywriting
mainPrompts
detailPrompts
```

`copywriting` 结果内部包含标题、核心卖点、商品描述和 SEO 关键词。前端可以按用户勾选项过滤展示，但不能把这四项拆成四次重复模型调用。

### 4.3 生成与结果

执行顺序：

```text
校验输入和模型能力
        ↓
产品分析 analysis（串行）
        ↓
copywriting ─┐
mainPrompts ─┼─ Promise.allSettled，并发上限 3
detailPrompts┘
        ↓
保存完整结果和每步骤状态
        ↓
返回 completed / partial_failed / failed
```

首期请求完成后一次返回结果，不承诺流式逐项出现。部分任务失败时，保留并展示成功内容、失败模块及可重试提示。

### 4.4 语言

语言配置集中在 `src/lib/marketing/languages.ts`，第一期固定 30 种。平台默认语言通过现有 `getPlatformLanguage(platform)` 获取。

联动规则：

1. 用户未手动选择语言时，平台变化自动更新默认语言。
2. 用户手动选择后设置 `languageOverridden=true`，继续切平台不覆盖。
3. 文案、SEO、GEO 为单语言；翻译为多语言。
4. 翻译一次最多 10 种目标语言，最大同时请求 3 种。

### 4.5 结果三级视图

| 视图 | 第一版来源 | 说明 |
| --- | --- | --- |
| 本轮作品 | 当前请求返回结果 | 显示成功、部分失败、复制、导出 |
| 当前窗口历史 | `sessionStorage` 中的 taskId | 通过任务详情 API 回查，不保存完整结果 |
| 全部作品 | MarketingTask 列表 API | 支持类型、状态、收藏、关键词和时间筛选 |

---

## 5. 模型调用基础设施

### 5.1 统一客户端

从 `MultimodalAdapter` 中抽取内部 `TextCompletionClient`，统一处理：

- `/chat/completions` URL 拼接；
- Authorization 与请求头；
- `response_format` 不支持时的兼容重试；
- 上游错误解析；
- 超时与 `AbortSignal`；
- JSON 文本提取与解析；
- 日志脱敏和 requestId；
- 可重试错误分类。

第一阶段明确支持 OpenAI Chat Completions 兼容接口，不承诺原生 Anthropic、Gemini 或搜索工具调用协议。后续需要时通过独立 Adapter 接入，不能继续在营销引擎内添加域名特判。

### 5.2 模型能力

第一版模型能力：

```typescript
interface ModelCapabilities {
  vision: boolean;
  jsonMode: boolean;
  ocr: boolean;
  imageGeneration: boolean;
}
```

`webSearch` 在 Phase 7 才加入。展示标签与能力判定分离，标签不得作为路由依据。

模型测试增加三种模式：

| 测试 | 输入 | 通过标准 |
| --- | --- | --- |
| connection | 简短文本 | 上游 2xx 且存在文本响应 |
| jsonMode | 要求固定 JSON | 可解析并通过 Zod Schema |
| vision | 一张内置小测试图 | 返回可验证的图片内容描述 |

模型配置保存 `lastTestedAt`、`testStatus`、`testedCapabilities` 和脱敏错误摘要。营销生成前使用已保存测试结果做预检；测试过期或模型配置变更后提示重新测试。

### 5.3 重试和限流

仅对网络超时、429 和明确的 5xx 自动重试，最多 2 次，采用指数退避。输入错误、权限错误、模型不存在、JSON Schema 不匹配不得盲目重试。

进程内并发按“用户 + contentModelId”限制为 3。此策略只适用于当前单实例部署；一旦部署为多实例，必须进入 Phase 6 的持久化队列改造。

---

## 6. 图片与素材边界

### 6.1 上传流程

浏览器选择图片后先上传至服务端文件存储，再把 `/api/files/...` URL 写入营销输入。不得把图片 Base64 长期写入 `MarketingTask.productImages`。

上传验收：文件头与 MIME 类型双校验，单张 10MB，最多 5 张，随机文件名，路径必须限制在 `USER_DATA_PATH` 下。删除营销任务默认不删除用户原始图片；素材生命周期另行管理。

### 6.2 MarketingTask 与 Asset

`MarketingTask` 是营销作品的唯一主记录。`Asset` 继续表示有 `filepath/filesize/format` 的实体文件。

用户导出任务时生成 JSON 或 Markdown 文件并创建 Asset，Asset 的 `parameters` 至少保存 `marketingTaskId`。第一版是一对多关系，不新增多对多关联表：一个任务可导出多个文件，每个导出文件只属于一个任务。

素材库筛选可依据 `source=marketing-assistant` 展示导出文件；营销任务本身仍通过“全部作品”查询。

---

## 7. 第一版数据模型

### 7.1 MarketingTask 增量字段

优先增量扩展现有表，不在第一轮引入 Item、Event、Fact、Source 五张表。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `module` | String，默认 copywriting | copywriting/translate/seo/geo/insight |
| `input` | Json? | 各 Tab 的版本化输入快照，不含密钥 |
| `result` | Json? | 各模块统一结果快照 |
| `selectedOutputs` | String[] | 用户实际选择的输出项 |
| `isFavorite` | Boolean，默认 false | 全部作品收藏筛选 |
| `schemaVersion` | Int，默认 1 | 输入、结果结构升级兼容 |

保留现有 `analysis`、`copywriting`、`mainPrompts`、`detailPrompts` 和 `executionSteps`，旧接口继续使用。新接口写 `result` 的同时更新兼容字段，直到旧前端下线。

### 7.2 状态

第一版任务状态：

```text
draft -> analyzing -> generating -> completed
                              ├-> partial_failed
                              └-> failed
```

`executionSteps` 保存四个既有步骤的 `pending/running/completed/failed/skipped`。并发更新必须由一个聚合器在内存完成后一次写回，避免多个 Promise 对同一 JSON 字段发生丢失更新。

### 7.3 后续升级触发条件

满足任一条件时进入 Phase 6：

- 单次任务 P95 超过反向代理或平台请求时限的 70%；
- 用户需要关闭页面后继续执行；
- 需要取消运行中任务或只重试单个输出；
- 部署为两个及以上应用实例；
- 单任务输出数或翻译语言数持续超过当前并发设计。

升级后再引入 `MarketingTaskItem`、事件游标、幂等键、租约字段和独立 Worker。

---

## 8. API 设计

### 8.1 第一版接口

| API | 作用 | 返回 |
| --- | --- | --- |
| `POST /api/marketing/generate` | 兼容旧向导 | 保持现有结构，不再新增能力 |
| `POST /api/marketing/tasks` | 新工作台同步生成 | 200，完整或部分成功任务 |
| `GET /api/marketing/tasks` | 全部作品列表 | 游标分页任务摘要 |
| `GET /api/marketing/tasks/:id` | 任务详情 | 输入摘要、步骤、结果、错误 |
| `PATCH /api/marketing/tasks/:id` | 收藏状态 | 最新收藏状态 |
| `POST /api/marketing/tasks/:id/export` | 导出 JSON/Markdown | Asset 和下载地址 |
| `POST /api/marketing/upload` | 营销图片文件化 | 文件 URL、大小、MIME |

第一版不提供 cancel、事件轮询和单 Item retry。部分失败后，前端允许用户使用相同输入重新生成失败类型，并创建新任务；不得原地覆盖旧任务的审计结果。

### 8.2 响应规范

```typescript
type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
  requestId: string;
};
```

主要错误码：`VALIDATION_ERROR`、`MODEL_NOT_FOUND`、`MODEL_CAPABILITY_MISSING`、`MODEL_TEST_REQUIRED`、`UPLOAD_INVALID`、`UPSTREAM_RATE_LIMITED`、`UPSTREAM_FAILED`、`OUTPUT_INVALID`、`TASK_NOT_FOUND`、`EXPORT_FAILED`。

所有任务、模型和导出查询必须包含当前 `userId` 条件。即使当前为固定本地用户，也不得绕过归属过滤。

---

## 9. SEO、GEO 与洞察

### 9.1 事实规则

第一版事实结构保存在输入和结果 JSON 中，不单独建表：

```typescript
type MarketingFact = {
  key: string;
  value: string;
  status: 'confirmed' | 'pending' | 'verified' | 'rejected';
  sourceType: 'user' | 'image_analysis' | 'web';
  sourceUrl?: string;
  retrievedAt?: string;
};
```

用户明确填写的内容为 confirmed；视觉识别结果默认 pending；只有联网来源存在且可追溯时才可为 verified。认证、销量、搜索量、排名和业务承诺没有证据时必须进入 `pendingFacts`，不得进入可发布正文。

### 9.2 SEO

SEO 输出包含关键词意图、页面标题、标题结构、正文、FAQ、Alt、内链建议、JSON-LD 对象和 `pendingFacts`。JSON-LD 在 API 中保持对象结构并通过 Zod 校验，导出时才序列化。

SEO 第一版不查询实时搜索量、排名和竞品数据，界面必须明确其输出为内容优化建议。

### 9.3 GEO 离线版

GEO 离线版只基于用户事实和已有内容生成，结果顶部固定显示“本结果未联网核实”。不得生成来源列表、引用编号、“已核实”标识或实时性文案。

### 9.4 联网能力门禁

联网 GEO 和市场洞察开始前必须形成搜索服务 ADR，明确供应商、查询限额、成本归属、缓存 TTL、来源去重、页面抓取、引用展示、隐私、敏感行业和失败降级。

没有已启用且实测通过的 `webSearch` 能力时，市场洞察 Tab 只能展示未配置状态，生成按钮不可用。不得用模型训练记忆替代实时搜索后仍标记“最新数据”。

---

## 10. 分阶段开发流程

### Phase 0：工程门禁与设计冻结

交付：

1. 引入 Vitest、测试脚本和最小单元测试配置。
2. 引入 Playwright 和营销页面冒烟测试。
3. 建立模型调用 Mock，支持成功、超时、429、5xx、无效 JSON。
4. 冻结第一版 MarketingTask 字段、状态和 API 契约。
5. 确认第一版单实例部署假设和最大请求时长。

退出条件：测试命令可执行；TypeScript、build、Prisma 均通过；新增测试至少验证一个 API Schema 和一个任务状态聚合函数。

### Phase 1：模型与图片基础能力

交付：

1. 抽取 `TextCompletionClient`。
2. 增加请求超时、错误分类和 JSON Schema 校验。
3. 增加 connection/jsonMode/vision 三类模型实测。
4. 新增营销图片上传接口，将 Base64 输入改为文件 URL。
5. 统一图片限制为 1-5 张、单张 10MB。

退出条件：三个模型实测场景可重复运行；错误模型在生成前被拦截；数据库不再新增大 Base64 图片记录。

### Phase 2：文案工作台纵向闭环

交付：

1. 五 Tab 工作台外壳，只有文案 Tab 可提交，其余显示阶段状态。
2. 文案输入、模型选择、输出选择和左右结果布局。
3. 分析串行，文案/主图/详情页并发执行。
4. `completed/partial_failed/failed` 状态聚合。
5. 本轮结果、窗口历史、任务详情与旧接口兼容。

退出条件：正常、部分失败、全部失败三条链路均可验收；旧向导仍可用；成功结果不因其他输出失败而丢失。

### Phase 3：语言与翻译

交付：30 种集中语言配置、分组搜索选择器、平台默认语言保护、多语言翻译、复制与导出。

退出条件：三语言并发成功；最多 10 种校验生效；段落、列表、换行结构保留；一种语言失败时其余结果仍展示。

### Phase 4：SEO 与全部作品

交付：SEO 场景表单、结构化 SEO 结果、`pendingFacts`、收藏、搜索、筛选、JSON/Markdown 导出和 Asset 关联。

退出条件：未确认事实不会进入发布正文；JSON-LD 可通过 Schema；导出文件可下载且能追溯原任务。

### Phase 5：GEO 离线版

交付：GEO 场景、用户问题、事实输入、离线结果和强制未联网声明。

退出条件：无伪造来源、无“已核实”标识、无实时性文案；缺失事实进入 `pendingFacts`。

### Phase 6：持久化异步任务（按触发条件启动）

交付：独立 Worker、TaskItem、事件、幂等、租约、取消、单项重试、过期任务恢复和轮询/SSE。

退出条件：应用进程重启不丢任务；两个 Worker 不重复执行同一 Item；取消和重试状态可审计。

### Phase 7：联网 GEO 与市场洞察

交付：搜索 Adapter、来源保存、联网 GEO、四种市场洞察、成本和配额控制。

退出条件：ADR 全部落实；每条外部结论可追溯；无来源时明确降级；数据时效和免责声明可见。

---

## 11. 每阶段开发门禁

每个 Phase 严格执行：

```text
需求与契约评审
      ↓
数据/接口/交互设计冻结
      ↓
测试用例先行与 Mock 准备
      ↓
小步实现
      ↓
开发者自测
      ↓
自动化质量门禁
      ↓
产品功能验收
      ↓
回归、迁移与回滚验收
      ↓
发布或进入下一阶段
```

任一阶段不得因下一阶段的设想扩大当前改动范围。数据库、公共模型客户端和任务状态属于高风险共享模块，必须单独评审并先于 UI 合并。

---

## 12. 验收流程

### 12.1 契约验收

参与：产品、前端、后端、测试。检查输入字段、必填条件、结果结构、错误码、状态转换、兼容策略和阶段外范围。所有未决项必须标为“阻塞”或“后置”，不得以口头约定进入开发。

### 12.2 自动化验收

每次合并至少执行：

```powershell
npx tsc --noEmit
npm run build
npx prisma validate
npm run test
npx playwright test <营销相关用例>
```

涉及 migration 时增加空库迁移、存量库迁移和回滚演练。修改文件 ESLint 必须零错误；全项目 lint 错误和警告总数不得增加。

### 12.3 API 验收

覆盖：字段边界、非法 UUID、越权 taskId、停用模型、未测试模型、视觉能力不足、上传伪装文件、上游超时、429、5xx、无效 JSON、部分失败、任务查询和导出失败。

每个错误都必须返回稳定错误码和 requestId，响应与服务端日志不得包含 API Key 或完整敏感输入。

### 12.4 功能验收

使用固定测试夹具完成：

| 用例 | 预期 |
| --- | --- |
| 标准商品三输出 | 分析、文案、主图和详情页结果完整 |
| 一个下游输出失败 | 状态为 partial_failed，其他结果保留 |
| 视觉模型不可用 | 提交前拦截或返回明确能力错误 |
| 重复点击生成 | 按钮加载期间禁用，不产生重复任务 |
| 页面切换再返回 | 当前窗口 taskId 可回查结果 |
| 超长/超量输入 | 前后端同时拒绝并定位字段 |
| 导出任务 | 生成真实文件 Asset，并关联原任务 |

### 12.5 UI 与视觉验收

Playwright 至少检查 1440×900、1024×768、390×844 三种视口。验证：

- Tab 状态互不覆盖；
- 表单和结果不发生横向溢出；
- 长标题、长单词和多语言文本不遮挡；
- 按钮禁用原因、加载、空状态、部分失败和错误状态完整；
- 键盘可操作 Tab、语言搜索和主要表单；
- 上传预览、删除和失败反馈正确；
- 浏览器控制台没有本次新增 hydration、React 和资源错误。

### 12.6 数据与迁移验收

1. `prisma validate` 通过。
2. 新数据库可从零执行全部 migration。
3. 含旧 MarketingTask 的数据库迁移后旧任务仍可查询。
4. migration 失败时能通过备份或回滚 SQL 恢复。
5. 新字段默认值不会改变旧接口行为。

### 12.7 发布验收

发布前检查构建产物、环境变量、数据库备份、模型连接、磁盘目录权限和回滚版本。先用本地用户完成一轮文案真实模型冒烟，再开放新工作台入口。

发布后观察：任务成功率、部分失败率、P50/P95 时长、429/5xx、JSON 解析失败、平均模型调用次数和导出失败率。指标异常时立即关闭新入口并回退旧向导。

---

## 13. 分阶段验收清单

### Phase 0-1

- [ ] 测试和 Playwright 命令可执行。
- [ ] 模型 Mock 覆盖五类结果。
- [ ] 模型 JSON 和视觉能力可实测。
- [ ] 图片已经文件化，任务中只存 URL。
- [ ] TypeScript、build、Prisma 全部通过。

### Phase 2-3

- [ ] 文案工作台完成正常、部分失败和全部失败链路。
- [ ] 并发上限为 3，步骤状态无丢失更新。
- [ ] 旧向导和旧 API 回归通过。
- [ ] 30 种语言集中配置且平台联动正确。
- [ ] 翻译保留结构并支持部分失败。

### Phase 4-5

- [ ] SEO 输出结构通过 Zod 校验。
- [ ] 未确认事实不会进入可发布正文。
- [ ] 收藏、组合筛选和导出可用。
- [ ] GEO 离线声明始终可见。
- [ ] GEO 不生成伪造来源或已核实标签。

### Phase 6-7

- [ ] 任务跨进程重启可恢复且不重复执行。
- [ ] 取消、重试和事件顺序可审计。
- [ ] 搜索服务 ADR 已批准并落实。
- [ ] 联网结论均有来源 URL 和抓取时间。
- [ ] 无联网能力时市场洞察不可提交。

---

## 14. 回滚方案

### UI 回滚

保留旧 `MarketingWorkspace` 或旧入口直到 Phase 2 验收完成。新工作台出现严重问题时切回旧向导，不删除新任务数据。

### API 回滚

旧 `/api/marketing/generate` 在 Phase 4 前只维护、不扩展。新 `/api/marketing/tasks` 可独立下线，不影响旧接口。

### 数据回滚

第一版只增加可空字段和有默认值字段，不删除旧列。回退应用版本时旧代码应能忽略新增字段。涉及导出 Asset 时不得在回滚脚本中自动删除用户文件。

### 模型回滚

模型能力实测失败不修改 API Key；仅把测试状态标记为失败。用户可恢复上一模型配置或重新测试。

---

## 15. 文件改动规划

| 阶段 | 主要位置 |
| --- | --- |
| Phase 0 | `package.json`、测试配置、`tests/` 或既有 `__tests__/` |
| Phase 1 | `src/lib/ai/`、`src/lib/model-configs.ts`、模型配置 API、营销上传 API、设置页 |
| Phase 2 | `src/components/marketing/`、`src/app/api/marketing/tasks/`、`src/types/marketing.ts`、Prisma |
| Phase 3 | `src/lib/marketing/languages.ts`、LanguagePicker、TranslateEngine、翻译 API |
| Phase 4 | SeoEngine、SEO Tab、任务列表/收藏/导出 API、资源库筛选 |
| Phase 5 | GeoEngine、GEO Tab、事实校验器 |
| Phase 6 | Worker 入口、TaskItem/Event、队列租约与事件接口 |
| Phase 7 | 搜索 Adapter、Source 数据、InsightEngine、市场洞察 Tab |

每个阶段修改代码时必须按项目根目录 `AGENTS.md` 要求，将改动追加到当天 `docs/YYYY-MM-DD.md`；纯评审、运行检查或文档设计不写代码修改日志。

---

## 16. 研发评审决策表

| 决策 | V3 建议 | 状态 |
| --- | --- | --- |
| 第一版执行模型 | 同步请求内串行分析 + 下游并发 | 待确认 |
| 部署假设 | 单实例 | 待确认 |
| 第一版图片 | 必填，1-5 张，先文件化 | 待确认 |
| 模型协议 | OpenAI Chat Completions 兼容 | 待确认 |
| 第一版数据模型 | 增量扩展 MarketingTask | 待确认 |
| 流式进度 | 第一版不做 | 待确认 |
| GEO | 先离线版 | 待确认 |
| 市场洞察 | 搜索 ADR 后实施 | 待确认 |
| 文案导入素材库 | 导出真实文件后创建 Asset | 待确认 |
| 质量门禁 | 修改文件 lint 零错误，全项目问题不增加 | 待确认 |

以上十项确认后，Phase 0 方可进入实施。Phase 6 和 Phase 7 需要分别进行独立技术评审，不因本文批准而自动获得开发准入。
