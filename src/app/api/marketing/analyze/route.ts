import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { resolveTextModelForPurpose } from '@/lib/model-configs';
import { ProductAnalyzer } from '@/lib/marketing';

const requestSchema = z.object({
  visionModelId: z.string().uuid(),
  productName: z.string().trim().optional(),
  productImages: z.array(z.string().min(1)).min(1).max(12),
  category: z.string().optional(),
  sellPoints: z.array(z.string()).max(20).optional(),
  parameters: z.record(z.string(), z.string()).optional(),
}).strict();

/** POST /api/marketing/analyze - 使用已保存的视觉模型进行产品分析 */
export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = await getCurrentUser();
    const { runtimeConfig } = await resolveTextModelForPurpose(user.id, body.visionModelId, 'vision');
    const analyzer = new ProductAnalyzer(runtimeConfig);
    const validation = analyzer.validateImages(body.productImages);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const analysis = await analyzer.analyze({
      images: body.productImages,
      productName: body.productName,
      userHints: {
        category: body.category as never,
        sellPoints: body.sellPoints,
        parameters: body.parameters,
      },
    });
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : '产品分析失败';
    return NextResponse.json({ success: false, error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
