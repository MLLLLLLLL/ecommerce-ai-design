import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toModelConfigSummary } from '@/lib/model-configs';
import { encryptServerSecret } from '@/lib/security/server-encryption';
import { inferModelCapabilities } from '@/types/model-config';

// ============================================
// 旧图片服务配置迁移（V2 5.2）
// 旧图片配置保存在浏览器 localStorage（useConfigStore）。
// 用户在设置页预览并显式确认后，由前端一次性提交到本接口，
// 服务端加密保存 API Key 并创建 ModelConfig。
// 迁移失败不删除旧配置；旧配置的清理由用户在设置页单独操作。
// ============================================

const migrateServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.enum(['openai', 'alibaba', 'relay', 'toapis']),
  relayType: z.enum(['openai', 'sd', 'toapis']).optional(),
  baseURL: z.url().max(500).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  apiKey: z.string().trim().min(1).max(2000),
});

const migrateBodySchema = z
  .object({
    services: z.array(migrateServiceSchema).min(1).max(20),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = migrateBodySchema.parse(await request.json());
    const user = await getCurrentUser();

    const created = [];
    const skipped = [];

    for (const service of body.services) {
      // 同名配置视为已迁移，跳过而不覆盖
      const existing = await prisma.modelConfig.findFirst({
        where: { userId: user.id, name: service.name },
      });
      if (existing) {
        skipped.push({ name: service.name, reason: '已存在同名模型配置' });
        continue;
      }

      const capabilities = inferModelCapabilities(service.model ?? service.name);
      // 迁移来源是图片服务，强制开启图片生成类能力标签，实测状态待用户实测
      capabilities.imageGeneration = true;

      const config = await prisma.modelConfig.create({
        data: {
          userId: user.id,
          name: service.name,
          provider: service.provider,
          relayType: service.relayType,
          baseURL: (service.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
          model: service.model ?? (service.provider === 'toapis' || service.relayType === 'toapis' ? 'gpt-image-2' : service.name),
          apiKeyEncrypted: encryptServerSecret(service.apiKey),
          capabilities: capabilities as unknown as Prisma.InputJsonValue,
          isActive: true,
          isDefault: false,
        },
      });
      created.push(toModelConfigSummary(config));
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped, message: '迁移完成。请在设置页对迁移后的模型执行能力实测后再用于营销助手2。' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: '迁移数据格式不正确' }, { status: 400 });
    }
    console.error('[API] Migrate image configs error:', error);
    return NextResponse.json({ success: false, error: '迁移失败，旧配置未被修改' }, { status: 500 });
  }
}
