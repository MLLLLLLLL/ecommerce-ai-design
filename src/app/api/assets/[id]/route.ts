import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { FileStorage } from '@/lib/storage/FileStorage';

// GET /api/assets/[id] - 获取单个资源详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        tags: true,
        folder: true,
        project: true,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      asset,
    });
  } catch (error: any) {
    console.error('[API] Get asset error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/assets/[id] - 更新资源
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { folderId, tagIds, projectId } = body;

    const updateData: any = {};

    if (folderId !== undefined) {
      updateData.folderId = folderId;
    }

    if (projectId !== undefined) {
      updateData.projectId = projectId;
    }

    // 更新标签关联
    if (tagIds) {
      updateData.tags = {
        set: tagIds.map((id: string) => ({ id })),
      };
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        folder: true,
        project: true,
      },
    });

    return NextResponse.json({
      success: true,
      asset,
    });
  } catch (error: any) {
    console.error('[API] Update asset error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/assets/[id] - 删除资源
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 获取资源信息
    const asset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // 删除文件
    const storage = new FileStorage({
      baseDir: process.env.USER_DATA_PATH || './user-data',
    });

    try {
      await storage.deleteFile(asset.filepath);
    } catch (error) {
      console.error('Failed to delete file:', error);
      // 即使文件删除失败，仍继续删除数据库记录
    }

    // 删除数据库记录
    await prisma.asset.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Delete asset error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
