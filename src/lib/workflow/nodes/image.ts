import { WorkflowNode, NodeType, ExecutionContext } from './base';

// 裁剪节点
export class CropNode extends WorkflowNode {
  type: NodeType = 'crop';
  name = '裁剪';
  description = '裁剪图片';
  inputs: string[] = ['image'];
  outputs: string[] = ['image'];

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现图片裁剪
    return context.inputs.image;
  }

  getConfigSchema(): Record<string, any> {
    return {
      x: { type: 'number', label: 'X', default: 0 },
      y: { type: 'number', label: 'Y', default: 0 },
      width: { type: 'number', label: '宽度', default: 100 },
      height: { type: 'number', label: '高度', default: 100 },
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

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现图片缩放
    return context.inputs.image;
  }

  getConfigSchema(): Record<string, any> {
    return {
      width: { type: 'number', label: '宽度', default: 1024 },
      height: { type: 'number', label: '高度', default: 1024 },
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

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    // TODO: 实现滤镜效果
    return context.inputs.image;
  }

  getConfigSchema(): Record<string, any> {
    return {
      filterType: {
        type: 'select',
        label: '滤镜类型',
        options: ['blur', 'sharpen', 'grayscale', 'sepia'],
        default: 'blur',
      },
      intensity: { type: 'number', label: '强度', default: 0.5, min: 0, max: 1 },
    };
  }
}
