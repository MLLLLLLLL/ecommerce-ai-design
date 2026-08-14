import { WorkflowNode, NodeType, ExecutionContext, NodeConfigSchema } from './base';
import { generateViaServer } from './ai';
import type { ModelConfigSummary } from '@/types/model-config';

// ============================================
// 编排节点（借鉴 st-image 编排节点：组合提示词 + 图片/文字/同时三模式 + 批量出图）
// ============================================

// 组合提示词：将模板中的 {promptA}/{promptB}/{promptC} 占位符替换为上游输入值；
// 未连接的输入替换为空串并压缩多余空白；模板为空时退化为第一个已连接的非空输入
export function composePrompt(
  template: string | undefined,
  inputs: Record<string, any>
): string {
  const slots = ['promptA', 'promptB', 'promptC'] as const;
  const composed = (template || '').trim();

  if (composed) {
    let result = composed;
    slots.forEach((slot) => {
      const value = inputs[slot];
      result = result.replaceAll(
        `{${slot}}`,
        typeof value === 'string' ? value : ''
      );
    });
    return result.replace(/\s+/g, ' ').trim();
  }

  // 无模板：退化为第一个非空输入
  for (const slot of slots) {
    const value = inputs[slot];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// 读取 SSE 流（data: 事件，累加 choices[0].delta.content），与提示词优化链路一致
async function readSseText(response: Response): Promise<string> {
  if (!response.body) throw new Error('响应没有可读流');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) text += delta;
      } catch {
        // 忽略无法解析的行
      }
    }
  }

  return text;
}

// 编排节点
export class OrchestratorNode extends WorkflowNode {
  type: NodeType = 'orchestrator';
  name = '编排节点';
  description = '组合上游内容，按模式生成图片/文案（支持批量出图）';
  inputs: string[] = ['promptA', 'promptB', 'promptC', 'reference'];
  outputs: string[] = ['image', 'text'];
  portTypes = {
    promptA: 'text' as const,
    promptB: 'text' as const,
    promptC: 'text' as const,
    reference: 'image' as const,
    image: 'image' as const,
    text: 'text' as const,
  };

  async validate(context: ExecutionContext): Promise<boolean> {
    const mode = context.config.mode || 'image';
    const composed = composePrompt(context.config.composerContent, context.inputs);
    if (!composed) return false;
    if (mode !== 'text' && !context.config.serviceConfig) return false;
    return true;
  }

  getValidationError(context: ExecutionContext): string | null {
    const mode = context.config.mode || 'image';
    const composed = composePrompt(context.config.composerContent, context.inputs);
    if (!composed) return '编排节点缺少提示词内容，请填写组合提示词或连接输入端口';
    if (mode !== 'text' && !context.config.serviceConfig) {
      return '编排节点未配置 AI 服务，请在设置中添加并激活服务';
    }
    return null;
  }

  async execute(context: ExecutionContext): Promise<any> {
    const config = context.config;
    const mode = config.mode || 'image';
    const composed = composePrompt(config.composerContent, context.inputs);

    // 文字模式：直接用文本模型生成文案
    if (mode === 'text') {
      const text = await this.generateText(composed, config.systemPrompt || '');
      return { text };
    }

    // 同时模式：先生成文案，再以文案为提示词出图
    const prompt =
      mode === 'both'
        ? await this.generateText(composed, config.systemPrompt || '')
        : composed;

    const hasReference = !!context.inputs.reference;
    const endpoint = hasReference
      ? ('/api/ai/image-to-image' as const)
      : ('/api/ai/text-to-image' as const);

    const count = Math.max(1, Math.min(8, Math.floor(config.imageCount || 1)));
    const baseSeed =
      config.seed !== undefined && config.seed >= 0 ? config.seed : undefined;

    // 批量出图：并行提交 imageCount 个请求；固定种子按序号递增，保证每张不同且可复现
    const images = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        generateViaServer(endpoint, config.serviceConfig, {
          ...(hasReference
            ? { image: context.inputs.reference, strength: config.strength || 0.75 }
            : {}),
          prompt,
          negativePrompt: config.negativePrompt || '',
          width: config.width || 1024,
          height: config.height || 1024,
          samples: 1,
          steps: config.steps || 20,
          cfgScale: config.cfgScale || 7,
          seed: baseSeed !== undefined ? baseSeed + i : undefined,
        }).catch((error: any) => {
          throw new Error(`第 ${i + 1} 张生成失败：${error.message}`);
        })
      )
    );

    const result: Record<string, any> = { image: images[0], images };
    if (mode === 'both') result.text = prompt;
    return result;
  }

  // 调用文本模型生成文案（复用提示词优化服务端链路，默认文本模型）
  private async generateText(prompt: string, systemPrompt: string): Promise<string> {
    const model = await this.resolveDefaultTextModel();
    if (!model) {
      throw new Error('文字模式需要文本模型，请先在设置页「文本模型」中配置并激活');
    }

    const fullPrompt = systemPrompt.trim()
      ? `${systemPrompt.trim()}\n\n${prompt}`
      : prompt;

    const response = await fetch('/api/ai/optimize-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: model.id,
        prompt: fullPrompt,
        mode: 'text-to-image',
      }),
    });

    if (!response.ok) {
      let message = `文案生成失败（HTTP ${response.status}）`;
      try {
        const data = await response.json();
        if (data.error) message = data.error;
      } catch {
        // 非 JSON 响应
      }
      throw new Error(message);
    }

    return readSseText(response);
  }

  // 默认文本模型：与提示词优化按钮一致（默认 + 激活 + jsonMode）
  private async resolveDefaultTextModel(): Promise<{ id: string } | null> {
    try {
      const response = await fetch('/api/model-configs');
      const data = await response.json();
      const models = data.models as ModelConfigSummary[] | undefined;
      const model =
        models?.find(
          (item) => item.isActive && item.isDefault && item.capabilities.jsonMode
        ) || models?.find((item) => item.isActive && item.capabilities.jsonMode);
      return model ? { id: model.id } : null;
    } catch {
      return null;
    }
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      composerContent: {
        type: 'string',
        label: '组合提示词',
        description: '使用 {promptA}/{promptB}/{promptC} 引用输入端口内容；留空则取第一个已连接输入',
        multiline: true,
        default: '',
      },
      mode: {
        type: 'combo',
        label: '执行模式',
        options: ['image', 'text', 'both'],
        default: 'image',
      },
      systemPrompt: {
        type: 'string',
        label: '角色提示词（文字模式）',
        multiline: true,
      },
      imageCount: {
        type: 'integer',
        label: '生成数量',
        default: 1,
        min: 1,
        max: 8,
      },
      serviceConfig: {
        type: 'service',
        label: 'AI 服务',
        required: true,
      },
      negativePrompt: {
        type: 'string',
        label: '负向提示词',
        multiline: true,
      },
      strength: {
        type: 'float',
        label: '变化强度（参考图模式）',
        default: 0.75,
        min: 0,
        max: 1,
        step: 0.05,
      },
      resolution: {
        type: 'combo',
        label: '分辨率',
        options: ['1k', '2k', '4k'],
        default: '1k',
      },
      aspect: {
        type: 'combo',
        label: '图片尺寸',
        options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        default: '1:1',
      },
      width: {
        type: 'integer',
        label: '宽度',
        default: 1024,
        min: 64,
        max: 8192,
      },
      height: {
        type: 'integer',
        label: '高度',
        default: 1024,
        min: 64,
        max: 8192,
      },
      steps: {
        type: 'integer',
        label: '采样步数',
        default: 20,
        min: 1,
        max: 150,
      },
      cfgScale: {
        type: 'float',
        label: 'CFG Scale',
        default: 7,
        min: 1,
        max: 30,
        step: 0.5,
      },
      seed: {
        type: 'seed',
        label: '随机种子',
        default: -1,
      },
    };
  }
}
