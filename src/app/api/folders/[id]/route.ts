import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/folders/[id] - 获取单个文件夹
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          include: {
            _count: {
              select: { assets: true, children: true },
            },
          },
        },
        assets: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { assets: true, children: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      folder,
    });
  } catch (error: any) {
    console.error('[API] Get folder error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/folders/[id] - 更新文件夹
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, color, parentId } = body;

    const updateData: any = {};

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: 'Folder name cannot be empty' },
          { status: 400 }
        );
      }

      // 获取当前文件夹
      const currentFolder = await prisma.folder.findUnique({
        where: { id },
      });

      if (!currentFolder) {
        return NextResponse.json(
          { success: false, error: 'Folder not found' },
          { status: 404 }
        );
      }

      // 检查同级是否有同名文件夹
      const existing = await prisma.folder.findFirst({
        where: {
          userId: currentFolder.userId,
          parentId: currentFolder.parentId,
          name: trimmedName,
          NOT: { id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Folder with this name already exists' },
          { status: 400 }
        );
      }

      updateData.name = trimmedName;
    }

    if (description !== undefined) updateData.description = description || null;
    if (color !== undefined) updateData.color = color || null;
    if (parentId !== undefined) {
      // 防止将文件夹移动到自己的子文件夹中
      if (parentId === id) {
        return NextResponse.json(
          { success: false, error: 'Cannot move folder to itself' },
          { status: 400 }
        );
      }
      updateData.parentId = parentId || null;
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { assets: true, children: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      folder,
    });
  } catch (error: any) {
    console.error('[API] Update folder error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/folders/[id] - 删除文件夹
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 检查文件夹是否有子文件夹或资源
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assets: true, children: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      );
    }

    if (folder._count.children > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete folder with subfolders' },
        { status: 400 }
      );
    }

    if (folder._count.assets > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete folder with assets' },
        { status: 400 }
      );
    }

    await prisma.folder.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Delete folder error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
