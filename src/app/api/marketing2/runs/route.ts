import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createRun, listRuns } from '@/lib/marketing2/run-service';
import { handleMarketing2Error } from '@/app/api/marketing2/common';
import { startMarketingWorker } from '@/lib/marketing/async/worker';

// 模块加载时确保 Worker 运行（与旧营销任务一致）
startMarketingWorker();

/**
 * GET /api/marketing2/runs?status=draft,awaiting_review&workflowKey=...&cursor=...&limit=20
 * 任务列表：按当前用户过滤，游标分页，返回卡片状态所需最小摘要。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const search = request.nextUrl.searchParams;
    const runs = await listRuns(user.id, {
      status: search.get('status')?.split(',').filter(Boolean),
      workflowKey: search.get('workflowKey') ?? undefined,
      cursor: search.get('cursor') ?? undefined,
      limit: search.get('limit') ? Number(search.get('limit')) : undefined,
    });
    return NextResponse.json({ success: true, ...runs, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'GET /api/marketing2/runs');
  }
}

/**
 * POST /api/marketing2/runs
 * 创建草稿：只创建不执行。请求体仅允许 workflowKey、input、stepModels，
 * 不允许 API Key、Base URL 或完整模型配置。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    const task = await createRun(user.id, body);
    return NextResponse.json({ success: true, task, requestId: crypto.randomUUID() }, { status: 201 });
  } catch (error) {
    return handleMarketing2Error(error, 'POST /api/marketing2/runs');
  }
}
