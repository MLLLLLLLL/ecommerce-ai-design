import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { retryItem } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error, readIdempotencyKey } from '@/app/api/marketing2/common';
import { startMarketingWorker } from '@/lib/marketing/async/worker';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/**
 * POST /api/marketing2/runs/:id/items/:itemId/retry
 * 单项重试：仅失败/取消项；重复请求返回当前状态，不重复创建。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    startMarketingWorker();
    const { id, itemId } = await context.params;
    const user = await getCurrentUser();
    const idempotencyKey = readIdempotencyKey(request);

    const result = await retryItem(user.id, id, itemId, idempotencyKey);

    return NextResponse.json({
      success: true,
      item: result.item,
      deduplicated: result.deduplicated,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    return handleMarketing2Error(error, 'POST items/:itemId/retry');
  }
}
