import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { listWorkflowCards } from '@/lib/marketing2/run-service';
import { handleMarketing2Error } from '@/app/api/marketing2/common';

/**
 * GET /api/marketing2/workflows
 * 工作流卡片中心数据：注册表契约 + 模型能力满足情况 + 最近运行状态。
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const workflows = await listWorkflowCards(user.id);
    return NextResponse.json({ success: true, workflows, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'GET /api/marketing2/workflows');
  }
}
