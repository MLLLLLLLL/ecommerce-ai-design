import { WorkflowNode, NodeType, ExecutionContext, NodeConfigSchema } from './base';

// 裁剪节点
export class CropNode extends WorkflowNode {
  type: NodeType = 'crop';
  name = '裁剪';
  description = '裁剪图片';
  inputs: string[] = ['image'];
  outputs: string[] = ['image'];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现图片裁剪
    return context.inputs.image;
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      x: { type: 'integer', label: 'X', default: 0, min: 0 },
      y: { type: 'integer', label: 'Y', default: 0, min: 0 },
      width: { type: 'integer', label: '宽度', default: 100, min: 1 },
      height: { type: 'integer', label: '高度', default: 100, min: 1 },
    };
  }
}

// 缩放节点
export class ResizeNode extends WorkflowNode {
  type: NodeType = 'resize';
  name = '缩放';
  description = '调整图片尺寸';
  inputs: string[] = ['image'];
  outputs: string[] = ['image'];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现图片缩放
    return context.inputs.image;
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      width: { type: 'integer', label: '宽度', default: 1024, min: 1, max: 8192 },
      height: { type: 'integer', label: '高度', default: 1024, min: 1, max: 8192 },
      maintainAspectRatio: { type: 'boolean', label: '保持比例', default: true },
    };
  }
}

// 滤镜节点
export class FilterNode extends WorkflowNode {
  type: NodeType = 'filter';
  name = '滤镜';
  description = '应用图片滤镜';
  inputs: string[] = ['image'];
  outputs: string[] = ['image'];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现滤镜效果
    return context.inputs.image;
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      filterType: {
        type: 'combo',
        label: '滤镜类型',
        options: ['blur', 'sharpen', 'grayscale', 'sepia'],
        default: 'blur',
      },
      intensity: {
        type: 'float',
        label: '强度',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}
