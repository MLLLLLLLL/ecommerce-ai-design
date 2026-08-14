import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { favoritePatchSchema } from '@/lib/marketing/schemas';
import {
  MarketingServiceError,
  setTaskFavorite,
} from '@/lib/marketing/task-service';
import { getMarketingTaskDetail } from '@/lib/marketing/async/worker';
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
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' },
        requestId,
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
  console.error('[API] Marketing task error:', error);
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
 * GET /api/marketing/tasks/:id - 任务详情（V3 8.1；Phase 6 增加 items 进度）
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const { task, items } = await getMarketingTaskDetail(user.id, id);

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        module: task.module,
        status: task.status,
        productName: task.productName,
        productImages: task.productImages,
        platform: task.platform,
        language: task.language,
        input: task.input,
        result: task.result,
        analysis: task.analysis,
        copywriting: task.copywriting,
        mainPrompts: task.mainPrompts,
        detailPrompts: task.detailPrompts,
        executionSteps: task.executionSteps,
        selectedOutputs: task.selectedOutputs,
        isFavorite: task.isFavorite,
        schemaVersion: task.schemaVersion,
        error: task.error,
        cancelRequestedAt: task.cancelRequestedAt?.toISOString() ?? null,
        items: items.map((item) => ({
          id: item.id,
          kind: item.kind,
          role: item.role,
          status: item.status,
          attempts: item.attempts,
          maxAttempts: item.maxAttempts,
          error: item.error,
          startedAt: item.startedAt?.toISOString() ?? null,
          completedAt: item.completedAt?.toISOString() ?? null,
        })),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/**
 * PATCH /api/marketing/tasks/:id - 收藏状态（V3 8.1）
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const body = favoritePatchSchema.parse(await request.json());
    const user = await getCurrentUser();
    const updated = await setTaskFavorite(user.id, id, body.isFavorite);

    return NextResponse.json({
      success: true,
      data: { id: updated.id, isFavorite: updated.isFavorite },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
