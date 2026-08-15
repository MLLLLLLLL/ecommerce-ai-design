import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { resolveTextModelForPurpose } from '@/lib/model-configs';
import { HttpTextCompletionClient } from '@/lib/ai/http-text-completion-client';

// POST /api/ai/split-prompt - 调用文本模型（JSON 模式）把总提示词拆成 N 条子提示词
// （借鉴 st-image 多图规划的 canvas-multi-image-split）

const requestSchema = z.object({
  modelId: z.string().uuid(),
  prompt: z.string().trim().min(1),
  count: z.number().int().min(1).max(8),
}).strict();

const SYSTEM_PROMPT = `你是一位专业的 AI 绘图提示词拆分专家。
用户会给你一段总提示词和需要拆分的数量 N。
请将总提示词拆分为 N 条独立、完整、不重复的子提示词，每条子提示词都可以独立用于 AI 绘图。
要求：
- 拆分后的每条子提示词自包含（画面主体、风格、光影等要素齐全）
- 尽量均匀分配总提示词中的元素，避免遗漏
- 使用简洁精准的中文描述
- 只输出 JSON，格式为 {"prompts": ["子提示词1", "子提示词2", ...]}，不要输出任何解释、前缀或额外说明`;

export async function POST(req: NextRequest) {
  try {
    const { modelId, prompt, count } = requestSchema.parse(await req.json());
    const user = await getCurrentUser();
    const { runtimeConfig } = await resolveTextModelForPurpose(user.id, modelId, 'content');
    const client = new HttpTextCompletionClient({
      baseURL: runtimeConfig.baseURL ?? 'https://api.openai.com/v1',
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model ?? 'gpt-4o',
      apiProtocol: runtimeConfig.apiProtocol,
    });
    const content = await client.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `总提示词：\n${prompt.trim()}\n\n需要拆分的数量：${count}` },
      ],
      responseFormat: 'json_object',
      temperature: 0.2,
      maxTokens: 4000,
    });

    // 解析 JSON；失败时回退：按行/编号提取文本
    let prompts: string[] = [];
    try {
      const parsed = JSON.parse(content);
      const list =
        parsed.prompts ??
        parsed.result ??
        (Array.isArray(parsed) ? parsed : null);
      if (Array.isArray(list)) {
        prompts = list.map((p: unknown) => String(p).trim()).filter(Boolean);
      }
    } catch {
      // JSON 解析失败，走回退
    }

    if (prompts.length === 0) {
      prompts = content
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => l.replace(/^[\d一二三四五六七八九十]+[.、)）\]]\s*/, ''))
        .filter((l: string) => !l.startsWith('{') && !l.endsWith('}'));
    }

    if (prompts.length === 0) {
      return Response.json(
        { success: false, error: '模型未返回有效的拆分结果' },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      prompts: prompts.slice(0, count),
    });
  } catch (error) {
    console.error('[API] Split prompt error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '提示词拆分失败',
      },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
