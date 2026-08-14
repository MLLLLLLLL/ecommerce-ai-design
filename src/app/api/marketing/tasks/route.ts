import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createMarketingTaskSchema } from '@/lib/marketing/schemas';
import {
  listMarketingTasks,
  mapUpstreamError,
  MarketingServiceError,
} from '@/lib/marketing/task-service';
import { createMarketingTaskAsync } from '@/lib/marketing/async/task-creation';
import { startMarketingWorker } from '@/lib/marketing/async/worker';
import type { ApiResponse } from '@/types/marketing-contract';

const listQuerySchema = z.object({
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  module: z.enum(['copywriting', 'translate', 'seo', 'geo', 'insight']).optional(),
  status: z.string().max(30).optional(),
  isFavorite: z.enum(['true', 'false']).optional(),
  q: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function toErrorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof MarketingServiceError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
        requestId,
      } satisfies ApiResponse<never>,
      { status: error.httpStatus }
    );
  }
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || '(root)';
      (fieldErrors[field] ??= []).push(issue.message);
    }
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '请求参数不合法', fieldErrors },
        requestId,
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
  console.error('[API] Marketing tasks error:', error);
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
 * POST /api/marketing/tasks - 新工作台异步生成（V3 Phase 6）
 * 创建任务与子项后立即返回；执行由 Worker 领取，前端轮询详情获取进度与结果。
 * 失败时返回稳定错误码。
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const body = createMarketingTaskSchema.parse(await request.json());
    const user = await getCurrentUser();

    startMarketingWorker();
    const { taskId, status } = await createMarketingTaskAsync(user.id, body);

    return NextResponse.json({
      success: true,
      data: { taskId, status },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    if (error instanceof z.ZodError) return toErrorResponse(error, requestId);
    return toErrorResponse(mapUpstreamError(error), requestId);
  }
}

/**
 * GET /api/marketing/tasks - 全部作品列表（游标分页，V3 8.1）
 */
export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const url = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const user = await getCurrentUser();

    const { items, nextCursor } = await listMarketingTasks(user.id, {
      cursor: query.cursor,
      limit: query.limit,
      module: query.module,
      status: query.status,
      isFavorite: query.isFavorite === undefined ? undefined : query.isFavorite === 'true',
      q: query.q,
      from: query.from,
      to: query.to,
    });

    return NextResponse.json({
      success: true,
      data: { items, nextCursor },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
