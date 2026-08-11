import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/assets - 获取资源列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const folderId = searchParams.get('folderId');
    const source = searchParams.get('source');
    const search = searchParams.get('search');

    // 构建查询条件
    const where: any = {};

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
    const body = await req.json();

    // TODO: 实现资源创建逻辑

    return NextResponse.json({
      success: true,
      message: 'Not implemented yet',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
