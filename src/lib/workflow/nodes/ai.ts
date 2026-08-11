import { WorkflowNode, NodeType, ExecutionContext } from './base';
import { AIServiceManager } from '@/lib/ai/AIServiceManager';

// 文生图节点
export class TextToImageNode extends WorkflowNode {
  type: NodeType = 'textToImage';
  name = '文生图';
  description = '根据文本生成图片';
  inputs: string[] = ['prompt'];
  outputs: string[] = ['image'];

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.prompt && !!context.config.serviceConfig;
  }

  async execute(context: ExecutionContext): Promise<any> {
    const prompt = context.inputs.prompt;
    const config = context.config.serviceConfig;

    const adapter = AIServiceManager.getAdapter(config);

    const images = await adapter.textToImage({
      prompt,
      negativePrompt: context.config.negativePrompt || '',
      width: context.config.width || 1024,
      height: context.config.height || 1024,
      samples: 1,
      steps: context.config.steps || 20,
      cfgScale: context.config.cfgScale || 7,
    });

    return images[0];
  }

  getConfigSchema(): Record<string, any> {
    return {
      serviceConfig: {
        type: 'aiService',
        label: 'AI 服务',
        required: true,
      },
      negativePrompt: {
        type: 'string',
        label: '负向提示词',
        optional: true,
      },
      width: {
        type: 'number',
        label: '宽度',
        default: 1024,
      },
      height: {
        type: 'number',
        label: '高度',
        default: 1024,
      },
      steps: {
        type: 'number',
        label: '采样步数',
        default: 20,
      },
      cfgScale: {
        type: 'number',
        label: 'CFG Scale',
        default: 7,
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

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image && !!context.config.serviceConfig;
  }

  async execute(context: ExecutionContext): Promise<any> {
    const image = context.inputs.image;
    const prompt = context.inputs.prompt || '';
    const config = context.config.serviceConfig;

    const adapter = AIServiceManager.getAdapter(config);

    const images = await adapter.imageToImage({
      image,
      prompt,
      negativePrompt: context.config.negativePrompt || '',
      width: context.config.width || 1024,
      height: context.config.height || 1024,
      samples: 1,
      strength: context.config.strength || 0.75,
      steps: context.config.steps || 20,
      cfgScale: context.config.cfgScale || 7,
    });

    return images[0];
  }

  getConfigSchema(): Record<string, any> {
    return {
      serviceConfig: {
        type: 'aiService',
        label: 'AI 服务',
        required: true,
      },
      negativePrompt: {
        type: 'string',
        label: '负向提示词',
        optional: true,
      },
      strength: {
        type: 'number',
        label: '变化强度',
        default: 0.75,
        min: 0,
        max: 1,
        step: 0.05,
      },
      width: {
        type: 'number',
        label: '宽度',
        default: 1024,
      },
      height: {
        type: 'number',
        label: '高度',
        default: 1024,
      },
      steps: {
        type: 'number',
        label: '采样步数',
        default: 20,
      },
      cfgScale: {
        type: 'number',
        label: 'CFG Scale',
        default: 7,
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

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 集成背景移除 API
    return context.inputs.image;
  }

  getConfigSchema(): Record<string, any> {
    return {};
  }
}
