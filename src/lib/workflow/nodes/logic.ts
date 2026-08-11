import { WorkflowNode, NodeType, ExecutionContext } from './base';

// 条件判断节点
export class ConditionNode extends WorkflowNode {
  type: NodeType = 'condition';
  name = '条件判断';
  description = '根据条件分支';
  inputs: string[] = ['value'];
  outputs: string[] = ['true', 'false'];

  async validate(context: ExecutionContext): Promise<boolean> {
    return context.inputs.value !== undefined;
  }

  async execute(context: ExecutionContext): Promise<any> {
    const value = context.inputs.value;
    const operator = context.config.operator || '==';
    const compareValue = context.config.compareValue;

    let result = false;

    switch (operator) {
      case '==':
        result = value == compareValue;
        break;
      case '!=':
        result = value != compareValue;
        break;
      case '>':
        result = value > compareValue;
        break;
      case '<':
        result = value < compareValue;
        break;
      case '>=':
        result = value >= compareValue;
        break;
      case '<=':
        result = value <= compareValue;
        break;
    }

    return result ? { true: value } : { false: value };
  }

  getConfigSchema(): Record<string, any> {
    return {
      operator: {
        type: 'select',
        label: '运算符',
        options: ['==', '!=', '>', '<', '>=', '<='],
        default: '==',
      },
      compareValue: {
        type: 'string',
        label: '比较值',
        default: '',
      },
    };
  }
}
