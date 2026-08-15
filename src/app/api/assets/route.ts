import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

// GET /api/assets - 获取资源列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Math.min(parseInt(searchParams.get('page') || '1', 10) || 1, 100000));
    const pageSize = Math.max(1, Math.min(parseInt(searchParams.get('pageSize') || '20', 10) || 20, 100));
    const folderId = searchParams.get('folderId');
    const source = searchParams.get('source');
    const search = searchParams.get('search');

    // 构建查询条件，仅返回当前用户的素材
    const user = await getCurrentUser();
    const where: any = { userId: user.id };

    if (folderId) {
      where.folderId = folderId;
    }

    if (source) {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { prompt: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 查询资源
    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: {
          tags: true,
          folder: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      assets,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    console.error('[API] Get assets error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/assets - 创建资源（预留）
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ success: false, error: '请使用具体素材导入接口' }, { status: 405 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
