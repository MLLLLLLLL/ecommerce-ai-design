# 电商 AI 设计工作台

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-production--ready-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

一个功能完整的电商 AI 设计工作台，支持 AI 图片生成、资源管理、画布编辑和工作流编排。

[快速开始](#快速开始) • [功能特性](#功能特性) • [文档](#文档) • [技术栈](#技术栈)

</div>

---

## ✨ 功能特性

### 🎨 AI 图片生成
- **文生图**: 根据文本描述生成图片
- **图生图**: 基于原图生成变体或编辑
- **多 AI 服务**: 支持 OpenAI、阿里百炼、自定义中转站

### 📚 资源管理
- **标签系统**: 自定义标签，颜色分类
- **文件夹**: 树形结构，层级管理
- **批量操作**: 批量删除、移动、打标签
- **高级搜索**: 提示词搜索、来源筛选

### 🖼️ 无限画布
- **多种工具**: 选择、形状、文字、图片
- **图层管理**: 显示/隐藏、锁定、排序
- **历史记录**: 撤销/重做（50 个状态）
- **导入导出**: PNG/JPEG/JSON

### 🔄 工作流编排
- **可视化编辑**: 拖拽式节点连接
- **11 种节点**: 输入、AI 处理、图片处理、逻辑、输出
- **自动执行**: 拓扑排序算法
- **模板保存**: JSON 格式保存/加载

---

## 🚀 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 15+
- pnpm (推荐) 或 npm

### 安装步骤

```bash
# 1. 克隆代码
git clone https://github.com/YOUR_USERNAME/ecommerce-ai-design.git
cd ecommerce-ai-design

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填写数据库连接和加密密钥

# 4. 启动 PostgreSQL（Docker）
docker-compose up -d

# 5. 数据库迁移
npx prisma generate
npx prisma migrate deploy

# 6. 启动开发服务器
npm run dev

# 7. 访问应用
# 打开浏览器访问 http://localhost:3000
```

### 配置 AI 服务

1. 访问 `/settings` 页面
2. 点击「添加服务」
3. 选择提供商（OpenAI/阿里百炼/中转站）
4. 填写 API Key
5. 测试连接并保存

---

## 📖 文档

- **[部署文档](docs/DEPLOYMENT.md)** - 完整的生产部署指南
- **[用户手册](docs/USER_GUIDE.md)** - 详细的使用教程
- **[API 文档](docs/PHASE3_COMPLETION_REPORT.md)** - API 接口说明
- **[开发计划](docs/development_plan.md)** - Phase 1-7 开发计划

---

## 🛠️ 技术栈

### 前端
- **框架**: Next.js 16.3 (App Router)
- **语言**: TypeScript 5
- **UI**: Tailwind CSS 4 + shadcn/ui
- **画布**: Fabric.js
- **工作流**: React Flow
- **状态**: Zustand

### 后端
- **运行时**: Next.js API Routes
- **数据库**: PostgreSQL 15 + Prisma
- **图片**: Sharp
- **队列**: p-queue

---

## 📊 项目结构

```
ecommerce-ai-design/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Dashboard 路由组
│   │   │   ├── text-to-image/  # 文生图页面
│   │   │   ├── image-to-image/ # 图生图页面
│   │   │   ├── assets/         # 资源库页面
│   │   │   ├── canvas/         # 画布页面
│   │   │   ├── workflow/       # 工作流页面
│   │   │   └── settings/       # 设置页面
│   │   └── api/                # API 路由
│   ├── components/             # React 组件
│   ├── lib/                    # 核心库
│   │   ├── ai/                 # AI 服务层
│   │   ├── canvas/             # 画布管理
│   │   ├── workflow/           # 工作流引擎
│   │   ├── queue/              # 队列管理
│   │   └── storage/            # 文件存储
│   ├── hooks/                  # React Hooks
│   ├── stores/                 # Zustand 状态
│   └── types/                  # TypeScript 类型
├── prisma/                     # Prisma Schema
├── docs/                       # 项目文档
└── public/                     # 静态资源
```

---

## 🎯 核心功能

### AI 服务适配器
```typescript
// 统一的适配器接口
interface AIServiceAdapter {
  textToImage(params): Promise<string[]>
  imageToImage(params): Promise<string[]>
}

// 支持的提供商
- OpenAI (DALL-E 2/3)
- 阿里百炼（通义万相）
- 自定义中转站
```

### 工作流引擎
```typescript
// 拓扑排序 + 节点执行
class WorkflowEngine {
  topologicalSort(): string[]
  execute(): Promise<Result>
}

// 11 种节点类型
- 输入节点（3 种）
- AI 处理（3 种）
- 图片处理（3 种）
- 逻辑控制（1 种）
- 输出节点（1 种）
```

### 画布管理
```typescript
// Fabric.js 封装
class CanvasManager {
  undo(): void
  redo(): void
  addImage(url): void
  exportToImage(): string
}
```

---

## 📸 截图

### 文生图
![文生图](docs/screenshots/text-to-image.png)

### 资源库
![资源库](docs/screenshots/assets.png)

### 无限画布
![画布](docs/screenshots/canvas.png)

### 工作流编排
![工作流](docs/screenshots/workflow.png)

---

## 🔧 配置

### 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/ecommerce_ai_db"

# 加密密钥（32 字节）
ENCRYPTION_SECRET="your-32-byte-hex-secret"

# 应用配置
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 数据存储
USER_DATA_PATH="./user-data"
```

---

## 📈 性能指标

- **并发支持**: 50 个任务同时执行
- **历史记录**: 50 个状态（撤销/重做）
- **文件存储**: 本地存储 + 缩略图
- **队列管理**: p-queue 实现

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

```bash
# 1. Fork 本仓库
# 2. 创建特性分支
git checkout -b feature/your-feature

# 3. 提交更改
git commit -m "feat: 添加新功能"

# 4. 推送到分支
git push origin feature/your-feature

# 5. 创建 Pull Request
```

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [Next.js](https://nextjs.org/)
- [Fabric.js](http://fabricjs.com/)
- [React Flow](https://reactflow.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)

---

## 📞 联系方式

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/ecommerce-ai-design/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/ecommerce-ai-design/discussions)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！**

Made with ❤️ by Claude (Kiro AI Assistant)

</div>
