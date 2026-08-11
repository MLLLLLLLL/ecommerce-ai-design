import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/tags/[id] - 获取单个标签
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        assets: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { assets: true },
        },
      },
    });

    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error: any) {
    console.error('[API] Get tag error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/tags/[id] - 更新标签
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color, description } = body;

    const updateData: any = {};

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: 'Tag name cannot be empty' },
          { status: 400 }
        );
      }

      // 检查名称是否已被其他标签使用
      const existing = await prisma.tag.findFirst({
        where: {
          name: trimmedName,
          NOT: { id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Tag name already exists' },
          { status: 400 }
        );
      }

      updateData.name = trimmedName;
    }

    if (color !== undefined) updateData.color = color || null;
    if (description !== undefined) updateData.description = description || null;

    const tag = await prisma.tag.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error: any) {
    console.error('[API] Update tag error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/tags/[id] - 删除标签
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.tag.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Delete tag error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
