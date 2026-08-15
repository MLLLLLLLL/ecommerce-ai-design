import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { handleMarketing2Error } from '@/app/api/marketing2/common';
import { forceRunCancel } from '@/lib/marketing2/step-actions';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/marketing2/runs/:id/force-cancel 立即强制停止任务。 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const task = await forceRunCancel(user.id, id);
    return NextResponse.json({ success: true, task, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'POST /api/marketing2/runs/:id/force-cancel');
  }
}
