import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
};

// GET /api/files/[...path] - 提供用户数据目录下的文件访问
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File path is required' },
        { status: 400 }
      );
    }

    const baseDir = path.resolve(process.env.USER_DATA_PATH || './user-data');
    const requested = path.resolve(process.cwd(), ...segments);

    // 安全校验：只允许访问用户数据目录内的文件
    if (!requested.startsWith(baseDir + path.sep)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const realBase = await fs.realpath(baseDir);
    const realRequested = await fs.realpath(requested);
    if (!realRequested.startsWith(realBase + path.sep)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const user = await getCurrentUser();
    // 数据库中的 filepath 由不同平台的 path.join 写入，Windows 下可能保留反斜杠。
    // 文件 URL 始终使用正斜杠，因此鉴权查询需要同时兼容两种分隔符和相对路径前缀。
    const relativePath = path.relative(process.cwd(), realRequested);
    const normalizedRelativePath = relativePath.replace(/\\/g, '/');
    const dbPathCandidates = [
      relativePath,
      normalizedRelativePath,
      `.${path.sep}${relativePath}`,
      `./${normalizedRelativePath}`,
      realRequested,
    ].filter((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index);
    const asset = await prisma.asset.findFirst({
      where: {
        userId: user.id,
        OR: [
          { filepath: { in: dbPathCandidates } },
          { thumbnail: { in: dbPathCandidates } },
        ],
      },
      select: { id: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });

    const data = await fs.readFile(requested);
    const ext = path.extname(requested).slice(1).toLowerCase();

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'File not found' },
      { status: 404 }
    );
  }
}
