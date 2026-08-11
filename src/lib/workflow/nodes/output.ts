import { WorkflowNode, NodeType, ExecutionContext } from './base';

// 输出节点
export class OutputNode extends WorkflowNode {
  type: NodeType = 'output';
  name = '输出';
  description = '保存结果到资源库';
  inputs: string[] = ['image'];
  outputs: string[] = [];

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  async execute(context: ExecutionContext): Promise<any> {
    const imageUrl = context.inputs.image;

    // TODO: 调用 API 保存到资源库
    // 这里需要调用 /api/assets 创建资源

    return {
      saved: true,
      imageUrl,
      message: '已保存到资源库',
    };
  }

  getConfigSchema(): Record<string, any> {
    return {
      autoSave: {
        type: 'boolean',
        label: '自动保存',
        default: true,
      },
      folderId: {
        type: 'string',
        label: '保存到文件夹',
        optional: true,
      },
    };
  }
}
