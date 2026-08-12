# 商图策AI「文案 · SEO · GEO · 洞察」模块借鉴改造文档

> **来源页面**：https://vibex.runninghub.cn/p/app-823c92b03c744482971ffdc49f929535/copywriting
> **产品名**：商图策AI —— 全球电商内容生产工具（RunningHub VibeX 托管应用，V2.3.6）
> **调研时间**：2026-08-12
> **页面可访问性**：无需登录即可浏览全部内容；仅执行生成任务时需登录（RunningHub SSO：手机号/微信/验证码）
> **本文档目标**：分析对方页面中与本项目（ecommerce-ai-design）重叠且值得借鉴的能力，给出改造方案、分期计划与落地路径。
> **范围说明**：本文档仅覆盖对方「营销内容」（copywriting）页面。其生产导航的其余 8 个入口（智能/自由/专业服饰/全品类/参考模式、图片工具箱、视频生成、愉悦生活）对应的是生图/视频能力，本项目已有文生图、图生图、工作流等对应模块，不在本次借鉴范围内。

---

## 一、对方页面内容速览

该页面是「商图策AI」的**营销内容工作台**，整体结构为：

```
顶部栏（Logo / 全部作品 / 素材库 / 设置 / 登录）
  ↓
生产导航（9 入口：智能模式 / 自由模式 / 专业服饰 / 全品类模式 /
          参考模式 / 图片工具箱 / 视频生成 / 营销内容 / 愉悦生活）
  ↓
六步流程指示条（选择营销任务 → 商品素材 → 内容配置 → 执行 → 结果 → 交付）
  ↓
主功能区（5 个 Tab）：文案创作 / SEO 优化 / GEO 优化 / 多语言翻译 / 市场洞察
  ↓
右侧结果区（本轮作品 / 当前窗口历史 / 全部作品）
  ↓
全局资产层：全部作品面板 + 素材库抽屉（跨页面复用、可拖拽）
```

### 1.1 文案创作 Tab

| 输入项 | 说明 |
| --- | --- |
| 目标平台 | 20 个：淘宝/天猫、京东、拼多多、抖音小店、快手小店、小红书、1688、Temu、SHEIN、速卖通、Wish、Amazon、OZON、eBay、Walmart、Shopee、Lazada、TikTok Shop、Shopify、独立站 |
| 输出语言 | 弹窗式多选语言选择器，按地区分组（中文 / 全球常用 / 欧洲 / 俄罗斯及周边 / 中东与南亚 / 东南亚），约 60+ 种语言；切换地区自动带入默认语言，可手动调整 |
| 商品名称 | 单行输入 |
| 商品图片 | 推荐上传，用于识别可见卖点与商品信息；支持本地上传 / 从素材库选择 |
| 核心卖点 | 多行输入，每行一个卖点 |
| 目标关键词 | 可选 |
| 输出内容 | **多选并发**：核心卖点（3-5 条）、商品描述（详情页长文案）等 |
| 文案润色 | 粘贴原文进行润色 |

**亮点**：一次勾选多种输出类型 → 并发输出；生成按钮在未选内容类型时禁用并提示。

### 1.2 SEO 优化 Tab

- **优化场景（5 卡片）**：电商商品页 / 品牌企业官网 / 服务落地页 / 内容文章 / 本地业务
- **目标搜索渠道**：综合搜索、Google、百度、Bing、平台站内搜索
- 输入：商品/页面名称、目标平台、商品图片、现有页面内容（可空，从零创建）、**已确认事实**（商品参数、卖点、包装、售后、认证等真实资料，资料不全会标记"待补充"）、目标受众/地区/语言、页面网址（可选）、目标关键词/参考页面（可选）
- **内容模型 5 选 1**：按特性标注推荐（响应快 / 推荐默认 / 深度分析与竞争视角 / 高质量长内容 / 结构化营销内容）
- **输出承诺**：关键词意图、页面标题与结构、正文、FAQ、Alt、内链与结构化数据建议；**不编造搜索量、排名或业务事实**

### 1.3 GEO 优化 Tab（生成式引擎优化）

- 面向 **AI 问答与生成式搜索**的优化（被 AI 引用/回答的能力）
- 场景（5 种）：电商商品 / 品牌 / 服务 / 机构 / 内容主题
- 输入：商品事实与现有内容（"资料不全也可以生成"）、用户问题/关键词（如：适合谁、怎么选、与同类有什么区别）
- 机制：**联网核实公开信息，无法确认的事实列为"待补充"，不自动编造**
- 输出：用户问题、实体事实、引用内容、FAQ 与行动清单

### 1.4 多语言翻译 Tab

- 待翻译文案输入（2000 字上限，实时计数）
- 目标语言**多选**（与文案创作同一语言列表）
- 电商场景优化翻译，保留原文格式与排版结构
- **多语言并发翻译，同时输出**

### 1.5 市场洞察 Tab

- 品类/关键词输入 + 目标平台（20 个）+ 目标地区（21 个：美、英、德、法、西、意、荷、比、波、瑞典、日、加、澳、墨、巴、土、阿联酋、沙特、埃及、印度、新加坡）
- 查询类型（4 卡片）：⚔️ 竞争强度 / 🌊 蓝海产品 / 📈 流行趋势 / 🔥 爆品分析
- **实时联网搜索**，基于最新网络数据；明示"仅供参考"

### 1.6 全局资产与体验

- **全部作品面板**：作品计数、预览大小滑块（160–310）、筛选（全部/本周/收藏/图片/视频/文案/压缩包）、搜索框
- **素材库抽屉**：我的素材 / 参考素材；跨页面资产流转；素材可直接**拖拽**到参考图/参考视频区
- 更新公告弹窗（版本号 + 更新项清单）
- 结果区三级视图：本轮作品 / 当前窗口历史 / 全部作品

---

## 二、本项目现状盘点

### 2.1 营销模块已有能力

| 能力 | 现状 | 位置 |
| --- | --- | --- |
| 平台配置（20 个，与对方完全一致） | ✅ 已有 | `src/lib/marketing/sop/platforms.ts` |
| 品类 SOP（9 品类 + 30 份 MD SOP 文档） | ✅ 已有（比对方更强，有本地 SOP 知识库） | `docs/营销文档/MD合集/`（实际 30 个文件）、`src/lib/marketing/sop/categories.ts` |
| 产品多模态分析（图片识别卖点/占位符/风险） | ✅ 已有 | `ProductAnalyzer.ts`、`MultimodalAdapter.ts` |
| 文案生成（卖点/标题/描述/SEO 关键词） | ✅ 已有 | `CopywritingEngine.ts` |
| 主图 / 详情页提示词生成 | ✅ 已有（对方页面未见同等能力，是我们的差异化优势） | `PromptEngine.ts` |
| 模型配置管理（视觉/内容模型选择、跟随策略） | ✅ 已有 | `model-configs` API、`MarketingWorkspace.tsx` |
| 步骤式向导（商品信息 → 平台配置 → 输出选择 → 结果） | ✅ 已有，但为串行 4 步 | `MarketingWorkspace.tsx` |

### 2.2 与对方对比的差距

| 对方能力 | 本项目现状 | 差距评估 |
| --- | --- | --- |
| 单页 Tab 化工作台（5 Tab 并存） | 串行步骤向导 | 🔴 交互模式差距：对方更扁平、可自由组合 |
| 多输出类型勾选 **并发** 生成 | 单次串行生成 | 🟡 需要并发调度 |
| 60+ 语言分组选择器（地区→默认语言联动） | 仅 9 种语言 | 🟡 需扩展语言库 + 分组 UI |
| SEO 优化独立模块（5 场景 + 事实核查 + 结构化输出） | 仅在文案里输出 SEO 关键词字段 | 🔴 缺失 |
| GEO 优化模块 | 无 | 🔴 缺失（新赛道，价值高） |
| 多语言翻译（多选并发、保留格式） | 无 | 🔴 缺失 |
| 市场洞察（联网实时搜索 4 类查询） | 无 | 🔴 缺失（依赖联网搜索能力） |
| 文案润色（粘贴原文） | 无（有通用提示词优化 Dialog，可复用模式） | 🟡 可复用 `usePromptOptimize` 模式 |
| "事实不全 → 标记待补充，不编造"机制 | ✅ 已有（placeholders 占位符机制，理念一致） | 🟢 已具备，可推广到新模块 |
| 全部作品面板（筛选/搜索/预览滑块） | 资产库已有基础（`/assets`） | 🟡 需补筛选维度与作品聚合视图 |
| 素材库跨页面拖拽复用 | 资产库存在，无拖拽到工作区能力 | 🟡 中期增强 |
| 结果区三级视图（本轮/窗口历史/全部） | 仅单次结果展示 | 🔴 需引入会话级历史 |

---

## 三、借鉴改造方案

### 3.0 总体原则

1. **保留本项目差异化优势**：品类 SOP 知识库、主图/详情页提示词引擎、占位符防编造机制 —— 对方没有或更弱，必须保留并作为新模块的底座。
2. **借鉴对方的"扁平 Tab + 并发输出"交互**，将串行 4 步向导改造为 Tab 工作台；向导模式可保留为"新手引导"入口。
3. **所有新模块复用现有模型配置体系**（`model-configs`），对方"5 选 1 内容模型"的呈现方式可直接借鉴：在设置页为模型打"特性标签"（响应快/推荐默认/深度分析/长内容），选择器上展示标签。
4. **"不编造事实"作为全模块红线**：沿用 `ProductAnalysis.placeholders` 理念，新模块一律输出"待补充清单"。

### 3.1 页面架构改造（P0）

将 `/marketing` 页面从串行向导改造为 **Tab 工作台**：

```
src/app/(dashboard)/marketing/page.tsx
  └─ MarketingWorkspace（重构）
       ├─ Tab 条：文案创作 / SEO 优化 / GEO 优化 / 多语言翻译 / 市场洞察
       ├─ 左栏：当前 Tab 的输入表单
       ├─ 右栏：结果区（本轮作品 / 会话历史 / 全部作品 三态切换）
       └─ 底部：生成按钮 + 状态说明（未选输出类型时禁用并提示）
```

**文件改动清单：**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/components/marketing/MarketingWorkspace.tsx` | 重构 | 4 步向导 → Tab 容器 + 左右分栏 |
| `src/components/marketing/tabs/CopywritingTab.tsx` | 新建 | 文案创作表单（复用 ProductInput、PlatformSelector） |
| `src/components/marketing/tabs/SeoTab.tsx` | 新建 | SEO 优化表单 |
| `src/components/marketing/tabs/GeoTab.tsx` | 新建 | GEO 优化表单 |
| `src/components/marketing/tabs/TranslateTab.tsx` | 新建 | 多语言翻译表单 |
| `src/components/marketing/tabs/InsightTab.tsx` | 新建 | 市场洞察表单 |
| `src/components/marketing/ResultPanel.tsx` | 新建 | 三级视图结果区（本轮/会话历史/全部） |
| `src/components/marketing/OutputOptions.tsx` | 改造 | 并入 CopywritingTab，支持多选并发生成 |
| 向导组件（ProductInput 等） | 保留复用 | 不删除 |

### 3.2 语言体系扩展（P0，被多个 Tab 依赖）

- **类型层**：`src/types/marketing.ts` 中 `Language` 从 9 种扩展为分组结构：

```typescript
export interface LanguageOption {
  code: string;        // 'zh-CN' | 'en-US' | 'pt-BR' ...
  name: string;        // 简体中文
  group: LanguageGroup;
}
export type LanguageGroup = 'chinese' | 'global' | 'europe' | 'russia' | 'midesa' | 'sea';
export const LANGUAGE_GROUPS: Record<LanguageGroup, { label: string; languages: LanguageOption[] }>;
```

> 兼容性说明：现有 `Language` 联合类型（9 种）与 `MarketingTask.language`（String 存储）不受影响，新增语言码（如 `pt-BR`、`ar-SA`）天然兼容，无需数据库迁移。

- **UI 层**：新建 `LanguagePicker.tsx`（弹窗式多选，分组展示，搜索过滤），文案创作/翻译/SEO 共用。
- **联动规则**：切换平台/地区 → 自动带入默认语言（沿用 `getPlatformLanguage`），允许手动覆盖（对应对方"切换地区会带入默认语言，也可手动调整"）。
- 覆盖范围建议第一期做到 **30 种**（跨境电商主流市场语言），60+ 全量可后置。

### 3.3 并发输出机制（P0）

对方"多输出类型勾选 → 并发输出"是体验核心。改造点：

1. 输出类型改为多选：`核心卖点 / 商品描述 / 商品标题 / SEO关键词 / 主图提示词 / 详情页提示词`（后两项是我们的独有扩展）。
2. 后端 `POST /api/marketing/generate` 已按 `outputs` 分块串行执行（copywriting → mainPrompts → detailPrompts 逐个 await），改为对勾选的块 **`Promise.allSettled` 并发**（注意模型 RPM 限流，建议并发度上限 3，用现有 `src/lib/queue` 的 `HighConcurrencyQueue` 限流能力）。
3. 结果流式回显：任一子任务完成即在结果区渲染卡片，不必等全部完成。
4. **注意**：现有实现按步骤写 `executionSteps` 进度（running/completed + durationMs），并发化后需改为各子任务独立记录起止时间，步骤状态合并写回，避免相互覆盖。

### 3.4 SEO 优化模块（P1）

**输入模型**（`src/types/marketing.ts` 新增）：

```typescript
export type SeoScenario = 'productPage' | 'brandSite' | 'landingPage' | 'article' | 'localBusiness';
export type SearchChannel = 'general' | 'google' | 'baidu' | 'bing' | 'siteSearch';

export interface SeoOptimizeInput {
  scenario: SeoScenario;
  channel: SearchChannel;
  name: string;                    // 商品/页面名称
  platform?: Platform;
  images?: string[];
  existingContent?: string;        // 现有页面内容（可空 → 从零创建）
  confirmedFacts?: Record<string, string>; // 参数/卖点/包装/售后/认证
  audience?: string;               // 目标受众/地区/语言
  pageUrl?: string;
  targetKeywords?: string[];
  contentModelId: string;
}

export interface SeoOptimizeResult {
  keywordIntent: { keyword: string; intent: string }[];
  pageTitle: string;
  structure: { heading: string; purpose: string }[];
  body: string;                    // 可发布正文
  faq: { q: string; a: string }[];
  altSuggestions: string[];
  internalLinks: string[];
  structuredData: string;          // JSON-LD 建议
  pendingFacts: string[];          // 待补充事实（不编造）
}
```

**实现要点：**

- 新建 `src/lib/marketing/SeoEngine.ts`，沿用 `CopywritingEngine` 的 prompt 组装 + JSON Mode 输出解析模式。
- Prompt 中注入平台合规约束（`getPlatformConstraints(platform)`）与"禁止编造搜索量/排名/业务事实，缺失信息写入 pendingFacts"硬规则。
- API：`POST /api/marketing/seo`。
- 模型选择器借鉴对方：在 `ModelConfig` 上增加 `traitTags: string[]`（如"响应快""深度分析"），下拉项展示标签。

### 3.5 GEO 优化模块（P1）

与 SEO 模块结构同构，差异点：

- 优化目标从"传统搜索引擎"改为"生成式引擎（AI 问答/引用）"。
- 输出聚焦：用户高频问题清单、实体事实卡片、可被引用的 FAQ、行动清单。
- **联网核实**：若模型配置支持联网/搜索工具则启用；不支持时降级为"基于已提供事实生成 + 全部外部事实标记待核实"，并明确提示。这是与对方行为对齐的关键：`无法确认的事实列为待补充`。
- API：`POST /api/marketing/geo`，引擎 `src/lib/marketing/GeoEngine.ts`。

### 3.6 多语言翻译模块（P1，实现成本最低，建议先行）

- 输入：文案（≤2000 字，实时计数）+ 目标语言多选（复用 LanguagePicker）。
- 每种目标语言一个并发请求（并发度上限 3-5），Prompt 强调：**电商术语本地化、保留原文换行/列表/排版结构**。
- 结果按语言卡片并列展示，支持一键复制、保存到素材库。
- API：`POST /api/marketing/translate`，引擎 `src/lib/marketing/TranslateEngine.ts`。
- 与现有文案生成的联动：CopywritingResult 卡片上加"翻译"快捷按钮，把结果文本带入翻译 Tab。

### 3.7 市场洞察模块（P2，依赖联网能力，风险最高后置）

- 输入：品类/关键词 + 平台（复用 20 平台）+ 地区（新增 21 地区枚举）+ 查询类型（竞争强度/蓝海/趋势/爆品 4 卡片）。
- 实现依赖**联网搜索**：优先走支持 web search 的模型/工具链；若现有 AI 服务无搜索能力，可先做"离线分析版"（基于用户提供资料 + 模型知识），并如实标注"非实时数据"，避免误导。
- 结果必须带免责声明（对齐对方"结果仅供参考"）。
- API：`POST /api/marketing/insight`。

### 3.8 结果区与资产体系（P1-P2）

| 能力 | 方案 |
| --- | --- |
| 三级视图 | 本轮作品（本次生成）/ 会话历史（当前窗口，`sessionStorage` 或内存）/ 全部作品（落库 `MarketingTask` 记录） |
| 全部作品面板 | 在现有 `/assets` 基础上增加筛选：全部/本周/收藏/类型（文案/图片/视频）+ 搜索框 + 预览大小滑块 |
| 收藏 | `MarketingTask` 加 `isFavorite` 字段（需新增 Prisma migration） |
| 素材库跨页拖拽 | P2：结果卡片"+素材库"按钮先落地，拖拽后置 |

> **实现注意**：`MarketingTask` 与资产库（Asset）目前是**两张独立表**，"全部作品"聚合视图有两种落地路径：① 生成完成后将文案结果摘录存入资产表（推荐，口径统一）；② 视图层做 UNION 查询聚合。方案 ① 同时天然实现"营销结果入素材库"的闭环。

### 3.9 文案润色（P1，低成本）

复用现有 `PromptOptimizeDialog` + `usePromptOptimize` + `useAIService` 的提示词优化复用模式，新增润色模式：粘贴原文 → 选平台/语言 → 输出润色稿。作为文案创作 Tab 的子功能，不必独立 Tab。

---

## 四、分期实施计划

### Phase A（P0，约 3-5 天）—— 架构与语言基建

1. `Language` 分组扩展 + `LanguagePicker` 组件
2. `MarketingWorkspace` 重构为 Tab 工作台（先挂 1 个"文案创作"Tab，其余占位）
3. 输出类型多选 + 并发生成改造（`/api/marketing/generate`）
4. 结果区三级视图雏形（本轮 + 会话历史）

### Phase B（P1，约 5-7 天）—— 内容模块补全

5. 多语言翻译 Tab（成本最低，先出效果）
6. 文案润色子功能
7. SEO 优化 Tab（SeoEngine + API + 模型特性标签）
8. GEO 优化 Tab（GeoEngine + API）
9. 全部作品面板增强（筛选/搜索/收藏）

### Phase C（P2，视联网能力而定）—— 洞察与资产闭环

10. 市场洞察 Tab（依赖联网搜索接入方案）
11. 素材库跨页复用（结果入库 + 拖拽）
12. 版本更新公告组件（对齐对方体验细节，可选）

---

## 五、风险与决策点

| 决策点 | 建议 |
| --- | --- |
| 是否保留步骤向导 | 保留为"引导模式"开关，默认 Tab 模式 |
| 市场洞察联网数据源 | 需先确认现有 AI 服务（参考 `docs/AI_SERVICE_GUIDE.md`）是否支持 web search；不支持则该 Tab 降级为离线分析 + 明示 |
| 语言数量 | 一期 30 种，避免 UI 与 prompt 测试负担 |
| 并发限流 | 并发度 ≤3，复用 `src/lib/queue`，防止模型 RPM 超限 |
| 数据不编造红线 | 所有新引擎 Prompt 强制输出 `pendingFacts` 字段，UI 高亮展示"待补充" |

---

## 六、验收标准（对照对方页面）

- [ ] 5 个 Tab 齐全，单页切换，表单状态互不干扰
- [ ] 文案创作支持多输出类型勾选并发出结果
- [ ] 语言选择器分组弹窗、平台切换联动默认语言
- [ ] SEO/GEO 结果包含"待补充事实"而非编造内容
- [ ] 翻译支持 ≥3 种语言并发且保留原文排版
- [ ] 结果区可回看本轮与会话历史；全部作品可筛选搜索
- [ ] 生成按钮在未满足前置条件时禁用并给出提示文案（对齐对方交互细节）

---

## 附：对方页面截图存档

- 文案创作 Tab：`copywriting_page_01_main.png` / `copywriting_page_07_copywriting_tab.png`
- SEO 优化：`copywriting_page_02_seo.png`
- GEO 优化：`copywriting_page_03_geo.png`
- 多语言翻译：`copywriting_page_04_translate.png`
- 市场洞察：`copywriting_page_05_insight.png`
- 素材库抽屉：`copywriting_page_06_assets.png`
