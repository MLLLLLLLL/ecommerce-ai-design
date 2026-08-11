import { NextRequest, NextResponse } from 'next/server';
import { createAIService } from '@/lib/ai/factory';
import { decryptApiKey } from '@/lib/security/encryption';
import { AIServiceConfig } from '@/types/ai';

// POST /api/ai/test-connection - 测试AI服务连接
export async function POST(req: NextRequest) {
  try {
    const config = (await req.json()) as AIServiceConfig;

    if (!config.provider) {
      return NextResponse.json(
        { success: false, error: 'Provider is required' },
        { status: 400 }
      );
    }

    // 设置页传来的是加密后的API Key，服务端先解密；解密失败则按原文处理
    let apiKey = config.apiKey || '';
    try {
      apiKey = decryptApiKey(apiKey);
    } catch {
      // 已经是明文Key，直接使用
    }

    const adapter = createAIService({ ...config, apiKey });
    const ok = await adapter.testConnection();

    return NextResponse.json({
      success: ok,
      error: ok ? undefined : 'Connection test failed',
    });
  } catch (error: any) {
    console.error('[API] Test connection error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Connection test failed' },
      { status: 500 }
    );
  }
}
