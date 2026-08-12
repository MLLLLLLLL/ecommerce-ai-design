import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { toRuntimeAIConfig } from '@/lib/model-configs';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const config = await prisma.modelConfig.findFirst({ where: { id, userId: user.id } });
    if (!config) {
      return NextResponse.json({ success: false, error: '模型不存在或无权限测试' }, { status: 404 });
    }

    const runtimeConfig = toRuntimeAIConfig(config);
    const response = await fetch(`${runtimeConfig.baseURL!.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: runtimeConfig.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = payload.error?.message || payload.message || '';
      } catch {
        // 上游可能返回非 JSON 错误。
      }
      return NextResponse.json({
        success: false,
        error: `连接失败 (${response.status})${detail ? `: ${detail}` : ''}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Test model config error:', error);
    return NextResponse.json({ success: false, error: '连接测试失败' }, { status: 500 });
  }
}
