import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toSearchServiceSummary } from '@/lib/search/search-service-config';

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    maxQueriesPerTask: z.number().int().min(1).max(20).optional(),
  })
  .strict();

/** PATCH /api/search-services/:id - 启用/默认/配额 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const user = await getCurrentUser();

    const config = await prisma.searchServiceConfig.findFirst({ where: { id, userId: user.id } });
    if (!config) {
      return NextResponse.json({ success: false, error: '搜索服务不存在' }, { status: 404 });
    }

    if (body.isDefault === true) {
      await prisma.searchServiceConfig.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.searchServiceConfig.update({
      where: { id },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.maxQueriesPerTask !== undefined ? { maxQueriesPerTask: body.maxQueriesPerTask } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: { service: toSearchServiceSummary(updated) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: '参数不合法' }, { status: 400 });
    }
    console.error('[API] Update search service error:', error);
    return NextResponse.json({ success: false, error: '更新搜索服务失败' }, { status: 500 });
  }
}

/** DELETE /api/search-services/:id */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const config = await prisma.searchServiceConfig.findFirst({ where: { id, userId: user.id } });
    if (!config) {
      return NextResponse.json({ success: false, error: '搜索服务不存在' }, { status: 404 });
    }
    await prisma.searchServiceConfig.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[API] Delete search service error:', error);
    return NextResponse.json({ success: false, error: '删除搜索服务失败' }, { status: 500 });
  }
}
