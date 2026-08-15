import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { findOwnedTask } from '@/lib/marketing2/run-service';
import { exportRun, parseExportBody } from '@/lib/marketing2/export-service';
import { handleMarketing2Error } from '@/app/api/marketing2/common';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/marketing2/runs/:id/export
 * 导出：JSON、Markdown、提示词包、质检报告、图片资产清单。
 * 导出文件创建 Asset 并关联原任务 ID。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const body = parseExportBody(await request.json().catch(() => ({})));

    const task = await findOwnedTask(user.id, id);
    const items = await prisma.marketingTaskItem.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    const exported = await exportRun(task, items, body.format);
    return NextResponse.json({ success: true, ...exported, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleMarketing2Error(error, 'POST runs/:id/export');
  }
}
