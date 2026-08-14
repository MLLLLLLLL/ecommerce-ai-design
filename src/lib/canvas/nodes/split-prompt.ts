// AI 提示词拆分客户端（多图规划用）：POST /api/ai/split-prompt → string[]

export async function splitPrompt(
  modelId: string,
  prompt: string,
  count: number
): Promise<string[]> {
  const response = await fetch('/api/ai/split-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId, prompt, count }),
  });

  if (!response.ok) {
    let message = `拆分失败（HTTP ${response.status}）`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // 非 JSON 响应
    }
    throw new Error(message);
  }

  const data = await response.json();
  const prompts = data.prompts;
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('模型未返回有效的拆分结果');
  }
  return prompts.map((p: unknown) => String(p).trim()).filter(Boolean);
}

// 默认文本模型（与提示词优化按钮一致：默认 + 激活 + jsonMode）
export async function fetchDefaultTextModelId(): Promise<string | null> {
  try {
    const response = await fetch('/api/model-configs');
    const data = await response.json();
    const models = data.models as
      | {
          id: string;
          isActive: boolean;
          isDefault: boolean;
          capabilities: { jsonMode: boolean };
        }[]
      | undefined;
    const model =
      models?.find(
        (m) => m.isActive && m.isDefault && m.capabilities.jsonMode
      ) || models?.find((m) => m.isActive && m.capabilities.jsonMode);
    return model?.id || null;
  } catch {
    return null;
  }
}
