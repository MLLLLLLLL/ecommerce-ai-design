import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toRuntimeAIConfig } from '@/lib/model-configs';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import {
  ALL_MODEL_TEST_KINDS,
  ModelTestKind,
  runModelTests,
} from '@/lib/ai/model-tester';

type RouteContext = { params: Promise<{ id: string }> };

const testBodySchema = z
  .object({
    kinds: z.array(z.enum(['connection', 'jsonMode', 'vision'])).min(1).optional(),
  })
  .strict();

/**
 * POST /api/model-configs/:id/test
 * 对模型执行 connection/jsonMode/vision 实测并保存结果（V3 5.2）。
 * 实测失败不修改 API Key，仅更新测试状态字段。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = testBodySchema.parse(await request.json().catch(() => ({})));

    const user = await getCurrentUser();
    const config = await prisma.modelConfig.findFirst({ where: { id, userId: user.id } });
    if (!config) {
      return NextResponse.json({ success: false, error: '模型不存在或无权限测试' }, { status: 404 });
    }

    const runtimeConfig = toRuntimeAIConfig(config);
    const client = new HttpTextCompletionClient({
      baseURL: runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model ?? 'gpt-4o',
      timeoutMs: 60_000,
      maxRetries: 0,
    });

    const kinds = (body.kinds ?? ALL_MODEL_TEST_KINDS) as ModelTestKind[];
    const { report, status } = await runModelTests(client, kinds);

    const failedMessages = kinds
      .filter((kind) => !report[kind].passed)
      .map((kind) => `${kind}: ${report[kind].message}`)
      .join('；');

    const updated = await prisma.modelConfig.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        testStatus: status,
        testedCapabilities: {
          connection: report.connection.passed,
          jsonMode: report.jsonMode.passed,
          vision: report.vision.passed,
        },
        testError: failedMessages ? failedMessages.slice(0, 800) : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        report,
        status,
        testedCapabilities: {
          connection: report.connection.passed,
          jsonMode: report.jsonMode.passed,
          vision: report.vision.passed,
        },
        lastTestedAt: updated.lastTestedAt?.toISOString() ?? null,
      },
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: '测试参数不合法' }, { status: 400 });
    }
    console.error('[API] Test model config error:', error);
    return NextResponse.json({ success: false, error: '模型测试失败' }, { status: 500 });
  }
}
