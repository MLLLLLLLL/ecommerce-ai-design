import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { setRunPaused } from '@/lib/marketing2/step-actions';
import { handleMarketing2Error } from '@/app/api/marketing2/common';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/marketing2/runs/:id/pause 暂停批量生图（已运行项完成后停止领取）。 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const task = await setRunPaused(user.id, id, true);
    return NextResponse.json({ success: true, task, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'POST runs/:id/pause');
  }
}
