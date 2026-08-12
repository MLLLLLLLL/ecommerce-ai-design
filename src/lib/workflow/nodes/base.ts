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

// 端口数据类型（借鉴 InvokeAI 的类型化连线约束）
export type PortType = 'text' | 'image' | 'number' | 'boolean' | 'any';

// ============================================
// 声明式节点配置字段 schema（借鉴 InvokeAI invocation field 元数据）
// ============================================

interface NodeFieldBase {
  label: string;
  description?: string;
  required?: boolean;
}

// 整数（对应 InvokeAI IntegerFieldInput）
export interface IntegerFieldSchema extends NodeFieldBase {
  type: 'integer';
  default?: number;
  min?: number;
  max?: number;
}

// 浮点数（对应 InvokeAI FloatFieldInput）
export interface FloatFieldSchema extends NodeFieldBase {
  type: 'float';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

// 字符串（对应 InvokeAI StringFieldInput，支持多行）
export interface StringFieldSchema extends NodeFieldBase {
  type: 'string';
  default?: string;
  multiline?: boolean;
}

// 布尔开关（对应 InvokeAI BooleanFieldInput）
export interface BooleanFieldSchema extends NodeFieldBase {
  type: 'boolean';
  default?: boolean;
}

// 枚举下拉（对应 InvokeAI combo/choices）
export interface ComboFieldSchema extends NodeFieldBase {
  type: 'combo';
  default?: string;
  options: string[];
}

// 随机种子（带随机/固定切换，-1 表示随机）
export interface SeedFieldSchema extends NodeFieldBase {
  type: 'seed';
  default?: number;
}

// 图片输入（URL 或 base64）
export interface ImageFieldSchema extends NodeFieldBase {
  type: 'image';
}

// AI 服务选择（存储 serviceId，执行时经 useConfigStore 解析为完整配置）
export interface ServiceFieldSchema extends NodeFieldBase {
  type: 'service';
}

export type NodeFieldSchema =
  | IntegerFieldSchema
  | FloatFieldSchema
  | StringFieldSchema
  | BooleanFieldSchema
  | ComboFieldSchema
  | SeedFieldSchema
  | ImageFieldSchema
  | ServiceFieldSchema;

// 节点配置 schema：字段名 → 字段定义
export type NodeConfigSchema = Record<string, NodeFieldSchema>;

// 根据 schema 提取默认配置值
export function getDefaultConfig(schema: NodeConfigSchema): Record<string, any> {
  const config: Record<string, any> = {};
  Object.entries(schema).forEach(([key, field]) => {
    if ('default' in field && field.default !== undefined) {
      config[key] = field.default;
    } else if (field.type === 'seed') {
      config[key] = -1; // 默认随机
    }
  });
  return config;
}

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

  // 端口类型映射（键为 inputs/outputs 中的端口名），未声明的端口视为 'any'
  portTypes: Record<string, PortType> = {};

  // 验证输入
  abstract validate(context: ExecutionContext): Promise<boolean>;

  // 可选的可读校验错误，供工作流界面回显具体缺失项
  getValidationError(_context: ExecutionContext): string | null {
    return null;
  }

  // 执行节点
  abstract execute(context: ExecutionContext): Promise<any>;

  // 获取节点配置 schema
  abstract getConfigSchema(): NodeConfigSchema;

  // 获取指定端口的类型
  getPortType(port: string): PortType {
    return this.portTypes[port] || 'any';
  }
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
