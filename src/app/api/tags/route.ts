import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/tags - 获取所有标签
export async function GET(req: NextRequest) {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      tags,
    });
  } catch (error: any) {
    console.error('[API] Get tags error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/tags - 创建标签
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, color, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Tag name is required' },
        { status: 400 }
      );
    }

    // 检查标签是否已存在
    const existing = await prisma.tag.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Tag already exists' },
        { status: 400 }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color || null,
        description: description || null,
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error: any) {
    console.error('[API] Create tag error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
