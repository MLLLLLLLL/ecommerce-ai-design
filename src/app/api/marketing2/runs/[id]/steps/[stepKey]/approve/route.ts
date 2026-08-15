import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { approveStep } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error, readIdempotencyKey } from '@/app/api/marketing2/common';

type RouteContext = { params: Promise<{ id: string; stepKey: string }> };

/**
 * POST /api/marketing2/runs/:id/steps/:stepKey/approve
 * 确认并推进：用户编辑内容必须通过对应 Schema；
 * 质检步骤在此执行完成门禁（失败项需返修或人工豁免）。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id, stepKey } = await context.params;
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    const idempotencyKey = readIdempotencyKey(request);

    const result = await approveStep(user.id, id, stepKey, body, idempotencyKey);

    return NextResponse.json({
      success: true,
      task: result.task,
      deduplicated: result.deduplicated,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    return handleMarketing2Error(error, 'POST steps/:stepKey/approve');
  }
}
