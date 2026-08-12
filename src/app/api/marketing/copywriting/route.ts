import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { resolveTextModelForPurpose } from '@/lib/model-configs';
import { CopywritingEngine } from '@/lib/marketing';
import { Language, Platform, ProductAnalysis } from '@/types/marketing';

const requestSchema = z.object({
  contentModelId: z.string().uuid(),
  analysis: z.unknown(),
  platform: z.string().min(1),
  language: z.string().min(1).optional(),
  keywords: z.array(z.string()).max(30).optional(),
}).strict();

/** POST /api/marketing/copywriting - 使用已保存的内容模型生成文案 */
export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = await getCurrentUser();
    const { runtimeConfig } = await resolveTextModelForPurpose(user.id, body.contentModelId, 'content');
    const engine = new CopywritingEngine(runtimeConfig);
    const copywriting = await engine.generate(body.analysis as ProductAnalysis, body.platform as Platform, (body.language || 'zh-CN') as Language, body.keywords);
    const validation = engine.validateCopywriting(copywriting);
    return NextResponse.json({
      success: true,
      copywriting: validation.valid ? copywriting : engine.optimizeCopywriting(copywriting),
      ...(validation.valid ? {} : { warnings: validation.issues }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文案生成失败';
    return NextResponse.json({ success: false, error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
