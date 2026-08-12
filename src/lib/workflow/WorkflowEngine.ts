import { Node, Edge } from 'reactflow';
import { NodeType, NodeData, WorkflowNode, NodeRegistry, ExecutionContext } from './nodes/base';

export interface WorkflowExecutionResult {
  success: boolean;
  results: Map<string, any>;
  errors: Map<string, string>;
}

export class WorkflowEngine {
  private nodes: Node<NodeData>[] = [];
  private edges: Edge[] = [];
  private results: Map<string, any> = new Map();
  private nodeStatus: Map<string, 'idle' | 'running' | 'success' | 'error'> = new Map();
  private onStatusChange?: (nodeId: string, status: string) => void;

  constructor(
    nodes: Node<NodeData>[],
    edges: Edge[],
    onStatusChange?: (nodeId: string, status: string) => void
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.onStatusChange = onStatusChange;
  }

  // 拓扑排序
  private topologicalSort(): string[] {
    const inDegree: Map<string, number> = new Map();
    const adjList: Map<string, string[]> = new Map();

    // 初始化
    this.nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    });

    // 构建图
    this.edges.forEach((edge) => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);

      const list = adjList.get(edge.source) || [];
      list.push(edge.target);
      adjList.set(edge.source, list);
    });

    // BFS
    const queue: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    const result: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      neighbors.forEach((neighbor) => {
        const current = inDegree.get(neighbor) || 0;
        inDegree.set(neighbor, current - 1);

        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      });
    }

    // 检查是否有环
    if (result.length !== this.nodes.length) {
      throw new Error('Workflow contains cycles');
    }

    return result;
  }

  // 获取节点的输入值
  private getNodeInputs(nodeId: string): Record<string, any> {
    const inputs: Record<string, any> = {};

    // 找到所有指向该节点的边
    const incomingEdges = this.edges.filter((edge) => edge.target === nodeId);

    incomingEdges.forEach((edge) => {
      const sourceResult = this.results.get(edge.source);
      if (sourceResult !== undefined) {
        // 从边的 targetHandle 获取输入键名
        const inputKey = edge.targetHandle || 'input';
        inputs[inputKey] = this.extractOutput(sourceResult, edge.sourceHandle);
      }
    });

    return inputs;
  }

  // 提取源节点的指定输出
  // 分支类节点（如条件节点）结果为 { true: v } / { false: v }，按 sourceHandle 取对应分支
  private extractOutput(result: any, sourceHandle: string | null | undefined): any {
    if (
      sourceHandle &&
      result !== null &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      sourceHandle in result
    ) {
      return result[sourceHandle];
    }
    return result;
  }

  // 更新节点状态
  private updateNodeStatus(
    nodeId: string,
    status: 'idle' | 'running' | 'success' | 'error'
  ) {
    this.nodeStatus.set(nodeId, status);
    if (this.onStatusChange) {
      this.onStatusChange(nodeId, status);
    }
  }

  // 执行单个节点
  private async executeNode(nodeId: string): Promise<any> {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    this.updateNodeStatus(nodeId, 'running');

    try {
      const nodeType = node.data.type;
      const nodeImpl = NodeRegistry.get(nodeType);

      if (!nodeImpl) {
        throw new Error(`Node type ${nodeType} not registered`);
      }

      const inputs = this.getNodeInputs(nodeId);
      const context: ExecutionContext = {
        nodeId,
        inputs,
        config: node.data.config || {},
        previousResults: this.results,
      };

      // 验证输入
      const isValid = await nodeImpl.validate(context);
      if (!isValid) {
        throw new Error('Node validation failed');
      }

      // 执行节点
      const result = await nodeImpl.execute(context);

      this.results.set(nodeId, result);
      this.updateNodeStatus(nodeId, 'success');

      return result;
    } catch (error: any) {
      this.updateNodeStatus(nodeId, 'error');
      throw error;
    }
  }

  // 执行整个工作流
  async execute(): Promise<WorkflowExecutionResult> {
    this.results.clear();
    this.nodeStatus.clear();

    const errors: Map<string, string> = new Map();

    try {
      // 拓扑排序
      const executionOrder = this.topologicalSort();

      // 按顺序执行节点
      for (const nodeId of executionOrder) {
        try {
          await this.executeNode(nodeId);
        } catch (error: any) {
          console.error(`Error executing node ${nodeId}:`, error);
          errors.set(nodeId, error.message);
          // 继续执行其他独立的节点
        }
      }

      return {
        success: errors.size === 0,
        results: this.results,
        errors,
      };
    } catch (error: any) {
      console.error('Workflow execution error:', error);
      return {
        success: false,
        results: this.results,
        errors: new Map([['workflow', error.message]]),
      };
    }
  }

  // 获取节点状态
  getNodeStatus(nodeId: string): string {
    return this.nodeStatus.get(nodeId) || 'idle';
  }

  // 获取节点结果
  getNodeResult(nodeId: string): any {
    return this.results.get(nodeId);
  }

  // 重置引擎
  reset() {
    this.results.clear();
    this.nodeStatus.clear();
  }
}
