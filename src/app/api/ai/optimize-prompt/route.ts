import { NextRequest } from 'next/server';
import { decryptApiKey } from '@/lib/security/encryption';

// 提示词优化模式
type OptimizeMode = 'text-to-image' | 'image-to-image';

// 多模态消息内容块
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// 按模式区分的 System Prompt（借鉴 st-image 的优化规则文案）
const SYSTEM_PROMPTS: Record<OptimizeMode, string> = {
  'text-to-image': `你是一位专业的 AI 绘图提示词优化专家。
你的任务是将用户的简短描述优化为高质量的文生图提示词。
优化规则：
- 保留用户的原始意图和核心描述
- 补充画面主体的细节（外观、材质、姿态等）
- 添加合适的艺术风格描述（如摄影、插画、油画等）
- 补充光影、色调、氛围描述
- 优化构图和视角描述
- 使用简洁精准的中文描述
- 不要添加与画面无关的说明文字
只输出优化后的提示词本身，不要输出任何解释、前缀或额外说明。`,

  'image-to-image': `你是一位专业的图生图提示词优化专家。
你的任务是结合参考图和用户描述，优化为精准的图生图提示词。
优化规则：
- 观察参考图的内容、风格、色调、构图
- 结合用户的修改意图，生成精准的图生图提示词
- 保留用户想要保留的参考图元素
- 明确描述用户想要修改的部分
- 使用简洁精准的中文描述
- 不要添加与画面无关的说明文字
只输出优化后的提示词本身，不要输出任何解释、前缀或额外说明。`,
};

/**
 * 解密前端传来的API Key
 * 解密失败则按明文原文处理
 */
function resolveApiKey(raw: string): string {
  try {
    return decryptApiKey(raw);
  } catch {
    return raw;
  }
}

// POST /api/ai/optimize-prompt - 调用文本模型流式优化提示词
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { config, prompt, mode, image } = body as {
      config?: { baseURL?: string; apiKey?: string; model?: string };
      prompt?: string;
      mode?: OptimizeMode;
      image?: string;
    };

    if (!prompt || !prompt.trim()) {
      return Response.json(
        { success: false, error: '提示词不能为空' },
        { status: 400 }
      );
    }

    if (!config?.baseURL || !config?.apiKey || !config?.model) {
      return Response.json(
        { success: false, error: '缺少文本模型配置（baseURL / apiKey / model）' },
        { status: 400 }
      );
    }

    if (!mode || !SYSTEM_PROMPTS[mode]) {
      return Response.json(
        { success: false, error: '无效的优化模式' },
        { status: 400 }
      );
    }

    const baseURL = config.baseURL.trim().replace(/\/+$/, '');
    const apiKey = resolveApiKey(config.apiKey);

    // 组装消息内容：图生图模式附带参考图（多模态）
    let content: string | ContentPart[] = `用户输入：\n${prompt.trim()}`;
    if (mode === 'image-to-image' && image) {
      content = [
        { type: 'text', text: `用户输入：\n${prompt.trim()}` },
        { type: 'image_url', image_url: { url: image } },
      ];
    }

    const upstream = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model.trim(),
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[mode] },
          { role: 'user', content },
        ],
      }),
    });

    if (!upstream.ok) {
      let detail = '';
      try {
        const data = await upstream.json();
        detail = data.error?.message || JSON.stringify(data);
      } catch {
        // 非JSON响应
      }
      return Response.json(
        {
          success: false,
          error: `文本模型请求失败 (${upstream.status})${detail ? `: ${detail}` : ''}`,
        },
        { status: 502 }
      );
    }

    if (!upstream.body) {
      return Response.json(
        { success: false, error: '文本模型响应没有可读流' },
        { status: 502 }
      );
    }

    // 透传上游SSE流
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[API] Optimize prompt error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '提示词优化失败',
      },
      { status: 500 }
    );
  }
}
