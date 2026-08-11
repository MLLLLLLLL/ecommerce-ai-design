import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

    const data = await fs.readFile(requested);
    const ext = path.extname(requested).slice(1).toLowerCase();

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'File not found' },
      { status: 404 }
    );
  }
}
