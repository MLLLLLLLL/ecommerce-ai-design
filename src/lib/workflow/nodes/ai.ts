import { WorkflowNode, NodeType, ExecutionContext, NodeConfigSchema } from './base';
import { getAssetUrl } from '@/lib/utils';

// 通过服务端 API 路由调用 AI 服务（与文生图/图生图页面同链路，
// 避免浏览器直连中转站的跨域问题），返回首张图片的可访问 URL
export async function generateViaServer(
  endpoint: '/api/ai/text-to-image' | '/api/ai/image-to-image',
  config: any,
  params: Record<string, any>
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, params }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `生成失败（HTTP ${response.status}）`);
  }
  if (!result.assets?.length) {
    throw new Error('未生成图片');
  }
  return getAssetUrl(result.assets[0].filepath);
}

// 文生图节点
export class TextToImageNode extends WorkflowNode {
  type: NodeType = 'textToImage';
  name = '文生图';
  description = '根据文本生成图片';
  inputs: string[] = ['prompt'];
  outputs: string[] = ['image'];
  portTypes = { prompt: 'text' as const, image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.prompt && !!context.config.serviceConfig;
  }

  getValidationError(context: ExecutionContext): string | null {
    if (!context.inputs.prompt) return '文生图缺少提示词输入';
    if (!context.config.serviceConfig) return '文生图未配置 AI 服务，请在设置中添加并激活服务';
    return null;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // seed 为 -1 时随机生成
    const seed =
      context.config.seed !== undefined && context.config.seed >= 0
        ? context.config.seed
        : undefined;

    return generateViaServer('/api/ai/text-to-image', context.config.serviceConfig, {
      prompt: context.inputs.prompt,
      negativePrompt: context.config.negativePrompt || '',
      width: context.config.width || 1024,
      height: context.config.height || 1024,
      samples: 1,
      steps: context.config.steps || 20,
      cfgScale: context.config.cfgScale || 7,
      seed,
    });
  }

  getConfigSchema(): NodeConfigSchema {
    return {
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

// 图生图节点
export class ImageToImageNode extends WorkflowNode {
  type: NodeType = 'imageToImage';
  name = '图生图';
  description = '基于图片生成新图片';
  inputs: string[] = ['image', 'prompt'];
  outputs: string[] = ['image'];
  portTypes = {
    image: 'image' as const,
    prompt: 'text' as const,
  };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image && !!context.config.serviceConfig;
  }

  getValidationError(context: ExecutionContext): string | null {
    if (!context.inputs.image) return '图生图缺少图片输入';
    if (!context.config.serviceConfig) return '图生图未配置 AI 服务，请在设置中添加并激活服务';
    return null;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // seed 为 -1 时随机生成
    const seed =
      context.config.seed !== undefined && context.config.seed >= 0
        ? context.config.seed
        : undefined;

    return generateViaServer('/api/ai/image-to-image', context.config.serviceConfig, {
      image: context.inputs.image,
      prompt: context.inputs.prompt || '',
      negativePrompt: context.config.negativePrompt || '',
      width: context.config.width || 1024,
      height: context.config.height || 1024,
      samples: 1,
      strength: context.config.strength || 0.75,
      steps: context.config.steps || 20,
      cfgScale: context.config.cfgScale || 7,
      seed,
    });
  }

  getConfigSchema(): NodeConfigSchema {
    return {
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
        label: '变化强度',
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

// 背景移除节点（占位实现）
export class BackgroundRemovalNode extends WorkflowNode {
  type: NodeType = 'backgroundRemoval';
  name = '背景移除';
  description = '移除图片背景';
  inputs: string[] = ['image'];
  outputs: string[] = ['image'];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 集成背景移除 API
    return context.inputs.image;
  }

  getConfigSchema(): NodeConfigSchema {
    return {};
  }
}
