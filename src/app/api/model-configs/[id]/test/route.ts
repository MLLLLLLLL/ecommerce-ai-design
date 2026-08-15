import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toRuntimeAIConfig, toTestedCapabilities } from '@/lib/model-configs';
import { createAIService } from '@/lib/ai/factory';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';
import {
  IMAGE_MODEL_TEST_KINDS,
  ModelTestKind,
  runImageModelTests,
  runModelTests,
} from '@/lib/ai/model-tester';

type RouteContext = { params: Promise<{ id: string }> };

const ALL_TEST_KINDS = [
  'connection',
  'jsonMode',
  'vision',
  'imageGeneration',
  'imageEditing',
  'referenceImage',
] as const;

const testBodySchema = z
  .object({
    kinds: z.array(z.enum(ALL_TEST_KINDS)).min(1).optional(),
  })
  .strict();

/**
 * POST /api/model-configs/:id/test
 * 对模型执行文本（connection/jsonMode/vision）与图片
 * （imageGeneration/imageEditing/referenceImage）实测并保存结果。
 * 实测失败不修改 API Key，仅更新测试状态字段；
 * testedCapabilities 与既有结果合并，避免单类测试擦除另一类结果。
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
    const kinds = (body.kinds ?? ['connection', 'jsonMode', 'vision']) as ModelTestKind[];
    const textKinds = kinds.filter((kind) => !IMAGE_MODEL_TEST_KINDS.includes(kind));
    const imageKinds = kinds.filter((kind) => IMAGE_MODEL_TEST_KINDS.includes(kind));
    const hasImageTests = imageKinds.length > 0;

    const report: Record<string, { passed: boolean; message: string; durationMs: number }> = {};

    // 图片模型不是文本聊天模型。连接项改为调用图片适配器的 testConnection，
    // 避免把 gpt-image-2 等图片接口错误地请求到 /chat/completions。
    const textKindsForClient = hasImageTests
      ? textKinds.filter((kind) => kind !== 'connection')
      : textKinds;
    if (textKindsForClient.length > 0) {
      const client = new HttpTextCompletionClient({
        baseURL: runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
        apiKey: runtimeConfig.apiKey,
        model: runtimeConfig.model ?? 'gpt-4o',
        apiProtocol: runtimeConfig.apiProtocol,
        timeoutMs: 60_000,
        maxRetries: 0,
      });
      const { report: textReport } = await runModelTests(client, textKindsForClient);
      Object.assign(report, textReport);
    }

    if (hasImageTests) {
      const adapter = createAIService(runtimeConfig);
      if (textKinds.includes('connection')) {
        const startedAt = Date.now();
        try {
          const passed = await adapter.testConnection();
          report.connection = {
            passed,
            message: passed ? '图片接口连接可用' : '图片接口连接失败',
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          report.connection = {
            passed: false,
            message: error instanceof Error ? error.message.slice(0, 200) : '图片接口连接失败',
            durationMs: Date.now() - startedAt,
          };
        }
      }
      const { report: imageReport } = await runImageModelTests(adapter, imageKinds);
      Object.assign(report, imageReport);
    }

    const evaluated = kinds.filter((kind) => report[kind]);
    const passedCount = evaluated.filter((kind) => report[kind].passed).length;
    const status =
      passedCount === evaluated.length ? 'passed' : passedCount === 0 ? 'failed' : 'partial';

    const failedMessages = evaluated
      .filter((kind) => !report[kind].passed)
      .map((kind) => `${kind}: ${report[kind].message}`)
      .join('；');

    // 合并既有实测结果，只覆盖本次执行的项
    const previous = toTestedCapabilities(config.testedCapabilities);
    const testedCapabilities: Record<string, boolean> = {
      connection: previous?.connection ?? false,
      jsonMode: previous?.jsonMode ?? false,
      vision: previous?.vision ?? false,
      imageGeneration: previous?.imageGeneration ?? false,
      imageEditing: previous?.imageEditing ?? false,
      referenceImage: previous?.referenceImage ?? false,
    };
    for (const kind of evaluated) {
      if (kind in testedCapabilities) {
        testedCapabilities[kind] = report[kind].passed;
      }
    }

    // Prisma 的 @updatedAt 会在测试写回时自动晚于 lastTestedAt 几毫秒，
    // 导致刚刚通过的测试被模型路由误判为“配置已变更”。两者使用同一时间点，
    // 保证一次测试结果在保存后立即可用；后续真正编辑模型时 updatedAt 仍会变化。
    const testedAt = new Date();
    const updated = await prisma.modelConfig.update({
      where: { id },
      data: {
        lastTestedAt: testedAt,
        updatedAt: testedAt,
        testStatus: status,
        testedCapabilities,
        testError: failedMessages ? failedMessages.slice(0, 800) : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        report,
        status,
        testedCapabilities,
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
