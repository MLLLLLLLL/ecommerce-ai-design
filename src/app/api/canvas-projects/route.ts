import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

// GET /api/canvas-projects - 画布仓库列表（不返回 definition 大字段）
export async function GET() {
  try {
    const user = await getCurrentUser();
    const projects = await prisma.canvasProject.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error: any) {
    console.error('[API] Get canvas projects error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/canvas-projects - 新建画布项目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, definition, thumbnail } = body;

    const user = await getCurrentUser();

    const project = await prisma.canvasProject.create({
      data: {
        userId: user.id,
        name: name?.trim() || '未命名画布',
        // 空画布初始定义：version 2 复合格式，fabric 为空时编辑器跳过图层恢复
        definition: definition ?? {
          version: 2,
          fabric: null,
          nodes: [],
          connections: [],
          viewport: null,
        },
        thumbnail: thumbnail ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.error('[API] Create canvas project error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
