import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toModelConfigSummary } from '@/lib/model-configs';
import { encryptServerSecret } from '@/lib/security/server-encryption';
import { assertSafeOutboundUrl } from '@/lib/security/safe-url';

const capabilitiesSchema = z.object({
  vision: z.boolean(),
  jsonMode: z.boolean(),
  ocr: z.boolean(),
  imageGeneration: z.boolean(),
  imageEditing: z.boolean().default(false),
  referenceImage: z.boolean().default(false),
});

const createModelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(40).default('openai'),
  relayType: z.enum(['openai', 'sd', 'toapis']).optional(),
  baseURL: z.url().max(500),
  apiKey: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(160),
  apiProtocol: z.enum(['chat_completions', 'responses']).default('chat_completions'),
  capabilities: capabilitiesSchema,
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    const configs = await prisma.modelConfig.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return NextResponse.json({ success: true, models: configs.map(toModelConfigSummary) });
  } catch (error) {
    console.error('[API] List model configs error:', error);
    return NextResponse.json({ success: false, error: '读取模型配置失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createModelSchema.parse(await request.json());
    await assertSafeOutboundUrl(body.baseURL);
    const user = await getCurrentUser();
    const baseURL = body.baseURL.replace(/\/+$/, '');

    const config = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.modelConfig.count({ where: { userId: user.id } });
      const shouldBeDefault = body.isDefault || existingCount === 0;
      if (shouldBeDefault) {
        await tx.modelConfig.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.modelConfig.create({
        data: {
          userId: user.id,
          name: body.name,
          provider: body.provider,
          relayType: body.relayType,
          baseURL,
          model: body.model,
          apiProtocol: body.apiProtocol,
          apiKeyEncrypted: encryptServerSecret(body.apiKey),
          capabilities: body.capabilities,
          isActive: body.isActive,
          isDefault: shouldBeDefault,
        },
      });
    });

    return NextResponse.json({ success: true, model: toModelConfigSummary(config) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: '模型配置字段不完整或格式不正确' }, { status: 400 });
    }
    if (error instanceof Error && /上游地址|内网|HTTPS|内部主机|解析/.test(error.message)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[API] Create model config error:', error);
    return NextResponse.json({ success: false, error: '保存模型配置失败' }, { status: 500 });
  }
}
