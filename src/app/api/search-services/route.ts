import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import {
  createSearchService,
  toSearchServiceSummary,
} from '@/lib/search/search-service-config';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.enum(['tavily', 'serper', 'custom']),
  baseURL: z.url().max(500),
  apiKey: z.string().trim().min(1).max(2000),
  isActive: z.boolean().default(true),
  maxQueriesPerTask: z.number().int().min(1).max(20).default(12),
});

/** GET /api/search-services - 当前用户的搜索服务列表 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const configs = await prisma.searchServiceConfig.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return NextResponse.json({
      success: true,
      data: { services: configs.map(toSearchServiceSummary) },
    });
  } catch (error) {
    console.error('[API] List search services error:', error);
    return NextResponse.json({ success: false, error: '读取搜索服务失败' }, { status: 500 });
  }
}

/** POST /api/search-services - 创建搜索服务配置 */
export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    const user = await getCurrentUser();
    const config = await createSearchService(user.id, body);
    return NextResponse.json(
      { success: true, data: { service: toSearchServiceSummary(config) } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: '搜索服务字段不完整或格式不正确' },
        { status: 400 }
      );
    }
    console.error('[API] Create search service error:', error);
    return NextResponse.json({ success: false, error: '保存搜索服务失败' }, { status: 500 });
  }
}
