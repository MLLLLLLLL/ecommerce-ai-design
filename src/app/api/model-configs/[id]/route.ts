import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toModelConfigSummary } from '@/lib/model-configs';
import { encryptServerSecret } from '@/lib/security/server-encryption';

const capabilitiesSchema = z.object({
  vision: z.boolean(),
  jsonMode: z.boolean(),
  ocr: z.boolean(),
  imageGeneration: z.boolean(),
  imageEditing: z.boolean().default(false),
  referenceImage: z.boolean().default(false),
});

const updateModelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(40).default('openai'),
  baseURL: z.url().max(500),
  apiKey: z.string().trim().max(2000).optional(),
  model: z.string().trim().min(1).max(160),
  apiProtocol: z.enum(['chat_completions', 'responses']).default('chat_completions'),
  capabilities: capabilitiesSchema,
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = updateModelSchema.parse(await request.json());
    const user = await getCurrentUser();
    const existing = await prisma.modelConfig.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: '模型不存在或无权限修改' }, { status: 404 });
    }

    const config = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.modelConfig.updateMany({
          where: { userId: user.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.modelConfig.update({
        where: { id },
        data: {
          name: body.name,
          provider: body.provider,
          baseURL: body.baseURL.replace(/\/+$/, ''),
          model: body.model,
          apiProtocol: body.apiProtocol,
          capabilities: body.capabilities,
          isActive: body.isActive,
          isDefault: body.isDefault,
          ...(body.apiKey ? { apiKeyEncrypted: encryptServerSecret(body.apiKey) } : {}),
        },
      });
    });

    return NextResponse.json({ success: true, model: toModelConfigSummary(config) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: '模型配置字段不完整或格式不正确' }, { status: 400 });
    }
    console.error('[API] Update model config error:', error);
    return NextResponse.json({ success: false, error: '更新模型配置失败' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const result = await prisma.modelConfig.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) {
      return NextResponse.json({ success: false, error: '模型不存在或无权限删除' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete model config error:', error);
    return NextResponse.json({ success: false, error: '删除模型配置失败' }, { status: 500 });
  }
}
