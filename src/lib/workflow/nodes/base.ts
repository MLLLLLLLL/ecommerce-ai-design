// 节点类型定义
export type NodeType =
  | 'textInput'
  | 'imageInput'
  | 'parameterInput'
  | 'textToImage'
  | 'imageToImage'
  | 'backgroundRemoval'
  | 'upscale'
  | 'inpainting'
  | 'outpainting'
  | 'crop'
  | 'resize'
  | 'filter'
  | 'compose'
  | 'watermark'
  | 'textOverlay'
  | 'textExtract'
  | 'condition'
  | 'loop'
  | 'branch'
  | 'output';

// 节点数据接口
export interface NodeData {
  label: string;
  type: NodeType;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  config?: Record<string, any>;
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string;
  result?: any;
}

// 节点执行上下文
export interface ExecutionContext {
  nodeId: string;
  inputs: Record<string, any>;
  config: Record<string, any>;
  previousResults: Map<string, any>;
}

// 节点抽象基类
export abstract class WorkflowNode {
  abstract type: NodeType;
  abstract name: string;
  abstract description: string;
  abstract inputs: string[];
  abstract outputs: string[];

  // 验证输入
  abstract validate(context: ExecutionContext): Promise<boolean>;

  // 执行节点
  abstract execute(context: ExecutionContext): Promise<any>;

  // 获取节点配置 schema
  abstract getConfigSchema(): Record<string, any>;
}

// 节点注册表
export class NodeRegistry {
  private static nodes: Map<NodeType, WorkflowNode> = new Map();

  static register(type: NodeType, node: WorkflowNode) {
    this.nodes.set(type, node);
  }

  static get(type: NodeType): WorkflowNode | undefined {
    return this.nodes.get(type);
  }

  static getAll(): WorkflowNode[] {
    return Array.from(this.nodes.values());
  }

  static getAllByCategory(): Record<string, WorkflowNode[]> {
    const categories: Record<string, WorkflowNode[]> = {
      input: [],
      ai: [],
      image: [],
      text: [],
      logic: [],
      output: [],
    };

    this.nodes.forEach((node) => {
      const type = node.type;
      if (['textInput', 'imageInput', 'parameterInput'].includes(type)) {
        categories.input.push(node);
      } else if (
        [
          'textToImage',
          'imageToImage',
          'backgroundRemoval',
          'upscale',
          'inpainting',
          'outpainting',
        ].includes(type)
      ) {
        categories.ai.push(node);
      } else if (
        ['crop', 'resize', 'filter', 'compose', 'watermark'].includes(type)
      ) {
        categories.image.push(node);
      } else if (['textOverlay', 'textExtract'].includes(type)) {
        categories.text.push(node);
      } else if (['condition', 'loop', 'branch'].includes(type)) {
        categories.logic.push(node);
      } else if (type === 'output') {
        categories.output.push(node);
      }
    });

    return categories;
  }
}
