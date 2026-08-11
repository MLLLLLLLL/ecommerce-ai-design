# 部署文档

## 📋 概述

本文档说明如何部署电商 AI 设计工作台项目。

## 🖥️ 系统要求

### 硬件要求
- **CPU**: 4 核心及以上
- **内存**: 8GB RAM 及以上（推荐 16GB）
- **磁盘**: 20GB 可用空间（用于存储生成的图片）

### 软件要求
- **Node.js**: 20.x 或更高版本
- **PostgreSQL**: 15.x 或更高版本
- **pnpm**: 8.x 或更高版本（或 npm）
- **Git**: 用于克隆代码

## 📦 安装步骤

### 1. 克隆代码

```bash
git clone <repository-url>
cd ecommerce-ai-design
```

### 2. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下配置：

```bash
# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/ecommerce_ai_db"

# 加密密钥（用于加密 API Key）
# 生成方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET="your-32-byte-hex-secret"

# 应用配置
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 用户数据存储路径
USER_DATA_PATH="./user-data"
```

### 4. 启动 PostgreSQL

#### 使用 Docker（推荐）

```bash
docker-compose up -d
```

`docker-compose.yml` 内容：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: ecommerce-ai-db
    environment:
      POSTGRES_USER: ecommerce_ai
      POSTGRES_PASSWORD: your_password
      POSTGRES_DB: ecommerce_ai_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

#### 手动安装

参考 PostgreSQL 官方文档安装并创建数据库：

```sql
CREATE DATABASE ecommerce_ai_db;
CREATE USER ecommerce_ai WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ecommerce_ai_db TO ecommerce_ai;
```

### 5. 数据库迁移

```bash
# 生成 Prisma Client
npx prisma generate

# 运行迁移
npx prisma migrate deploy

# （可选）填充种子数据
npx prisma db seed
```

### 6. 创建用户数据目录

```bash
mkdir -p user-data/assets
mkdir -p user-data/config
mkdir -p user-data/temp
```

### 7. 构建项目

```bash
npm run build
```

### 8. 启动服务

#### 开发模式

```bash
npm run dev
```

#### 生产模式

```bash
npm run start
```

## 🚀 生产部署

### 使用 PM2（推荐）

安装 PM2：

```bash
npm install -g pm2
```

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'ecommerce-ai-design',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

启动应用：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 使用 Nginx 反向代理

创建 Nginx 配置 `/etc/nginx/sites-available/ecommerce-ai`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态文件
    location /_next/static {
        alias /path/to/ecommerce-ai-design/.next/static;
        expires 1y;
        access_log off;
    }

    # 用户上传的图片
    location /user-data {
        alias /path/to/ecommerce-ai-design/user-data;
        expires 30d;
        access_log off;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/ecommerce-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 使用 HTTPS（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🔧 配置 AI 服务

部署后，需要在应用中配置 AI 服务：

1. 访问 `http://your-domain.com/settings`
2. 点击「添加服务」
3. 选择提供商（OpenAI / 阿里百炼 / 中转站）
4. 填写 API Key 和相关配置
5. 测试连接

## 📊 监控与日志

### 查看 PM2 日志

```bash
pm2 logs ecommerce-ai-design
pm2 monit
```

### 查看应用日志

应用日志输出到标准输出，可通过 PM2 或系统日志查看。

### 数据库备份

```bash
# 备份
pg_dump -U ecommerce_ai ecommerce_ai_db > backup.sql

# 恢复
psql -U ecommerce_ai ecommerce_ai_db < backup.sql
```

## 🔐 安全建议

### 1. 修改默认密码
- 修改数据库密码
- 定期轮换加密密钥

### 2. 配置防火墙

```bash
# 允许 HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# 限制 PostgreSQL 仅本地访问
sudo ufw deny 5432
```

### 3. 限制文件权限

```bash
chmod 600 .env
chmod -R 755 user-data
```

### 4. 配置 CORS（如需要）

在 `next.config.ts` 中添加：

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'your-domain.com' },
        ],
      },
    ];
  },
};
```

## 📈 性能优化

### 1. 数据库优化

```sql
-- 创建索引（已在 Prisma Schema 中定义）
-- 定期清理
VACUUM ANALYZE;
```

### 2. 图片存储优化

- 定期清理临时文件
- 配置 CDN 加速图片访问
- 启用图片压缩

### 3. 缓存配置

考虑添加 Redis 用于：
- API 响应缓存
- 会话存储
- 队列任务

## 🐛 故障排查

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 检查连接
psql -U ecommerce_ai -h localhost -d ecommerce_ai_db
```

### 端口被占用

```bash
# 查看端口占用
lsof -i :3000

# 修改端口
PORT=3001 npm start
```

### 内存不足

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### 构建失败

```bash
# 清理缓存
rm -rf .next
rm -rf node_modules
npm install
npm run build
```

## 🔄 更新部署

```bash
# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 运行数据库迁移
npx prisma migrate deploy

# 重新构建
npm run build

# 重启服务
pm2 restart ecommerce-ai-design
```

## 📞 技术支持

遇到问题？

1. 查看项目文档：`/docs` 目录
2. 查看日志文件
3. 提交 Issue

## 📝 检查清单

部署完成后，检查以下项：

- [ ] 数据库连接正常
- [ ] 环境变量配置正确
- [ ] 用户数据目录可写
- [ ] 至少配置一个 AI 服务
- [ ] 能够访问主页面
- [ ] 能够生成图片
- [ ] 能够保存到资源库
- [ ] 图片访问正常
- [ ] 日志记录正常

---

**祝部署顺利！** 🚀
