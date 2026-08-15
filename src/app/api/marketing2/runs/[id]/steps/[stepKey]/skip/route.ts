import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { skipStep } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error, readIdempotencyKey } from '@/app/api/marketing2/common';

type RouteContext = { params: Promise<{ id: string; stepKey: string }> };

const skipBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

/**
 * POST /api/marketing2/runs/:id/steps/:stepKey/skip
 * 跳过步骤：仅注册表 allowSkip 的步骤（底图净化），必须记录原因。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id, stepKey } = await context.params;
    const user = await getCurrentUser();
    const body = skipBodySchema.parse(await request.json().catch(() => ({})));
    const idempotencyKey = readIdempotencyKey(request);

    const result = await skipStep(user.id, id, stepKey, {
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      task: result.task,
      deduplicated: result.deduplicated,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'INPUT_INVALID', message: '跳过需要 expectedVersion 与非空原因' } },
        { status: 400 }
      );
    }
    return handleMarketing2Error(error, 'POST steps/:stepKey/skip');
  }
}
