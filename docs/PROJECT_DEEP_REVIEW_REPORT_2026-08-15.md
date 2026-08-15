# 项目深度审查报告

> 审查时间：2026-08-15 22:03:52（Asia/Shanghai）  
> 审查基线：`main` / `87edbad`  
> 审查方式：五个专项方向并行静态审查 + 本地构建、类型、单元、E2E、依赖审计验证  
> 审查范围：API 与安全、前端组件、数据与存储、测试与工程配置、核心业务逻辑

## 1. 执行摘要

项目功能覆盖面较完整，TypeScript、单元测试、E2E 和生产构建均能通过；但当前仍不具备安全上线条件，也不能认定为“production-ready”。最紧急的问题不是代码风格，而是认证边界、密钥外泄链、SSRF、异步执行一致性以及若干核心功能实际未实现。

综合结论：**高风险，建议暂停公网或不受信任局域网部署，先完成 P0/P1 整改。**

| 级别 | 数量 | 含义 |
| --- | ---: | --- |
| P0 严重 | 3 | 可直接导致全量越权、密钥泄露或内网攻击，必须阻断上线 |
| P1 高 | 16 | 可导致重复计费、数据丢失、关键功能失效或稳定性事故 |
| P2 中 | 13 | 会降低数据质量、可维护性、可用性或扩大故障影响 |
| P3 低 | 4 | 工程治理、性能或防御纵深不足 |

最优先处理的五件事：

1. 接入真实认证，所有 API 默认拒绝匿名，并按服务端会话绑定 `userId`。
2. 封堵“修改模型地址后复用原密钥”的密钥外泄链，并统一治理 SSRF。
3. 修复 Worker 租约、步骤创建幂等与数据库事务边界，避免重复执行和重复计费。
4. 修复营销助手 2 文本导出、V3 空操作按钮、工作流条件分支和伪实现节点。
5. 建立 CI 质量门禁；当前 Lint 有 149 个错误，且关键并发/安全链路缺少测试。

## 2. 已执行验证

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `npm test` | 通过 | 29 个测试文件，257 个测试全部通过 |
| `npm run test:e2e` | 通过 | 87 个 Playwright 测试全部通过，3 个视口项目 |
| `npx tsc --noEmit` | 通过 | TypeScript 类型检查通过 |
| `npm run build` | 通过但有风险 | 构建成功；出现 5 个动态文件系统追踪警告，并在构建期启动 4 个营销 Worker |
| `npm run lint` | 失败 | 149 errors / 14 warnings，涉及 49 个文件 |
| `npm audit --omit=dev` | 通过 | 生产依赖已知漏洞 0 个 |
| `npx prisma validate` | 通过 | Schema 语法有效，但不代表迁移约束与 Schema 一致 |
| `npx prisma migrate status` | 通过 | 迁移已应用，但当前库仍存在数组列约束漂移数据 |
| 工作区状态 | 干净 | 审查前后均未修改业务代码 |

Lint 主要问题分布：`no-explicit-any` 135 项、`set-state-in-effect` 10 项、`no-unused-vars` 13 项、`react-hooks/immutability` 3 项，其余 2 项。

## 3. P0 严重问题

### P0-01 全部 API 共享固定本地用户，实际没有认证边界

- **证据**：`src/lib/auth/current-user.ts:3-15` 明确说明尚未接入登录系统，并把所有请求映射为 `local@user.com`。
- **影响**：任何能访问应用端口的人都能读取、修改或删除同一用户的模型配置、任务、素材、画布和工作流，并可触发付费模型调用。
- **附加风险**：若未来只替换 `getCurrentUser()`，多个动态路由仍只按主键操作，跨租户越权依旧存在。
- **建议**：上线前接入可靠会话认证；API 默认拒绝匿名；统一授权层从服务端会话读取 `userId`；Cookie 会话补充 Origin/CSRF 防护；认证完成前仅监听回环地址只能作为临时缓解。

### P0-02 可修改模型地址并复用原密钥，形成 API Key 外泄链

- **证据**：`src/app/api/model-configs/[id]/route.ts:32-61` 允许更新 `baseURL`，未提交新 `apiKey` 时保留已有密文；`src/app/api/model-configs/[id]/test/route.ts:44-67` 会解密该密钥并以 Bearer Token 请求保存的新地址。
- **攻击路径**：匿名调用者获取配置 ID -> 将 `baseURL` 改为攻击者服务器 -> 调用测试接口 -> 原 API Key 被发送至攻击者。
- **影响**：模型供应商密钥直接泄露，可造成资金损失和供应商账户滥用。
- **建议**：先完成认证；主机、协议、provider 变化时强制重新输入密钥；服务地址采用供应商白名单或严格出站策略；绝不向任意可编辑地址附加已有凭据。

### P0-03 多处任意 URL 服务端请求，可访问内网与云元数据

- **证据**：`src/app/api/ai/test-connection/route.ts:26-48` 直接请求客户端 `baseURL`；模型与搜索配置仅使用 `z.url()`（`src/app/api/model-configs/route.ts:17-22`、`src/app/api/search-services/route.ts:10-16`）；`src/lib/search/SearchAdapter.ts:132` 和 AI 适配器会实际请求该地址；`src/lib/ai/adapters/relay.ts:594-612` 还会下载用户图片 URL。
- **影响**：可探测/读取 localhost、RFC1918 私网、链路本地、云元数据或内部管理服务；结合文件保存接口可能形成回显链。
- **建议**：实现集中式 `safeFetch`：仅允许 HTTPS 和受信域名；DNS 解析后拒绝 loopback/private/link-local/metadata/IPv6 内网；每次重定向重新校验；限制端口、超时、响应大小；网络层阻断元数据与内部管理网。

## 4. P1 高风险问题

### P1-01 资源、画布、工作流和文件夹存在 IDOR

- **证据**：`src/app/api/assets/[id]/route.ts:12-124`、`assets/batch/route.ts:82-158`、`canvas-projects/[id]/route.ts:11-83`、`workflows/[id]/route.ts:11-83`、`folders/[id]/route.ts:11-180` 的关键查询/更新/删除只按 `id`。
- **影响**：接入多用户后仍可跨租户读取、修改、删除或挂接数据。
- **建议**：所有仓储操作携带 `{ id, userId }`；关联的 folder/project/tag/parent 也验证所有权；增加跨用户负例测试。

### P1-02 文件接口按路径公开用户文件并长期公共缓存

- **证据**：`src/app/api/files/[...path]/route.ts:15-48` 不鉴权、不查资产归属，返回 `public, max-age=31536000, immutable`。
- **影响**：商品图、营销 JSON、提示词和导出文件可被长期共享缓存；目录内符号链接还可能绕过字符串前缀检查。
- **建议**：通过 opaque asset ID 查库鉴权后返回；私有内容使用 `private, no-store`；真实路径校验防符号链接越界；确需公开时使用短期签名 URL。

### P1-03 上游图片下载无超时、类型、字节和像素上限

- **证据**：`src/app/api/ai/text-to-image/route.ts:77-98`、`image-to-image/route.ts:80-101` 使用 `fetch -> arrayBuffer -> sharp -> 落盘`，没有硬限制。
- **影响**：恶意上游可触发内存、CPU、磁盘 DoS，也可辅助 SSRF 回显。
- **建议**：安全下载器流式累计字节数；检查最终 URL、Content-Type、Content-Length；设置 AbortSignal；限制 Sharp 像素数和允许格式。

### P1-04 无全局限流，客户端队列键可绕过并发控制

- **证据**：AI、模型测试、上传、导入和任务接口没有共享限流；`src/lib/queue/QueueManager.ts:14-51` 单队列默认并发 50，队列 Map 无淘汰；旧 AI 路由使用客户端 `config.id` 作为队列键。
- **影响**：轮换 ID 可创建无界队列并绕过并发限制，造成付费调用、内存和连接耗尽。
- **建议**：按认证用户 + IP + 路由实施共享限流、并发和日配额；只接受服务端模型配置 ID；队列增加全局上限与 TTL/LRU。

### P1-05 Worker 租约无续租，旧执行者可覆盖新执行者

- **证据**：`src/lib/marketing/async/types.ts:41-42` 固定 5 分钟租约；`worker.ts:74-140` 过期后直接恢复并重新领取；执行期间无 heartbeat；`worker.ts:217-259` 异常更新不校验原 `leaseOwner`。
- **影响**：耗时超过 5 分钟会重复调用、重复计费、重复资产；旧 Worker 迟到异常可清除新 Worker 的租约并覆盖状态。
- **建议**：心跳续租；每次领取生成 fencing token；成功/失败更新均 CAS 匹配 token、owner、status；上游副作用传递幂等键。

### P1-06 步骤执行创建子项与乐观锁更新不在同一事务

- **证据**：`src/lib/marketing2/step-actions.ts:122-195` 先检查、创建 items，再递增任务版本。
- **影响**：两个不同幂等键、相同 `expectedVersion` 的并发请求都会创建子项；一个请求虽返回 409，其遗留的 pending item 仍会执行。
- **建议**：状态检查、幂等记录、items 创建、版本更新放入同一事务；为步骤执行建立用户/任务/步骤范围唯一记录。

### P1-07 构建期通过模块顶层副作用启动后台 Worker

- **证据**：`src/app/api/marketing2/runs/route.ts:5-8` 及多个步骤路由在模块顶层调用 `startMarketingWorker()`；本次 `next build` 的 page data 阶段实际启动了 4 个 Worker。
- **影响**：构建进程会连接 `.env` 数据库并可能领取真实 pending 任务；多构建 Worker 还会放大并发和副作用，构建可改变业务数据。
- **建议**：从 Route 模块移除启动副作用；Worker 使用独立进程/容器和明确启动命令；构建环境默认禁用执行器；加入构建期无数据库写入测试。

### P1-08 营销助手 2 文本导出必然进入图片解析器而失败

- **证据**：`src/lib/marketing2/export-service.ts:157-166` 将 JSON/Markdown buffer 交给 `createDerivedAsset`；`asset-versioning.ts:49-55` 调用 `FileStorage.saveFromBuffer`；`FileStorage.ts:80-89` 使用 Sharp 且仅接受图片。
- **影响**：JSON、Markdown、提示词包、质检报告和资产清单无法导出。
- **建议**：拆分通用对象存储和图片处理；文本按 MIME/扩展名直接安全写入，仅图片生成缩略图。

### P1-09 文件系统与数据库无补偿双写，存在永久丢失和孤儿

- **证据**：`assets/[id]/route.ts:110-125` 先删文件再删记录；`assets/batch/route.ts:81-103` 文件失败仍删记录；`marketing/import/route.ts:22-40` 先写文件再建记录。
- **影响**：数据库瞬断或磁盘错误会产生记录指向不存在文件、文件无记录或不可追踪残留。
- **建议**：使用 pending/ready/deleting 状态、outbox 与幂等清理；临时文件 + 原子重命名；定期一致性扫描和垃圾回收。

### P1-10 异步任务、子项和首事件创建不原子

- **证据**：`src/lib/marketing/async/task-creation.ts:311-340` 三次独立写入。
- **影响**：中途失败会留下无子项、无事件但持续显示运行中的孤立任务。
- **建议**：任务、子项和首事件置于同一 `$transaction`；创建请求增加用户范围幂等键和补偿扫描。

### P1-11 新营销提交会重复处理上一次任务终态

- **证据**：`src/components/marketing/workspace/use-async-generation.ts:63` 提交时清空处理标记，但轮询详情仍是旧任务；`MarketingWorkbench.tsx:35` 随重渲染再次处理旧终态。
- **影响**：新任务按钮提前恢复、重复弹旧结果，用户可能再次提交造成重复任务。
- **建议**：详情严格绑定当前 activeTaskId；开始提交时清空旧 detail；只处理 ID 与当前提交一致的终态。

### P1-12 一次轮询异常会令营销界面永久停在生成中

- **证据**：`src/components/marketing/workspace/use-task-polling.ts:55` 失败后停止且不传播；`use-async-generation.ts:111` 因此不会执行恢复生成状态的路径。
- **影响**：短暂网络错误就需要刷新页面才能恢复操作。
- **建议**：有限退避重试；明确超时/终止回调；所有退出路径在 `finally` 恢复 UI，并提供手动重试。

### P1-13 V3 批量重试、暂停/继续、批量提交控件是空操作

- **证据**：`src/components/marketing2-v3/WorkflowWizard.tsx:287` 向可见按钮传入三个 `() => undefined`；按钮位于 `BatchGenerationStep.tsx:84-104`。
- **影响**：用户看到功能完整的控制面，但点击没有任何效果。
- **建议**：接入现有 retry/pause/resume/patch API；未实现前禁用并说明状态或移除控件。

### P1-14 画布和工作流自动保存存在乱序覆盖

- **证据**：`src/app/(dashboard)/canvas/[id]/page.tsx:85`、`workflow/[id]/page.tsx:110` 的自动保存与手动保存可并发，无版本条件。
- **影响**：较慢的旧 PATCH 晚于新 PATCH 完成时会把服务端回滚到旧快照，造成静默数据丢失。
- **建议**：客户端串行保存并合并最新快照；服务端增加版本号/ETag 条件更新。

### P1-15 工作流条件分支会同时执行，错误分支还收到整个结果对象

- **证据**：`src/lib/workflow/nodes/logic.ts:45` 条件结果为 `{ true: value }` 或 `{ false: value }`；`WorkflowEngine.ts:100-112` 当 sourceHandle 不存在时回退返回整个 result；`execute():183-191` 随后执行拓扑序中的所有节点。
- **影响**：true 和 false 两条分支都可能运行，业务副作用重复或走错路径。
- **建议**：sourceHandle 不存在时返回显式“无输出”并跳过该边下游；引擎引入 skipped 状态；增加 true/false 分支和嵌套分支测试。

### P1-16 裁剪、缩放、滤镜和资源输出节点是伪实现

- **证据**：`src/lib/workflow/nodes/image.ts:16-73` 三个节点直接原样返回输入；`nodes/output.ts:20-30` 未保存资产却返回 `saved: true` 和“已保存到资源库”。
- **影响**：工作流显示成功但没有执行用户配置，结果与 UI/README 承诺不一致。
- **建议**：用 Sharp/成熟图像库实现变换；输出节点调用受权资产服务并以真实结果决定状态；完成前标为不可用，禁止返回虚假成功。

## 5. P2 中风险问题

### P2-01 请求结构和体积上限不统一

- `assets/route.ts:8-10` 的 `pageSize` 无上限；`marketing/import/route.ts:11-25` 接受任意大结果并直接落盘；画布、工作流 definition/thumbnail 也无明确长度限制。
- 建议所有 API 使用 strict Zod Schema，限制数组、字符串、JSON 深度、分页和图片像素，并在代理与应用层设置请求体上限。

### P2-02 客户端可见密钥无法保护本地 API Key

- `src/lib/security/encryption.ts:3-17` 使用 `NEXT_PUBLIC_ENCRYPTION_SECRET`；任何浏览器脚本都能取得密钥并解密 localStorage。
- 建议迁移到服务端 AES-GCM 存储，客户端只接收 masked summary；明确旧方案只是混淆，不是安全加密。

### P2-03 资产文件名和 revision 使用先查后写

- `src/lib/marketing2/asset-versioning.ts:35-76` 并发下可得到同名文件和相同 revision，数据库冲突后已写文件无人清理。
- 建议使用随机对象键；增加 `(parentAssetId, revision)` 唯一约束并在事务中分配版本。

### P2-04 多租户关系缺少数据库级一致性约束

- `prisma/schema.prisma:100-179,321-375` 无法保证 Asset/Folder/Project/TaskItem/Event 关系属于同一用户；Tag 为全局唯一且无 `userId`。
- 建议引入复合外键/唯一键，或明确系统级 Tag 语义；去除无法保证一致性的冗余 userId。

### P2-05 迁移列可空性与 Prisma Schema 不一致

- 迁移中的 `productImages/sellPoints/keywords/selectedOutputs` 可为 NULL，而 `schema.prisma` 声明为必填数组；当前库已有不符合模型假设的数据。
- 建议先回填空数组，再迁移为 `NOT NULL DEFAULT ARRAY[]::TEXT[]`；CI 加入 schema/migration diff 和约束核验。

### P2-06 上传批次失败不会清理已保存的前序文件

- `src/app/api/marketing/upload/route.ts:84-128` 逐个验证并立刻落盘；后续文件非法时，之前文件成为无记录孤儿。
- 建议先完整验证全部文件再写入，或在失败时补偿删除当前批次。

### P2-07 时间戳单字段游标会漏任务和事件

- `worker.ts:348-370` 和 `run-service.ts:441-459` 仅用 `createdAt` 严格大于/小于分页。
- 建议改用 `(createdAt, id)` 复合游标、稳定双字段排序和对应索引。

### P2-08 任务详情错误被前端忽略或无法规范化

- `use-marketing2-run.ts:218-266` 只保存 `Marketing2ApiError`；网络 `TypeError` 可能永久 loading；`WorkflowWizard.tsx:113` 和 `WorkflowRunner.tsx:99` 不读取 error。
- 建议统一错误类型，恢复失败显示错误页和重试/返回入口，禁止退化成空白新建态。

### P2-09 逐项模型选择并发提交会丢修改

- `WorkflowWizard.tsx:196` 快速修改时多个 PATCH 共享同一版本，调用处又用 `void` 丢弃拒绝。
- 建议串行保存或批量暂存后一次提交，统一处理 VERSION_CONFLICT。

### P2-10 “上一步”实际执行浏览器后退

- `WorkflowWizard.tsx:334` 使用 `window.history.back()`，步骤推进并未写浏览器历史。
- 建议维护可查看步骤状态，或将按钮改成语义明确的“返回任务列表”。

### P2-11 素材步骤锁定未覆盖全部控件

- `MaterialStep.tsx:433-470` 与 `WorkflowWizard.tsx:256-259` 中平台、数量、主参考图仍可在锁定后修改。
- 建议所有控件统一接收 disabled，并在 onChange 二次保护。

### P2-12 联网 GEO 结果仍固定显示离线声明

- `GeoTab.tsx:148` 会请求联网；`ResultsPanel.tsx:654` 却固定标记未联网且不展示 sources/retrievedAt/degraded。
- 建议按结果元数据渲染来源、时间和降级状态，避免误导。

### P2-13 测试覆盖没有保护最高风险链路

- 现有 29 个单测文件集中于 schema/纯函数/模型客户端；没有前端组件单测，没有 WorkflowEngine 条件分支测试，也没有 Worker 租约续期、步骤事务并发、文件/DB 故障、SSRF/认证/IDOR 测试。
- Playwright 仅 3 个营销相关 spec，未覆盖 settings、assets、canvas、workflow 主流程。
- 建议优先补 P0/P1 回归测试，而不是追求笼统覆盖率数字。

## 6. P3 低风险与工程治理

### P3-01 Lint 未成为构建门禁

- `next build` 在 149 个 Lint 错误下仍成功；`package.json` 没有统一 `check` 脚本，仓库也没有 CI 工作流。
- 建议建立 `check = lint + tsc + test + build`，PR 必须通过；逐步清理现存错误，禁止新增债务。

### P3-02 E2E 使用真实本地数据库与磁盘且缺少完整清理

- `tests/e2e/marketing2-api.spec.ts` 和 `marketing2.spec.ts` 会创建任务、items 和上传文件；大部分用例未清理，且同一 API spec 被三个浏览器项目重复执行。
- 建议独立测试数据库/USER_DATA_PATH；worker-scoped fixture 创建命名空间并 afterAll 清理；纯 API 项目只运行一次。

### P3-03 生产构建追踪整个项目目录

- 构建报告 `files/[...path]/route.ts` 与 `asset-versioning.ts` 共 5 个动态文件系统访问警告，可能把整个项目追踪进服务端产物。
- 建议将数据目录静态限定在部署产物之外，按 Next.js 16 文档处理动态访问，验证 standalone 产物体积与内容。

### P3-04 Docker 开发数据库以弱口令暴露宿主机端口

- `docker-compose.yml:8-12` 固定 `dev_password` 并映射 `5432:5432`。
- 建议只绑定 `127.0.0.1:5432`，凭据从未提交的环境文件读取，并明确该 compose 仅用于开发。

## 7. 测试与工程配置专项结论

当前测试“数量足、关键风险覆盖不足”。正向 schema 和营销页面冒烟较扎实，但测试体系没有覆盖真正决定生产可靠性的认证授权、SSRF、并发 fencing、事务回滚、文件故障和工作流分支语义。

建议新增以下测试层：

1. **安全契约**：匿名 401、跨用户 404、私网 URL 拒绝、重定向到私网拒绝、密钥永不发送到变更后的主机。
2. **数据库并发**：不同幂等键同版本并发只产生一批 items；Worker 超时续租和旧 token 无法提交。
3. **故障注入**：文件成功/DB 失败、DB 成功/文件失败、批量上传中途失败均可恢复。
4. **核心工作流**：true/false 只执行一条分支；crop/resize/filter 改变输出；Output 失败不得报告 saved。
5. **前端状态机**：旧任务终态不影响新任务；轮询错误退出 loading；V3 暂停/重试按钮真正调用 API。

建议工程门禁顺序：`npm ci` -> `prisma validate` -> migration diff/临时库 deploy -> `eslint` -> `tsc --noEmit` -> `vitest --coverage` -> `next build` -> 隔离环境 Playwright。

## 8. 核心业务逻辑专项结论

核心营销助手 2 已具备版本号、幂等键、租约、步骤审批和资产版本等正确方向，但几个关键原语没有形成原子闭环：

- 幂等检查、创建子项、任务版本更新不是一个事务；
- 租约只有到期，没有续租与 fencing；
- 文件与数据库双写没有状态机和补偿；
- 构建与 Web Route 承担后台 Worker 生命周期；
- 前端控件和后端能力出现断线；
- 旧 WorkflowEngine 的条件分支和多个节点仍是伪实现。

因此当前系统更接近“可演示的功能集成版”，尚未达到可承受并发、故障和不受信任访问的生产状态。

## 9. 分阶段整改计划

### 阶段 A：立即止血（1-3 天）

1. 限制服务仅本机访问，停止公网/不受信 LAN 暴露。
2. 禁用旧 `/api/ai/*` 客户端完整配置入口；禁用可编辑主机复用原密钥。
3. 增加出站网络阻断与 URL 私网校验。
4. 从构建和 Route 模块移除 Worker 顶层启动。
5. 暂时下线空操作按钮、伪实现工作流节点和失效文本导出入口。

### 阶段 B：安全与一致性基线（1-2 周）

1. 接入认证和集中授权；修复全部 IDOR/关系越权。
2. Worker 增加 heartbeat + fencing token；步骤执行和任务创建事务化。
3. 文件服务改为资产 ID 鉴权；引入文件状态机/outbox/GC。
4. 全局限流、配额、下载硬上限和统一错误响应。
5. 修复 P1 前端状态机与自动保存乱序问题。

### 阶段 C：质量门禁与可运维性（1-2 周）

1. 建立 CI 和隔离测试数据库/文件目录。
2. 补齐安全、并发、故障注入和工作流语义测试。
3. 清零 Lint 错误并设置 coverage 基线。
4. 修复迁移漂移、复合游标、数据保留和孤儿回收策略。
5. 增加结构化日志、requestId、指标、队列积压和失败告警。

## 10. 正向发现

- Prisma 查询未发现 `$queryRaw/$executeRaw`，未发现 `eval`、命令执行或 `dangerouslySetInnerHTML`。
- 服务端新模型配置使用 AES-256-GCM，且列表 DTO 不返回密钥正文。
- 营销助手 2 已使用 Zod、版本号和幂等键，并有越权任务 404、密钥字段拒绝等 E2E 基础。
- `.env` 与 `user-data` 已被 `.gitignore` 排除，未发现已跟踪真实密钥。
- 生产依赖 `npm audit` 当前无已知漏洞。
- 257 个单测和 87 个 E2E 全部通过，说明现有已覆盖路径具有一定回归基础。

## 11. 审查限制

- 未执行真实供应商模型调用，未验证实际计费、供应商限流和长耗时行为。
- 未进行双 Worker 故障注入、断网、磁盘满、数据库主从切换或高并发压测。
- 未核查生产反向代理、防火墙、备份恢复、磁盘配额和密钥轮换配置。
- 本报告是代码与本地环境审查结果，不等同于渗透测试或生产合规认证。
