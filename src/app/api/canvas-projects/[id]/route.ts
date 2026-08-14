import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/canvas-projects/[id] - 画布项目详情（含 definition，进入编辑器时调用）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.canvasProject.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Canvas project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.error('[API] Get canvas project error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/canvas-projects/[id] - 保存画布项目（名称/定义/缩略图）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, definition, thumbnail } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim() || '未命名画布';
    if (definition !== undefined) updateData.definition = definition;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;

    const project = await prisma.canvasProject.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.error('[API] Update canvas project error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/canvas-projects/[id] - 删除画布项目
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.canvasProject.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Canvas project deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Delete canvas project error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
