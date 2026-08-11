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
  console.log('\n🎉 数据库初始化完成！');
}

main()
  .catch((e) => {
    console.error('❌ Seed失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
