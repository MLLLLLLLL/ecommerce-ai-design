import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { retryMarketingTaskItem } from '@/lib/marketing/async/worker';
import { MarketingServiceError } from '@/lib/marketing/task-common';
import type { ApiResponse } from '@/types/marketing-contract';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/**
 * POST /api/marketing/tasks/:id/items/:itemId/retry - 单项重试（V3 Phase 6）
 * 仅失败或取消的子任务可重试；事件 item_retried 可审计。
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id, itemId } = await context.params;
    const user = await getCurrentUser();
    await retryMarketingTaskItem(user.id, id, itemId);
    return NextResponse.json({
      success: true,
      data: { taskId: id, itemId, retried: true },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    if (error instanceof MarketingServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
          requestId,
        } satisfies ApiResponse<never>,
        { status: error.httpStatus }
      );
    }
    console.error('[API] Retry item error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UPSTREAM_FAILED', message: '服务内部错误' },
        requestId,
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
