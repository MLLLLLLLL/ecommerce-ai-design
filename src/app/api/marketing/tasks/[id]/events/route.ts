import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { listTaskEvents } from '@/lib/marketing/async/worker';
import { MarketingServiceError } from '@/lib/marketing/task-common';
import type { ApiResponse } from '@/types/marketing-contract';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/marketing/tasks/:id/events?after=<ISO> - 事件游标（V3 Phase 6）
 * 审计事件流：取消、重试、执行与聚合全部可追溯。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const after = new URL(request.url).searchParams.get('after') ?? undefined;
    const user = await getCurrentUser();
    const { events, nextCursor } = await listTaskEvents(user.id, id, after);

    return NextResponse.json({
      success: true,
      data: {
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          itemId: event.itemId,
          payload: event.payload,
          createdAt: event.createdAt.toISOString(),
        })),
        nextCursor,
      },
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
    console.error('[API] Task events error:', error);
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
