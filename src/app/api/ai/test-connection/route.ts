import { NextRequest, NextResponse } from 'next/server';
import { createAIService } from '@/lib/ai/factory';
import { decryptApiKey } from '@/lib/security/encryption';
import { AIServiceConfig } from '@/types/ai';
import { assertSafeOutboundUrl, safeFetch } from '@/lib/security/safe-url';

/**
 * 解密设置页传来的API Key
 * 解密失败则按明文原文处理
 */
function resolveApiKey(raw: string): string {
  try {
    return decryptApiKey(raw);
  } catch {
    return raw;
  }
}

/**
 * 测试文本模型（OpenAI兼容 chat/completions）连通性
 */
async function testTextModel(body: {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}) {
  const baseURL = (body.baseURL || '').trim().replace(/\/+$/, '');
  const model = (body.model || '').trim();
  const apiKey = resolveApiKey(body.apiKey || '');

  if (!baseURL || !model || !apiKey) {
    return NextResponse.json(
      { success: false, error: 'baseURL、模型名和 API Key 均为必填' },
      { status: 400 }
    );
  }

  await assertSafeOutboundUrl(baseURL);

  const response = await safeFetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || JSON.stringify(data);
    } catch {
      // 非JSON响应
    }
    return NextResponse.json({
      success: false,
      error: `连接失败 (${response.status})${detail ? `: ${detail}` : ''}`,
    });
  }

  return NextResponse.json({ success: true });
}

// POST /api/ai/test-connection - 测试AI服务连接
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 文本模型测试分支（提示词优化用）
    if (body.type === 'text') {
      return await testTextModel(body);
    }

    const config = body as AIServiceConfig;

    if (!config.provider) {
      return NextResponse.json(
        { success: false, error: 'Provider is required' },
        { status: 400 }
      );
    }

    // 设置页传来的是加密后的API Key，服务端先解密；解密失败则按原文处理
    const apiKey = resolveApiKey(config.apiKey || '');

    const adapter = createAIService({ ...config, apiKey });
    const ok = await adapter.testConnection();

    return NextResponse.json({
      success: ok,
      error: ok ? undefined : 'Connection test failed',
    });
  } catch (error: any) {
    console.error('[API] Test connection error:', error);
    if (error instanceof Error && /上游地址|内网|HTTPS|内部主机|解析/.test(error.message)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Connection test failed' },
      { status: 500 }
    );
  }
}
