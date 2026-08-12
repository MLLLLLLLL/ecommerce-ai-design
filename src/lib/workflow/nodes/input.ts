import { WorkflowNode, NodeType, ExecutionContext, NodeConfigSchema } from './base';

// 文本输入节点
export class TextInputNode extends WorkflowNode {
  type: NodeType = 'textInput';
  name = '文本输入';
  description = '输入文本内容';
  inputs: string[] = [];
  outputs: string[] = ['text'];
  portTypes = { text: 'text' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return true;
  }

  async execute(context: ExecutionContext): Promise<any> {
    return context.config.text || '';
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      text: {
        type: 'string',
        label: '文本内容',
        default: '',
        multiline: true,
        required: true,
      },
    };
  }
}

// 图片输入节点
export class ImageInputNode extends WorkflowNode {
  type: NodeType = 'imageInput';
  name = '图片输入';
  description = '上传或选择图片';
  inputs: string[] = [];
  outputs: string[] = ['image'];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.config.imageUrl;
  }

  async execute(context: ExecutionContext): Promise<any> {
    return context.config.imageUrl;
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      imageUrl: {
        type: 'image',
        label: '图片',
        required: true,
      },
    };
  }
}

// 参数输入节点
export class ParameterInputNode extends WorkflowNode {
  type: NodeType = 'parameterInput';
  name = '参数输入';
  description = '输入数值参数';
  inputs: string[] = [];
  outputs: string[] = ['value'];
  portTypes = { value: 'number' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return context.config.value !== undefined;
  }

  async execute(context: ExecutionContext): Promise<any> {
    return context.config.value;
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      value: {
        type: 'float',
        label: '数值',
        default: 0,
        required: true,
      },
    };
  }
}
