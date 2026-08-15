import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { patchV3ModelSelections } from '@/lib/marketing2/run-service';
import { handleMarketing2Error } from '@/app/api/marketing2/common';

/** V3 页面/图片级模型选择，使用 expectedVersion 防止并发覆盖。 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const task = await patchV3ModelSelections(user.id, id, body);
    return NextResponse.json({ success: true, task, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'PATCH /api/marketing2/runs/:id/model-selections');
  }
}
