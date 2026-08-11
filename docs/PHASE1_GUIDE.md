# Phase 1 执行指南

## 📋 概述
根据 development_plan.md，Phase 1包含Week 1-2的任务，主要完成项目初始化和基础架构搭建。

---

## Week 1: 项目搭建

### Day 1-2: 环境准备 ✅ 开始

#### 步骤1: 检查环境

```bash
# 检查Node.js版本（需要20+）
node --version

# 检查pnpm是否安装
pnpm --version

# 如果未安装pnpm，运行：
npm install -g pnpm
```

#### 步骤2: 创建Next.js项目

**方式1: 使用脚本（推荐）**
```bash
cd /home/admin123/桌面/kaifa
./create-project.sh
```

**方式2: 手动创建**
```bash
cd /home/admin123/桌面/kaifa
pnpm create next-app@latest ecommerce-ai-design \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --use-pnpm
```

创建时的选项：
- ✅ TypeScript
- ✅ ESLint
- ✅ Tailwind CSS
- ✅ `src/` directory: **No**（使用app目录）
- ✅ App Router
- ✅ Import alias: `@/*`
- ✅ pnpm

#### 步骤3: 进入项目并安装核心依赖

```bash
cd ecommerce-ai-design

# 安装数据库相关
pnpm add prisma @prisma/client

# 安装状态管理
pnpm add zustand

# 安装数据验证
pnpm add zod

# 安装队列管理
pnpm add p-queue

# 安装事件系统
pnpm add eventemitter3

# 安装图片处理
pnpm add sharp

# 安装数据请求
pnpm add @tanstack/react-query

# 安装UI组件库依赖
pnpm add class-variance-authority clsx tailwind-merge
pnpm add lucide-react
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-select @radix-ui/react-tabs
pnpm add @radix-ui/react-toast @radix-ui/react-alert-dialog

# 安装开发依赖
pnpm add -D @types/node
```

#### 步骤4: 复制文档到项目

```bash
# 创建docs目录
mkdir -p docs

# 复制所有文档
cp /home/admin123/桌面/kaifa/电商/*.md ./docs/

# 检查
ls -la docs/
```

#### 验收标准
- ✅ Next.js项目可以运行 `pnpm dev`
- ✅ 所有依赖安装成功
- ✅ 文档已复制到docs目录

---

### Day 3-4: 目录结构与配置文件

#### 步骤1: 创建src目录结构

```bash
# 创建完整的目录结构
mkdir -p src/app/{api,\(dashboard\)}
mkdir -p src/app/api/{ai,assets,workflow,config}
mkdir -p src/app/\(dashboard\)/{text-to-image,image-to-image,canvas,workflow,assets,settings}
mkdir -p src/components/{ui,text-to-image,image-to-image,canvas,workflow,assets,shared,ai}
mkdir -p src/lib/{ai/adapters,canvas,workflow,storage,db,security,utils}
mkdir -p src/hooks
mkdir -p src/stores
mkdir -p src/types
mkdir -p src/styles
mkdir -p prisma
mkdir -p user-data/{assets,config,temp}

# 创建.gitkeep文件保持空目录
find src -type d -empty -exec touch {}/.gitkeep \;
find user-data -type d -exec touch {}/.gitkeep \;
```

#### 步骤2: 配置TypeScript

创建 `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### 步骤3: 配置环境变量

创建 `.env.example`:
```bash
cat > .env.example << 'EOFENV'
# 数据库
DATABASE_URL="postgresql://ecommerce_ai:dev_password@localhost:5432/ecommerce_ai_db"

# 加密密钥（生成新的密钥）
ENCRYPTION_SECRET="请运行 node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" 生成"

# 应用配置
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 用户数据路径
USER_DATA_PATH="./user-data"
EOFENV

# 复制为实际的.env文件
cp .env.example .env

# 生成加密密钥并写入.env
echo "生成加密密钥..."
node -e "console.log('ENCRYPTION_SECRET=\"' + require('crypto').randomBytes(32).toString('hex') + '\"')" >> .env.temp
# 手动替换.env中的加密密钥
```

#### 步骤4: 配置ESLint和Prettier

创建 `.eslintrc.json`:
```json
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

创建 `.prettierrc`:
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

创建 `.prettierignore`:
```
node_modules
.next
out
build
dist
*.log
.env*
```

#### 验收标准
- ✅ 目录结构完整
- ✅ TypeScript配置正确
- ✅ 环境变量配置完成
- ✅ 代码规范工具配置完成

---

### Day 5: Docker环境

#### 步骤1: 创建docker-compose.yml

```bash
cat > docker-compose.yml << 'EOFDOCKER'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: ecommerce-ai-db
    environment:
      POSTGRES_USER: ecommerce_ai
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: ecommerce_ai_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce_ai"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
    driver: local
EOFDOCKER
```

#### 步骤2: 启动Docker

```bash
# 启动PostgreSQL
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f postgres

# 测试连接
docker exec -it ecommerce-ai-db psql -U ecommerce_ai -d ecommerce_ai_db -c "SELECT version();"
```

#### 验收标准
- ✅ Docker容器运行正常
- ✅ 数据库连接成功
- ✅ 可以执行SQL查询

---

## Week 2: 数据库设计与基础UI

### Day 1-3: 数据库Schema

#### 步骤1: 初始化Prisma

```bash
# 初始化Prisma
npx prisma init

# 这会创建：
# - prisma/schema.prisma
# - .env（如果不存在）
```

#### 步骤2: 创建Prisma Schema

将 `docs/database_design.md` 中的完整Schema复制到 `prisma/schema.prisma`

关键部分：
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 完整的Schema见 docs/database_design.md
```

#### 步骤3: 创建迁移

```bash
# 创建初始迁移
npx prisma migrate dev --name init

# 生成Prisma Client
npx prisma generate
```

#### 步骤4: 创建Seed脚本

创建 `prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始数据填充...');

  // 创建默认用户
  const user = await prisma.user.upsert({
    where: { email: 'local@user.com' },
    update: {},
    create: {
      email: 'local@user.com',
      name: '本地用户',
    },
  });

  console.log('✅ 默认用户创建成功:', user.id);

  // 创建默认标签
  const tags = ['商品主图', '营销海报', 'Banner', '详情页', '场景图'];
  for (const tagName of tags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: {
        name: tagName,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      },
    });
  }

  console.log('✅ 默认标签创建成功');
}

main()
  .catch((e) => {
    console.error('❌ Seed失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

在 `package.json` 中添加：
```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

安装ts-node：
```bash
pnpm add -D ts-node
```

运行Seed：
```bash
npx prisma db seed
```

#### 验收标准
- ✅ Prisma迁移成功
- ✅ Prisma Client生成
- ✅ Seed数据创建成功
- ✅ 可以查询数据库

---

### Day 4-5: 基础UI组件

#### 步骤1: 安装shadcn/ui

```bash
# 初始化shadcn/ui
npx shadcn-ui@latest init

# 选择配置：
# - Style: Default
# - Base color: Slate
# - CSS variables: yes
```

#### 步骤2: 添加基础组件

```bash
# 批量添加组件
npx shadcn-ui@latest add button input select dialog tabs card toast dropdown-menu alert progress separator label textarea scroll-area
```

#### 步骤3: 创建布局组件

创建 `src/components/shared/DashboardLayout.tsx`:
```typescript
import { ReactNode } from 'react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r">
        <div className="p-4">
          <h1 className="text-xl font-bold">电商AI工作台</h1>
        </div>
        {/* Sidebar内容后续添加 */}
      </aside>
      
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">欢迎</h2>
          </div>
        </header>
        
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
```

#### 步骤4: 更新主页面

修改 `src/app/page.tsx`:
```typescript
import { DashboardLayout } from '@/components/shared/DashboardLayout';

export default function Home() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">电商AI设计工作台</h1>
        <p className="text-gray-600">
          Phase 1 基础架构搭建完成 ✅
        </p>
      </div>
    </DashboardLayout>
  );
}
```

#### 步骤5: 测试运行

```bash
# 启动开发服务器
pnpm dev

# 访问 http://localhost:3000
# 应该看到基础布局
```

#### 验收标准
- ✅ shadcn/ui安装成功
- ✅ 基础组件可用
- ✅ 布局组件正常显示
- ✅ 开发服务器运行正常

---

## ✅ Phase 1 完成检查清单

### Week 1
- [ ] Day 1-2: 环境准备
  - [ ] Next.js项目创建
  - [ ] 核心依赖安装
  - [ ] 文档复制
  
- [ ] Day 3-4: 目录结构与配置
  - [ ] 完整目录结构
  - [ ] TypeScript配置
  - [ ] 环境变量配置
  - [ ] 代码规范工具
  
- [ ] Day 5: Docker环境
  - [ ] docker-compose.yml
  - [ ] PostgreSQL容器运行
  - [ ] 数据库连接测试

### Week 2
- [ ] Day 1-3: 数据库Schema
  - [ ] Prisma初始化
  - [ ] Schema创建
  - [ ] 迁移执行
  - [ ] Seed脚本
  
- [ ] Day 4-5: 基础UI
  - [ ] shadcn/ui安装
  - [ ] 基础组件添加
  - [ ] 布局组件创建
  - [ ] 页面运行测试

---

## 🎯 Milestone 1: 基础架构完成

完成标准：
- ✅ 项目可以正常运行
- ✅ 数据库初始化完成
- ✅ 基础UI组件可用
- ✅ 开发环境完整

完成后进入 **Phase 2: 核心基础设施（Week 3-4）**

---

## 📝 提交规范

每完成一个步骤，建议提交代码：

```bash
# Week 1 Day 1-2完成后
git add .
git commit -m "chore: 初始化Next.js项目并安装核心依赖"

# Week 1 Day 3-4完成后
git add .
git commit -m "chore: 配置目录结构和开发工具"

# Week 1 Day 5完成后
git add .
git commit -m "chore: 配置Docker和PostgreSQL环境"

# Week 2 Day 1-3完成后
git add .
git commit -m "feat: 完成数据库Schema设计和迁移"

# Week 2 Day 4-5完成后
git add .
git commit -m "feat: 集成shadcn/ui和基础布局组件"
```

---

## 🚨 常见问题

### Q1: pnpm create next-app失败
```bash
# 清除npm缓存
pnpm store prune

# 或使用npx
npx create-next-app@latest ecommerce-ai-design
```

### Q2: Docker容器无法启动
```bash
# 检查端口占用
lsof -i :5432

# 停止占用的服务
sudo systemctl stop postgresql

# 重新启动
docker-compose down
docker-compose up -d
```

### Q3: Prisma迁移失败
```bash
# 重置数据库
npx prisma migrate reset

# 重新迁移
npx prisma migrate dev
```

### Q4: 端口3000被占用
```bash
# 查看占用
lsof -i :3000

# 或修改端口
pnpm dev -p 3001
```

---

**执行人员**: ___________  
**开始日期**: ___________  
**完成日期**: ___________  
**状态**: 🔄 进行中 / ✅ 已完成
