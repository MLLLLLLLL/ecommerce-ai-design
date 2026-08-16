import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { createZipArchive } from '@/lib/storage/zip';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

function isWithinDirectory(baseDir: string, targetPath: string): boolean {
  return targetPath === baseDir || targetPath.startsWith(`${baseDir}${path.sep}`);
}

function getSafeFilename(filename: string, fallback: string): string {
  const basename = filename.replace(/^.*[\\/]/, '').trim();
  return basename || fallback;
}

// POST /api/assets/batch/download - 将选中的资源打包为 ZIP
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { assetIds?: unknown };
    const assetIds = Array.isArray(body.assetIds)
      ? Array.from(new Set(body.assetIds.filter((id): id is string => typeof id === 'string' && id.length > 0)))
      : [];
    if (assetIds.length === 0) {
      return NextResponse.json({ success: false, error: '请选择要下载的资源' }, { status: 400 });
    }

    const user = await getCurrentUser();
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds }, userId: user.id },
      select: { id: true, filename: true, filepath: true, format: true },
      orderBy: { createdAt: 'asc' },
    });
    if (assets.length === 0) {
      return NextResponse.json({ success: false, error: '未找到可下载的资源' }, { status: 404 });
    }

    const baseDir = path.resolve(process.env.USER_DATA_PATH || './user-data');
    const realBaseDir = await fs.realpath(baseDir);
    const entries = [];
    for (const asset of assets) {
      const filePath = path.resolve(process.cwd(), asset.filepath);
      if (!isWithinDirectory(baseDir, filePath)) {
        return NextResponse.json({ success: false, error: '资源文件路径无效' }, { status: 400 });
      }
      const realFilePath = await fs.realpath(filePath).catch(() => null);
      if (!realFilePath || !isWithinDirectory(realBaseDir, realFilePath)) {
        return NextResponse.json({ success: false, error: '资源文件路径无效' }, { status: 400 });
      }
      const data = await fs.readFile(realFilePath).catch(() => null);
      if (!data) {
        return NextResponse.json({ success: false, error: `资源文件不存在：${asset.filename}` }, { status: 404 });
      }
      const extension = asset.format.toLowerCase();
      const fallback = `resource-${asset.id}.${IMAGE_EXTENSIONS.has(extension) ? extension : 'bin'}`;
      entries.push({ name: getSafeFilename(asset.filename, fallback), data });
    }

    const archive = createZipArchive(entries);
    const filename = `assets-${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(new Uint8Array(archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="assets-${Date.now()}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(archive.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[API] Batch download error:', error);
    return NextResponse.json({ success: false, error: '批量下载失败' }, { status: 500 });
  }
}
