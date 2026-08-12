import { prisma } from '@/lib/db/prisma';

/**
 * 当前项目尚未接入登录系统。统一使用可替换的本地用户解析，避免各接口自行
 * findFirst() 造成配置与任务归属不一致。接入认证后仅替换本函数即可。
 */
export async function getCurrentUser() {
  return prisma.user.upsert({
    where: { email: 'local@user.com' },
    update: {},
    create: {
      email: 'local@user.com',
      name: '本地用户',
    },
  });
}
