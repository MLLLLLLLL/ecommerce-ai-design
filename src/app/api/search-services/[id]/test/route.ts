import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { testSearchService } from '@/lib/search/search-service-config';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/search-services/:id/test - 实测搜索服务（一次真实查询） */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const { passed, message } = await testSearchService(user.id, id);
    return NextResponse.json({ success: true, data: { passed, message } });
  } catch (error) {
    if (error instanceof Error && error.message.includes('不存在')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error('[API] Test search service error:', error);
    return NextResponse.json({ success: false, error: '搜索服务实测失败' }, { status: 500 });
  }
}
