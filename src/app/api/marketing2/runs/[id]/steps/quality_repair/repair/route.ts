import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createRepairItems } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error, readIdempotencyKey } from '@/app/api/marketing2/common';
import { startMarketingWorker } from '@/lib/marketing/async/worker';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/marketing2/runs/:id/steps/quality_repair/repair
 * 质检失败项返修：固定四类返修动作，创建派生资产版本，原图只读保留。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    startMarketingWorker();
    const { id } = await context.params;
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    const idempotencyKey = readIdempotencyKey(request);

    const result = await createRepairItems(user.id, id, body, idempotencyKey);

    return NextResponse.json({
      success: true,
      items: result.items,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    return handleMarketing2Error(error, 'POST steps/quality_repair/repair');
  }
}
