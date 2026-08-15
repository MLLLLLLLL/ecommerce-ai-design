import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getRunDetail, updateRun } from '@/lib/marketing2/run-service';
import { handleMarketing2Error } from '@/app/api/marketing2/common';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/marketing2/runs/:id
 * 任务详情：刷新页面后恢复步骤、输入、模型选择与结果。
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const detail = await getRunDetail(user.id, id);
    return NextResponse.json({ success: true, ...detail, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'GET /api/marketing2/runs/:id');
  }
}

/**
 * PATCH /api/marketing2/runs/:id
 * 保存草稿：必须携带 expectedVersion，版本冲突返回 VERSION_CONFLICT。
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    const task = await updateRun(user.id, id, body);
    return NextResponse.json({ success: true, task, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'PATCH /api/marketing2/runs/:id');
  }
}
