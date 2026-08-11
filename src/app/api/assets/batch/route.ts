import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { FileStorage } from '@/lib/storage/FileStorage';

// POST /api/assets/batch - 批量操作资源
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, assetIds, data } = body;

    if (!action || !assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'delete':
        result = await batchDelete(assetIds);
        break;

      case 'move':
        if (!data || data.folderId === undefined) {
          return NextResponse.json(
            { success: false, error: 'Folder ID is required' },
            { status: 400 }
          );
        }
        result = await batchMove(assetIds, data.folderId);
        break;

      case 'addTags':
        if (!data || !data.tagIds || !Array.isArray(data.tagIds)) {
          return NextResponse.json(
            { success: false, error: 'Tag IDs are required' },
            { status: 400 }
          );
        }
        result = await batchAddTags(assetIds, data.tagIds);
        break;

      case 'removeTags':
        if (!data || !data.tagIds || !Array.isArray(data.tagIds)) {
          return NextResponse.json(
            { success: false, error: 'Tag IDs are required' },
            { status: 400 }
          );
        }
        result = await batchRemoveTags(assetIds, data.tagIds);
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[API] Batch operation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// 批量删除
async function batchDelete(assetIds: string[]) {
  const storage = new FileStorage({
    baseDir: process.env.USER_DATA_PATH || './user-data',
  });

  // 获取所有资源
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
  });

  // 删除文件
  const deletedFiles: string[] = [];
  const failedFiles: string[] = [];

  for (const asset of assets) {
    try {
      await storage.deleteFile(asset.filepath);
      deletedFiles.push(asset.id);
    } catch (error) {
      console.error(`Failed to delete file ${asset.filepath}:`, error);
      failedFiles.push(asset.id);
    }
  }

  // 删除数据库记录
  const deleted = await prisma.asset.deleteMany({
    where: { id: { in: assetIds } },
  });

  return {
    deleted: deleted.count,
    deletedFiles: deletedFiles.length,
    failedFiles: failedFiles.length,
  };
}

// 批量移动到文件夹
async function batchMove(assetIds: string[], folderId: string | null) {
  const updated = await prisma.asset.updateMany({
    where: { id: { in: assetIds } },
    data: { folderId },
  });

  return {
    updated: updated.count,
    folderId,
  };
}

// 批量添加标签
async function batchAddTags(assetIds: string[], tagIds: string[]) {
  let updated = 0;

  for (const assetId of assetIds) {
    try {
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          tags: {
            connect: tagIds.map((id) => ({ id })),
          },
        },
      });
      updated++;
    } catch (error) {
      console.error(`Failed to add tags to asset ${assetId}:`, error);
    }
  }

  return {
    updated,
    tagIds,
  };
}

// 批量移除标签
async function batchRemoveTags(assetIds: string[], tagIds: string[]) {
  let updated = 0;

  for (const assetId of assetIds) {
    try {
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          tags: {
            disconnect: tagIds.map((id) => ({ id })),
          },
        },
      });
      updated++;
    } catch (error) {
      console.error(`Failed to remove tags from asset ${assetId}:`, error);
    }
  }

  return {
    updated,
    tagIds,
  };
}
