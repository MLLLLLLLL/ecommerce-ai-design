# 电商AI设计工作台 - 数据库设计文档

## 1. 数据库概述

### 1.1 数据库选型
- **数据库**：PostgreSQL 15+
- **ORM**：Prisma 5+
- **理由**：
  - 强大的JSON支持（存储工作流、参数等）
  - 全文搜索能力
  - 可靠的事务支持
  - 易于扩展到云端

### 1.2 Schema文件位置
```
prisma/schema.prisma
```

---

## 2. 完整Schema定义

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// 用户模型（为后期多用户做准备）
// ============================================

model User {
  id            String    @id @default(uuid())
  email         String?   @unique
  name          String    @default("本地用户")
  
  // 配置
  configs       Config[]
  
  // 资源
  assets        Asset[]
  folders       Folder[]
  
  // 项目
  projects      Project[]
  
  // 工作流
  workflows     WorkflowTemplate[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([email])
}

// ============================================
// 配置管理
// ============================================

model Config {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // 配置类型
  type          String    // 'ai_service' | 'preference' | 'system'
  
  // AI服务配置
  provider      String?   // 'alibaba' | 'openai' | 'custom'
  apiKey        String?   // 加密存储
  baseURL       String?
  model         String?
  
  // 偏好设置
  preferences   Json?     // { theme: 'dark', language: 'zh-CN', ... }
  
  isActive      Boolean   @default(true)
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@unique([userId, type, provider])
  @@index([userId, type])
}

// ============================================
// 资源库
// ============================================

model Asset {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // 文件信息
  filename        String
  originalName    String?
  filepath        String    @unique
  thumbnail       String?   // 缩略图路径
  filesize        Int       // 字节数
  
  // 图片属性
  width           Int?
  height          Int?
  format          String    // 'png' | 'jpg' | 'webp'
  
  // AI生成元数据
  prompt          String?   @db.Text
  negativePrompt  String?   @db.Text
  aiModel         String?   // 使用的AI模型
  aiProvider      String?   // 'alibaba' | 'openai' | 'custom'
  parameters      Json?     // 生成参数 { steps, seed, style, ... }
  
  // 组织结构
  folderId        String?
  folder          Folder?   @relation(fields: [folderId], references: [id], onDelete: SetNull)
  tags            Tag[]
  
  // 来源追踪
  source          String    // 'text-to-image' | 'image-to-image' | 'canvas' | 'workflow' | 'upload'
  sourceWorkflowId String?
  sourceWorkflow  WorkflowTemplate? @relation(fields: [sourceWorkflowId], references: [id], onDelete: SetNull)
  
  // 项目关联
  projectId       String?
  project         Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // 使用统计
  viewCount       Int       @default(0)
  useCount        Int       @default(0) // 在画布/工作流中使用的次数
  isFavorite      Boolean   @default(false)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([userId, createdAt])
  @@index([folderId])
  @@index([source])
  @@index([projectId])
  @@index([isFavorite])
  @@fulltext([filename, prompt])
}

model Folder {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  description String?
  color       String?   // 文件夹颜色标记
  
  // 层级结构
  parentId    String?
  parent      Folder?   @relation("FolderHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children    Folder[]  @relation("FolderHierarchy")
  
  // 资源
  assets      Asset[]
  
  // 排序
  sortOrder   Int       @default(0)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@unique([userId, parentId, name])
  @@index([userId, parentId])
}

model Tag {
  id          String    @id @default(uuid())
  name        String    @unique
  color       String?   // 十六进制颜色
  description String?
  
  assets      Asset[]
  
  useCount    Int       @default(0) // 使用次数
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([name])
}

// ============================================
// 项目管理
// ============================================

model Project {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  description String?   @db.Text
  cover       String?   // 封面图路径
  color       String?
  
  // 关联资源
  assets      Asset[]
  workflows   WorkflowTemplate[]
  canvases    CanvasTemplate[]
  
  // 状态
  status      String    @default("active") // 'active' | 'archived' | 'completed'
  
  // 统计
  assetCount  Int       @default(0)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([userId, status])
  @@index([createdAt])
}

// ============================================
// 工作流系统
// ============================================

model WorkflowTemplate {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  description String?   @db.Text
  category    String?   // 'generation' | 'processing' | 'batch' | 'custom'
  
  // 工作流定义
  definition  Json      // { nodes: [], edges: [], variables: {} }
  
  // 项目关联
  projectId   String?
  project     Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // 生成的资源
  assets      Asset[]
  
  // 版本控制
  version     Int       @default(1)
  
  // 使用统计
  runCount    Int       @default(0)
  lastRunAt   DateTime?
  
  // 是否为系统预设模板
  isTemplate  Boolean   @default(false)
  isPublic    Boolean   @default(false)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([userId, category])
  @@index([isTemplate, isPublic])
}

model WorkflowExecution {
  id            String    @id @default(uuid())
  workflowId    String
  
  // 执行状态
  status        String    // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress      Float     @default(0) // 0-100
  
  // 输入输出
  inputs        Json?
  outputs       Json?
  
  // 执行日志
  logs          Json[]    // [{ timestamp, level, message, nodeId }]
  
  // 错误信息
  error         String?   @db.Text
  errorNodeId   String?
  
  // 执行时间
  startedAt     DateTime?
  completedAt   DateTime?
  duration      Int?      // 毫秒
  
  createdAt     DateTime  @default(now())
  
  @@index([workflowId, status])
  @@index([createdAt])
}

// ============================================
// 画布系统
// ============================================

model CanvasTemplate {
  id          String    @id @default(uuid())
  userId      String?
  
  name        String
  description String?
  
  // 画布定义
  width       Int
  height      Int
  data        Json      // Fabric.js JSON
  
  // 缩略图
  thumbnail   String?
  
  // 项目关联
  projectId   String?
  project     Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // 模板属性
  isTemplate  Boolean   @default(false)
  category    String?   // 'product' | 'banner' | 'detail_page'
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([userId])
  @@index([projectId])
  @@index([isTemplate, category])
}

// ============================================
// 生成历史
// ============================================

model GenerationHistory {
  id            String    @id @default(uuid())
  userId        String
  
  // 生成类型
  type          String    // 'text-to-image' | 'image-to-image' | 'upscale' | 'remove-bg'
  
  // 输入参数
  prompt        String?   @db.Text
  negativePrompt String?  @db.Text
  inputImage    String?   // 参考图路径
  parameters    Json?
  
  // AI服务
  provider      String
  model         String?
  
  // 输出
  outputImages  String[]  // 生成的图片路径数组
  
  // 成本追踪（如果API返回）
  cost          Float?
  
  // 执行信息
  duration      Int?      // 毫秒
  status        String    // 'success' | 'failed'
  error         String?
  
  createdAt     DateTime  @default(now())
  
  @@index([userId, type])
  @@index([createdAt])
}

// ============================================
// 系统设置
// ============================================

model SystemSetting {
  id          String    @id @default(uuid())
  key         String    @unique
  value       Json
  description String?
  
  updatedAt   DateTime  @updatedAt
}
```

---

## 3. 数据表说明

### 3.1 核心表

#### User（用户）
- 为后期多用户做准备
- 当前可以只有一个默认本地用户
- 关联所有用户数据

#### Asset（资源）
- 存储所有图片素材
- 记录AI生成的元数据（prompt、参数等）
- 支持文件夹、标签、项目组织
- 全文搜索支持

#### Folder（文件夹）
- 支持多级嵌套
- 自引用关系（parent-children）
- 每个用户独立的文件夹树

#### Tag（标签）
- 多对多关系（一个素材多个标签）
- 记录使用次数便于推荐

### 3.2 工作流表

#### WorkflowTemplate（工作流模板）
- 存储工作流定义（节点、连接、变量）
- 支持版本控制
- 区分用户创建和系统预设

#### WorkflowExecution（工作流执行记录）
- 每次运行生成一条记录
- 记录执行状态、进度、日志
- 便于调试和追踪

### 3.3 辅助表

#### Config（配置）
- 存储API Key（加密）
- 用户偏好设置
- 支持多个AI服务配置

#### Project（项目）
- 组织相关的素材、工作流、画布
- 适合按活动/商品分类管理

#### CanvasTemplate（画布模板）
- 保存画布状态
- 支持模板复用

#### GenerationHistory（生成历史）
- 记录每次AI生成请求
- 便于查看历史参数和重新生成
- 成本追踪

---

## 4. 索引策略

### 4.1 主要索引

```sql
-- 资源库查询优化
CREATE INDEX idx_asset_user_created ON "Asset"("userId", "createdAt" DESC);
CREATE INDEX idx_asset_folder ON "Asset"("folderId");
CREATE INDEX idx_asset_source ON "Asset"("source");
CREATE INDEX idx_asset_project ON "Asset"("projectId");
CREATE INDEX idx_asset_favorite ON "Asset"("isFavorite");

-- 全文搜索
CREATE INDEX idx_asset_fulltext ON "Asset" USING GIN (to_tsvector('simple', "filename" || ' ' || COALESCE("prompt", '')));

-- 文件夹层级查询
CREATE INDEX idx_folder_user_parent ON "Folder"("userId", "parentId");

-- 工作流查询
CREATE INDEX idx_workflow_user_category ON "WorkflowTemplate"("userId", "category");
CREATE INDEX idx_workflow_execution_status ON "WorkflowExecution"("workflowId", "status");

-- 历史记录查询
CREATE INDEX idx_history_user_type ON "GenerationHistory"("userId", "type");
CREATE INDEX idx_history_created ON "GenerationHistory"("createdAt" DESC);
```

### 4.2 索引使用场景

| 查询场景 | 使用的索引 |
|---------|-----------|
| 按时间查看素材 | idx_asset_user_created |
| 按文件夹浏览 | idx_asset_folder |
| 按来源筛选 | idx_asset_source |
| 搜索文件名/提示词 | idx_asset_fulltext |
| 查看收藏夹 | idx_asset_favorite |
| 获取文件夹子项 | idx_folder_user_parent |

---

## 5. 数据关系图

```
User (用户)
  ├─ Config (配置) [1:N]
  ├─ Asset (资源) [1:N]
  │   ├─ Folder (文件夹) [N:1]
  │   ├─ Tag (标签) [N:N]
  │   ├─ Project (项目) [N:1]
  │   └─ WorkflowTemplate (来源工作流) [N:1]
  ├─ Folder (文件夹) [1:N]
  │   └─ Folder (子文件夹) [1:N, 递归]
  ├─ Project (项目) [1:N]
  │   ├─ Asset (资源) [1:N]
  │   ├─ WorkflowTemplate (工作流) [1:N]
  │   └─ CanvasTemplate (画布) [1:N]
  └─ WorkflowTemplate (工作流) [1:N]
      ├─ Asset (生成的资源) [1:N]
      └─ WorkflowExecution (执行记录) [1:N]
```

---

## 6. 数据迁移

### 6.1 初始化迁移

```bash
# 创建迁移文件
npx prisma migrate dev --name init

# 应用迁移
npx prisma migrate deploy

# 生成Prisma Client
npx prisma generate
```

### 6.2 迁移脚本示例

```prisma
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL DEFAULT '本地用户',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```

### 6.3 数据填充（Seed）

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 创建默认用户
  const user = await prisma.user.upsert({
    where: { email: 'local@user.com' },
    update: {},
    create: {
      email: 'local@user.com',
      name: '本地用户',
    },
  });

  // 创建默认标签
  const tags = ['商品主图', '营销海报', 'Banner', '详情页', '场景图'];
  for (const tagName of tags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: {
        name: tagName,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
      },
    });
  }

  // 创建系统设置
  await prisma.systemSetting.upsert({
    where: { key: 'storage_quota' },
    update: {},
    create: {
      key: 'storage_quota',
      value: 5 * 1024 * 1024 * 1024, // 5GB
      description: '单用户存储配额',
    },
  });

  console.log('数据库初始化完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

运行seed：
```bash
npx prisma db seed
```

---

## 7. 查询示例

### 7.1 常用查询

#### 获取用户所有素材（带分页）

```typescript
const assets = await prisma.asset.findMany({
  where: { userId },
  include: {
    folder: true,
    tags: true,
    project: true,
  },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * pageSize,
  take: pageSize,
});
```

#### 搜索素材

```typescript
const assets = await prisma.asset.findMany({
  where: {
    userId,
    OR: [
      { filename: { contains: query, mode: 'insensitive' } },
      { prompt: { contains: query, mode: 'insensitive' } },
      { tags: { some: { name: { contains: query } } } },
    ],
  },
  include: { tags: true },
});
```

#### 获取文件夹树

```typescript
const folders = await prisma.folder.findMany({
  where: { userId, parentId: null },
  include: {
    children: {
      include: {
        children: true, // 递归子文件夹
      },
    },
    _count: {
      select: { assets: true },
    },
  },
});
```

#### 获取工作流及执行历史

```typescript
const workflow = await prisma.workflowTemplate.findUnique({
  where: { id: workflowId },
  include: {
    assets: {
      take: 10,
      orderBy: { createdAt: 'desc' },
    },
  },
});

const executions = await prisma.workflowExecution.findMany({
  where: { workflowId },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

### 7.2 聚合查询

#### 统计存储空间使用

```typescript
const storageUsed = await prisma.asset.aggregate({
  where: { userId },
  _sum: { filesize: true },
});

const totalBytes = storageUsed._sum.filesize || 0;
const totalGB = totalBytes / (1024 * 1024 * 1024);
```

#### 统计各类型素材数量

```typescript
const stats = await prisma.asset.groupBy({
  by: ['source'],
  where: { userId },
  _count: true,
});

// 结果：
// [
//   { source: 'text-to-image', _count: 120 },
//   { source: 'image-to-image', _count: 45 },
//   { source: 'canvas', _count: 30 },
// ]
```

#### 最常用的标签

```typescript
const popularTags = await prisma.tag.findMany({
  orderBy: { useCount: 'desc' },
  take: 10,
  include: {
    _count: {
      select: { assets: true },
    },
  },
});
```

---

## 8. 性能优化

### 8.1 连接池配置

```typescript
// src/lib/db/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### 8.2 批量操作

```typescript
// 批量创建标签关联
await prisma.asset.update({
  where: { id: assetId },
  data: {
    tags: {
      connect: tagIds.map(id => ({ id })),
    },
  },
});

// 批量删除
await prisma.asset.deleteMany({
  where: {
    userId,
    id: { in: assetIds },
  },
});
```

### 8.3 事务处理

```typescript
// 原子操作：移动资源到新文件夹
await prisma.$transaction(async (tx) => {
  // 更新资源的文件夹
  await tx.asset.updateMany({
    where: { id: { in: assetIds } },
    data: { folderId: targetFolderId },
  });

  // 更新文件夹的资源计数
  const count = await tx.asset.count({
    where: { folderId: targetFolderId },
  });

  // ... 其他相关操作
});
```

---

## 9. 备份和恢复

### 9.1 数据备份

```bash
# 导出整个数据库
pg_dump -h localhost -U ecommerce_ai -d ecommerce_ai_db > backup.sql

# 仅导出数据
pg_dump -h localhost -U ecommerce_ai -d ecommerce_ai_db --data-only > data.sql

# 导出特定表
pg_dump -h localhost -U ecommerce_ai -d ecommerce_ai_db -t Asset > assets_backup.sql
```

### 9.2 数据恢复

```bash
# 恢复整个数据库
psql -h localhost -U ecommerce_ai -d ecommerce_ai_db < backup.sql

# 仅恢复数据
psql -h localhost -U ecommerce_ai -d ecommerce_ai_db < data.sql
```

### 9.3 自动备份脚本

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
DB_NAME="ecommerce_ai_db"

mkdir -p $BACKUP_DIR

pg_dump -h localhost -U ecommerce_ai -d $DB_NAME | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# 只保留最近7天的备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "备份完成: backup_$DATE.sql.gz"
```

---

## 10. 常见问题

### Q1: 如何处理文件删除后的数据库清理？

```typescript
// 删除资源时同时删除文件
async function deleteAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset) throw new Error('Asset not found');

  // 删除文件
  await fs.unlink(asset.filepath);
  if (asset.thumbnail) {
    await fs.unlink(asset.thumbnail);
  }

  // 删除数据库记录
  await prisma.asset.delete({
    where: { id: assetId },
  });
}
```

### Q2: 如何处理文件夹删除？

```typescript
// 递归删除文件夹及所有子项
async function deleteFolder(folderId: string) {
  await prisma.$transaction(async (tx) => {
    // 获取所有子文件夹（递归）
    const allFolderIds = await getAllSubFolderIds(folderId, tx);

    // 删除所有素材文件
    const assets = await tx.asset.findMany({
      where: { folderId: { in: allFolderIds } },
    });

    for (const asset of assets) {
      await fs.unlink(asset.filepath);
      if (asset.thumbnail) await fs.unlink(asset.thumbnail);
    }

    // 删除数据库记录
    await tx.asset.deleteMany({
      where: { folderId: { in: allFolderIds } },
    });

    await tx.folder.deleteMany({
      where: { id: { in: allFolderIds } },
    });
  });
}
```

### Q3: 如何优化大量素材的查询？

使用游标分页代替offset：

```typescript
const assets = await prisma.asset.findMany({
  take: 20,
  skip: 1, // 跳过游标本身
  cursor: {
    id: lastAssetId, // 上一页最后一个ID
  },
  orderBy: { createdAt: 'desc' },
});
```

---

**文档版本**：v1.0  
**创建日期**：2026-08-11  
**维护人员**：技术团队
