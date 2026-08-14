// ============================================
// 无限画布节点体系（借鉴 st-image：图片/文本/编排/多图规划节点 + 连线）
// 节点为纯数据驱动（DOM 卡片渲染），与 fabric 图层共享世界坐标系
// ============================================

export type CanvasNodeKind = 'text' | 'image' | 'config' | 'multiImagePlan';

// 端口类型（与 workflow 端口语义一致）
export type CanvasPortType = 'text' | 'image';

export interface CanvasPort {
  name: string;
  type: CanvasPortType;
}

// 执行状态
export type CanvasNodeStatus = 'idle' | 'running' | 'success' | 'error';

// 多图规划槽位
export interface CanvasPlanSlot {
  id: string;
  prompt: string;
  referenceUrl?: string;
  status: CanvasNodeStatus;
  error?: string;
  resultImage?: string;
}

export interface CanvasNodeMetadata {
  // 文本节点
  content?: string;
  // 图片节点
  imageUrl?: string;
  // 编排节点（字段与 workflow OrchestratorNode 的 config 一致；serviceId 执行时再解析为完整配置）
  composerContent?: string;
  mode?: 'image' | 'text' | 'both';
  systemPrompt?: string;
  imageCount?: number;
  serviceId?: string;
  negativePrompt?: string;
  strength?: number;
  genWidth?: number;
  genHeight?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  // 多图规划节点
  planPrompt?: string;
  planCount?: number;
  slots?: CanvasPlanSlot[];
  // 执行状态与结果
  status?: CanvasNodeStatus;
  error?: string;
  resultText?: string;
  resultImages?: string[];
}

export interface CanvasNodeData {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  metadata: CanvasNodeMetadata;
}

// 连线（借鉴 st-image CanvasConnection：fromNodeId → toNodeId）
export interface CanvasConnection {
  id: string;
  fromNodeId: string;
  fromPortName: string;
  toNodeId: string;
  toPortName: string;
}

// 各节点类型的端口定义。连线始终由输出端口拖向输入端口，端口名用于恢复输入语义。
export const CANVAS_NODE_PORTS: Record<
  CanvasNodeKind,
  { inputs: CanvasPort[]; outputs: CanvasPort[] }
> = {
  text: { inputs: [], outputs: [{ name: 'text', type: 'text' }] },
  image: {
    inputs: [{ name: 'image', type: 'image' }],
    outputs: [{ name: 'image', type: 'image' }],
  },
  config: {
    inputs: [
      { name: 'promptA', type: 'text' },
      { name: 'promptB', type: 'text' },
      { name: 'promptC', type: 'text' },
      { name: 'reference', type: 'image' },
    ],
    outputs: [
      { name: 'image', type: 'image' },
      { name: 'text', type: 'text' },
    ],
  },
  multiImagePlan: { inputs: [], outputs: [] },
};

// 节点标题
export const CANVAS_NODE_TITLES: Record<CanvasNodeKind, string> = {
  text: '文本节点',
  image: '图片节点',
  config: '编排节点',
  multiImagePlan: '多图规划',
};

export function generateNodeId(): string {
  return `cn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateConnectionId(): string {
  return `cc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCanvasConnections(
  nodes: CanvasNodeData[],
  value: unknown
): CanvasConnection[] {
  if (!Array.isArray(value)) return [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const occupiedInputs = new Set<string>();
  const normalized: CanvasConnection[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<CanvasConnection>;
    if (!candidate.id || !candidate.fromNodeId || !candidate.toNodeId) continue;
    const from = nodeById.get(candidate.fromNodeId);
    const to = nodeById.get(candidate.toNodeId);
    if (!from || !to) continue;

    const fromPort = CANVAS_NODE_PORTS[from.kind].outputs.find(
      (port) => port.name === candidate.fromPortName
    ) || CANVAS_NODE_PORTS[from.kind].outputs[0];
    if (!fromPort) continue;

    const toPort = CANVAS_NODE_PORTS[to.kind].inputs.find(
      (port) => port.name === candidate.toPortName && port.type === fromPort.type
    ) ||
      CANVAS_NODE_PORTS[to.kind].inputs.find(
        (port) =>
          port.type === fromPort.type &&
          !occupiedInputs.has(`${to.id}:${port.name}`)
      );
    if (!toPort) continue;

    occupiedInputs.add(`${to.id}:${toPort.name}`);
    normalized.push({
      id: candidate.id,
      fromNodeId: from.id,
      fromPortName: fromPort.name,
      toNodeId: to.id,
      toPortName: toPort.name,
    });
  }
  return normalized;
}

// 默认节点尺寸
export const CANVAS_NODE_DEFAULTS: Record<
  CanvasNodeKind,
  { width: number; height: number }
> = {
  text: { width: 260, height: 160 },
  image: { width: 240, height: 240 },
  config: { width: 300, height: 420 },
  multiImagePlan: { width: 320, height: 400 },
};

export function createCanvasNode(
  kind: CanvasNodeKind,
  position: { x: number; y: number }
): CanvasNodeData {
  const defaults = CANVAS_NODE_DEFAULTS[kind];
  const metadata: CanvasNodeMetadata = {};
  if (kind === 'text') metadata.content = '';
  if (kind === 'config') {
    metadata.mode = 'image';
    metadata.imageCount = 1;
    metadata.strength = 0.75;
    metadata.genWidth = 1024;
    metadata.genHeight = 1024;
    metadata.steps = 20;
    metadata.cfgScale = 7;
    metadata.seed = -1;
  }
  if (kind === 'multiImagePlan') {
    metadata.planCount = 4;
    metadata.slots = [];
  }
  return {
    id: generateNodeId(),
    kind,
    title: CANVAS_NODE_TITLES[kind],
    position,
    width: defaults.width,
    height: defaults.height,
    metadata,
  };
}
