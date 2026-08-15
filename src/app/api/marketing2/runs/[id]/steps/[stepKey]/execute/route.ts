import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { executeStep } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error, readIdempotencyKey } from '@/app/api/marketing2/common';
import { startMarketingWorker } from '@/lib/marketing/async/worker';

type RouteContext = { params: Promise<{ id: string; stepKey: string }> };

const executeBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
  })
  .strict();

/**
 * POST /api/marketing2/runs/:id/steps/:stepKey/execute
 * 执行当前步骤：要求 Idempotency-Key 与 expectedVersion；
 * 重复请求返回第一次请求创建的 items。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    startMarketingWorker();
    const { id, stepKey } = await context.params;
    const user = await getCurrentUser();
    const body = executeBodySchema.parse(await request.json().catch(() => ({})));
    const idempotencyKey = readIdempotencyKey(request);

    const result = await executeStep(user.id, id, stepKey, {
      expectedVersion: body.expectedVersion,
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      task: result.task,
      items: result.items,
      deduplicated: result.deduplicated,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'INPUT_INVALID', message: '执行请求必须携带 expectedVersion' } },
        { status: 400 }
      );
    }
    return handleMarketing2Error(error, 'POST steps/:stepKey/execute');
  }
}
