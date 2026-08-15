import { WorkflowNode, NodeType, ExecutionContext, NodeConfigSchema } from './base';

// 输出节点
export class OutputNode extends WorkflowNode {
  type: NodeType = 'output';
  name = '输出';
  description = '保存结果到资源库';
  inputs: string[] = ['image'];
  outputs: string[] = [];
  portTypes = { image: 'image' as const };

  async validate(context: ExecutionContext): Promise<boolean> {
    return !!context.inputs.image;
  }

  getValidationError(context: ExecutionContext): string | null {
    return context.inputs.image ? null : '输出节点缺少图片输入（请确认上游节点执行成功）';
  }

  async execute(context: ExecutionContext): Promise<any> {
    const imageUrl = context.inputs.image;
    if (context.config.autoSave !== false) {
      throw new Error('输出节点的资源库保存需要通过带任务上下文的服务端流程执行，当前画布执行器未启用该能力');
    }
    return {
      saved: false,
      imageUrl,
      message: '已生成输出，未写入资源库',
    };
  }

  getConfigSchema(): NodeConfigSchema {
    return {
      autoSave: {
        type: 'boolean',
        label: '自动保存',
        default: true,
      },
      folderId: {
        type: 'string',
        label: '保存到文件夹',
        description: '可选，留空保存到默认位置',
      },
    };
  }
}
