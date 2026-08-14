import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cancelMarketingTask } from '@/lib/marketing/async/worker';
import { MarketingServiceError } from '@/lib/marketing/task-common';
import type { ApiResponse } from '@/types/marketing-contract';

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, requestId: string): NextResponse {
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
  console.error('[API] Marketing task action error:', error);
  return NextResponse.json(
    {
      success: false,
      error: { code: 'UPSTREAM_FAILED', message: '服务内部错误' },
      requestId,
    } satisfies ApiResponse<never>,
    { status: 500 }
  );
}

/**
 * POST /api/marketing/tasks/:id/cancel - 取消任务（V3 Phase 6）
 * 取消状态可审计：事件 cancel_requested / task_cancelled。
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    await cancelMarketingTask(user.id, id);
    return NextResponse.json({
      success: true,
      data: { taskId: id, cancelled: true },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
