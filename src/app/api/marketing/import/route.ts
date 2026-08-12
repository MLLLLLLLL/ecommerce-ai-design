import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

// POST /api/marketing/import - 将营销助手结果保存为素材库 JSON 素材
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body?.result;
    if (!result || typeof result !== 'object' || typeof result.taskId !== 'string') {
      return NextResponse.json({ success: false, error: '无效的营销结果' }, { status: 400 });
    }

    const user = await getCurrentUser();
    const baseDir = process.env.USER_DATA_PATH || './user-data';
    const marketingDir = path.join(baseDir, 'marketing');
    await fs.mkdir(marketingDir, { recursive: true });

    const filename = `marketing-${result.taskId}-${crypto.randomUUID()}.json`;
    const filepath = path.join(marketingDir, filename);
    const content = JSON.stringify(result, null, 2);
    await fs.writeFile(filepath, content, 'utf8');

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        filename,
        filepath,
        filesize: Buffer.byteLength(content, 'utf8'),
        format: 'json',
        aiProvider: 'marketing-assistant',
        aiModel: 'marketing-result',
        prompt: result.analysis?.productName ? `营销结果：${result.analysis.productName}` : '营销助手生成结果',
        parameters: { taskId: result.taskId },
        source: 'marketing-assistant',
      },
    });

    return NextResponse.json({ success: true, asset });
  } catch (error) {
    console.error('[API] Import marketing result error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导入素材库失败' },
      { status: 500 }
    );
  }
}
