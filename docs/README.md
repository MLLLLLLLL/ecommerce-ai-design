# 电商AI设计工作台

一个面向电商设计师和运营人员的AI驱动设计工作台，提供从创意生成到素材管理的一站式解决方案。

## 📋 项目文档

本项目包含完整的开发文档体系：

### 产品与设计文档

#### 1. [PRD.md](./PRD.md) - 产品需求文档
完整的产品规划：
- 产品定位和核心价值
- 目标用户画像
- 5大核心功能详细需求
- 产品路线图（3个阶段，22-28周）

#### 2. [technical_design.md](./technical_design.md) - 技术设计文档
详细的技术架构设计：
- 系统架构图
- 技术栈选型（Next.js + React + TypeScript + PostgreSQL）
- 核心模块设计
- 中转站支持
- 性能优化与安全设计

#### 3. [database_design.md](./database_design.md) - 数据库设计文档
完整的数据库设计：
- 完整的Prisma Schema定义
- 10+ 数据表设计
- 索引策略
- 查询示例
- 备份恢复方案

#### 4. [module_design.md](./module_design.md) - 功能模块划分文档
详细的模块划分和职责：
- 5大核心功能模块详细设计
- 组件结构
- API接口设计
- 状态管理方案
- 模块间交互流程

### 技术实现文档

#### 5. [api_relay_station_guide.md](./api_relay_station_guide.md) - 中转站接入指南
详细的中转站接入方案：
- OpenAI兼容格式详解
- 主流中转站项目介绍（One-API、New-API等）
- 完整适配器实现代码
- 配置示例和错误处理

#### 6. [config_hot_reload_high_concurrency.md](./config_hot_reload_high_concurrency.md) - 配置热更新与高并发
生产级高性能特性设计：
- **配置热更新**：无需重启，配置立即生效
- **高并发支持**：默认50并发，可调整至100+
- **无速率限制**：全速执行
- 批量生成优化（支持1000+任务）
- 监控面板和性能指标

### 开发管理文档

#### 7. [development_plan.md](./development_plan.md) - 开发流程计划文档 ⭐新增
完整的开发执行计划：
- **详细的时间线**：28周开发计划，精确到天
- **分阶段任务清单**：每个Phase的具体任务
- **代码实现示例**：关键模块的代码片段
- **里程碑检查点**：7个关键里程碑
- **风险管理**：技术风险和进度风险应对
- **验收标准**：功能、代码质量、文档要求

## 🎯 核心功能

### 1. 文生图（Text-to-Image）
- 输入文字描述，AI生成商品图、营销海报等
- 支持**阿里百炼、OpenAI、各种中转站**
- 电商场景优化（商品主图、白底图、场景图模板）

### 2. 图生图（Image-to-Image）
- 基于参考图进行AI再创作
- 背景替换、风格转换、局部重绘
- 一键去背景、图片超分辨率

### 3. 无限画布（Infinite Canvas）
- 自由排版多素材拼接
- 图层管理、对齐工具
- 导出多种格式（PNG/JPG/WebP）

### 4. 工作流编排（Workflow）
- 类似ComfyUI的节点式编排
- 20种节点类型（输入、AI处理、图片处理、文字、逻辑控制）
- 支持条件分支、循环等高级逻辑

### 5. 资源库（Asset Library）
- 本地存储用户素材（单用户5GB）
- 文件夹、标签、全文搜索
- 批量操作、使用追踪

## ⚡ 高性能特性

### 配置热更新
- ✅ **无需重启**：修改API配置后立即生效
- ✅ **事件驱动**：配置变更自动通知所有组件
- ✅ **平滑切换**：正在执行的请求不受影响
- ✅ **多服务管理**：灵活切换不同AI服务

### 高并发支持
- ✅ **50并发**：默认50个请求同时执行
- ✅ **可调整**：支持动态调整至100+并发
- ✅ **无限流**：无速率限制，全速执行
- ✅ **自动重试**：网络错误和临时故障自动重试
- ✅ **批量优化**：支持1000+图片批量生成
- ✅ **实时监控**：队列状态、进度、成功率可视化

### 性能对比

| 模式 | 并发数 | 100张图片耗时 | 1000张图片耗时 |
|------|--------|-------------|---------------|
| 串行 | 1 | ~10分钟 | ~100分钟 |
| 普通并发 | 5 | ~2分钟 | ~20分钟 |
| **高并发** | **50** | **~12秒** ⚡ | **~2分钟** ⚡ |

## 🛠️ 技术栈

### 前端
- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5+
- **UI**: React 18 + Tailwind CSS + shadcn/ui
- **状态管理**: Zustand
- **数据请求**: TanStack Query
- **画布**: Fabric.js
- **工作流**: React Flow
- **队列管理**: p-queue ⚡
- **事件系统**: EventEmitter3

### 后端
- **运行时**: Node.js 20+
- **数据库**: PostgreSQL 15+
- **ORM**: Prisma 5+
- **图片处理**: sharp

## 📅 开发路线图

详细的开发计划请查看 [development_plan.md](./development_plan.md)

### Phase 1: 项目初始化与基础架构（Week 1-2）
- ✅ 项目搭建
- ✅ 数据库设计
- ✅ 基础UI组件

### Phase 2: 核心基础设施（Week 3-4）
- ✅ AI服务层实现
- ✅ 配置管理系统 ⚡
- ✅ 高并发队列系统 ⚡

### Phase 3: 文生图模块与资源库基础（Week 5-8）
- ✅ 文生图功能
- ✅ 资源库基础功能
- ✅ 配置管理UI

### Phase 4: 图生图与资源库完整版（Week 9-12）
- 图生图功能
- 完整资源库（搜索、标签）

### Phase 5: 无限画布（Week 13-16）
- 画布引擎
- 编辑工具
- 导出功能

### Phase 6: 工作流编排（Week 17-24）
- 工作流引擎
- 20种节点实现
- 工作流UI

### Phase 7: 测试与优化（Week 25-28）
- 单元测试
- 集成测试
- 性能优化
- 文档完善

**总开发周期**：22-28周（约5-7个月）

## 🚀 快速开始

### 前置要求
- Node.js 20+
- pnpm 8+
- PostgreSQL 15+ (可用Docker)

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd ecommerce-ai-design

# 2. 安装依赖
pnpm install

# 3. 启动数据库
docker-compose up -d postgres

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 5. 初始化数据库
pnpm prisma migrate dev
pnpm prisma db seed

# 6. 启动开发服务器
pnpm dev
```

访问 http://localhost:3000

## 📦 依赖包

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "typescript": "^5.0.0",
    "prisma": "^5.0.0",
    "zustand": "^4.0.0",
    "p-queue": "^8.0.0",
    "eventemitter3": "^5.0.0",
    "sharp": "^0.33.0",
    "fabric": "^5.0.0",
    "reactflow": "^11.0.0",
    "zod": "^3.0.0"
  }
}
```

完整的依赖安装步骤请查看 [development_plan.md](./development_plan.md)

## 👥 参与开发

### 开始开发前

1. **阅读文档**
   - [PRD.md](./PRD.md) - 了解产品需求
   - [technical_design.md](./technical_design.md) - 了解技术架构
   - [development_plan.md](./development_plan.md) - 了解开发流程

2. **环境准备**
   - 按照 development_plan.md 中的 Week 1 Day 1-2 步骤操作

3. **选择任务**
   - 查看 development_plan.md 中的任务清单
   - 从标记为当前Phase的任务开始

### 开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature

# 2. 开发并提交
git add .
git commit -m "feat: your feature description"

# 3. 推送并创建PR
git push origin feature/your-feature
```

### 代码规范

- ✅ 使用TypeScript
- ✅ 遵循ESLint规则
- ✅ 编写单元测试
- ✅ 添加必要注释

详细规范请查看 [development_plan.md](./development_plan.md) 的"代码审查标准"章节

## 🤝 贡献指南

### Git提交规范
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
perf: 性能优化
```

### 开发建议
1. 遵循 [development_plan.md](./development_plan.md) 中的开发流程
2. 每完成一个功能模块，更新任务清单
3. 编写单元测试，保持覆盖率>80%
4. 提交前运行 `pnpm lint` 和 `pnpm test`

## 📄 许可证

[MIT License](./LICENSE)

## 📞 联系方式

- 项目负责人: [您的名字]
- 邮箱: [您的邮箱]
- 问题反馈: [GitHub Issues](https://github.com/your-repo/issues)

## 🌟 Star History

如果这个项目对你有帮助，请给一个⭐️支持一下！

---

**文档版本**: v2.1  
**最后更新**: 2026-08-11  
**主要变更**: 新增开发流程计划文档
