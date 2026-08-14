import { OrchestratorNode } from '@/lib/workflow/nodes/orchestrator';
import { generateViaServer } from '@/lib/workflow/nodes/ai';
import { useConfigStore } from '@/stores/useConfigStore';
import type { AIServiceConfig } from '@/types/ai';
import type {
  CanvasNodeData,
  CanvasConnection,
  CanvasNodeMetadata,
} from './types';

// ============================================
// 画布节点执行引擎（借鉴 st-image CanvasEditor 的编排执行）
// 复用 workflow 的 OrchestratorNode 实现（组合提示词/三模式/批量/文本模型），
// 输入来源为画布连线（text 节点→提示词，image 节点→参考图）
// ============================================

const orchestratorNode = new OrchestratorNode();

// 解析 AI 服务完整配置（serviceId → 配置；未选时回退激活服务）。
// 与 workflow 页一致：仅执行时局部解析，不写回节点数据，避免密钥泄漏
export function resolveServiceConfig(
  serviceId?: string
): AIServiceConfig | undefined {
  const { getServiceById, getActiveService } = useConfigStore.getState();
  const service =
    (typeof serviceId === 'string' && serviceId
      ? getServiceById(serviceId)
      : null) || getActiveService();
  return service || undefined;
}

// 按连线端口解析编排节点输入。旧画布文件不含端口名时，保留原有的顺序回退逻辑。
export function resolveConfigInputs(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[]
): Record<string, any> {
  const inputs: Record<string, any> = {};
  const textSlots = ['promptA', 'promptB', 'promptC'] as const;
  let textIndex = 0;

  for (const connection of connections.filter((item) => item.toNodeId === node.id)) {
    const upstream = nodes.find((item) => item.id === connection.fromNodeId);
    if (!upstream) continue;
    const text = upstream.kind === 'text'
      ? upstream.metadata.content || ''
      : upstream.metadata.resultText || '';
    const image = upstream.kind === 'image'
      ? upstream.metadata.imageUrl || ''
      : upstream.metadata.resultImages?.[0] || '';

    if (connection.toPortName === 'reference' && image) {
      inputs.reference = image;
    } else if (textSlots.includes(connection.toPortName as typeof textSlots[number]) && text) {
      inputs[connection.toPortName] = text;
    } else if (!connection.toPortName) {
      if (text && textIndex < textSlots.length) {
        inputs[textSlots[textIndex++]] = text;
      } else if (image && !inputs.reference) {
        inputs.reference = image;
      }
    }
  }
  return inputs;
}

// 节点元数据 → OrchestratorNode 的 config 形态
function metadataToConfig(
  metadata: CanvasNodeMetadata
): Record<string, any> {
  return {
    composerContent: metadata.composerContent,
    mode: metadata.mode || 'image',
    systemPrompt: metadata.systemPrompt,
    imageCount: metadata.imageCount || 1,
    serviceConfig: resolveServiceConfig(metadata.serviceId),
    negativePrompt: metadata.negativePrompt,
    strength: metadata.strength,
    width: metadata.genWidth,
    height: metadata.genHeight,
    steps: metadata.steps,
    cfgScale: metadata.cfgScale,
    seed: metadata.seed,
  };
}

// 执行编排节点（复用 OrchestratorNode：三模式/批量/文本模型/服务端中转）
export async function executeConfigNode(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[]
): Promise<{ text?: string; image?: string; images?: string[] }> {
  const inputs = resolveConfigInputs(node, nodes, connections);
  const config = metadataToConfig(node.metadata);
  const result = await orchestratorNode.execute({
    nodeId: node.id,
    inputs,
    config,
    previousResults: new Map(),
  });
  return result as { text?: string; image?: string; images?: string[] };
}

// 校验编排节点是否可执行（复用节点自身校验，错误信息具体）
export function validateConfigNode(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[]
): string | null {
  const inputs = resolveConfigInputs(node, nodes, connections);
  return orchestratorNode.getValidationError({
    nodeId: node.id,
    inputs,
    config: metadataToConfig(node.metadata),
    previousResults: new Map(),
  });
}

// 结果节点落位（借鉴 st-image runImageBranch：编排节点右侧 80px，每张间隔 400px）
export function computeResultPositions(
  source: CanvasNodeData,
  count: number
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    x: source.position.x + source.width + 80 + i * 400,
    y: source.position.y,
  }));
}

// 单张图片生成（多图规划槽位用；与编排节点同链路）
export interface PlanGenerateOptions {
  prompt: string;
  referenceUrl?: string;
  serviceId?: string;
  genWidth?: number;
  genHeight?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  negativePrompt?: string;
  strength?: number;
}

export async function generatePlanImage(
  opts: PlanGenerateOptions
): Promise<string> {
  const serviceConfig = resolveServiceConfig(opts.serviceId);
  if (!serviceConfig) {
    throw new Error('未配置 AI 服务，请在设置中添加并激活服务');
  }

  const endpoint = opts.referenceUrl
    ? ('/api/ai/image-to-image' as const)
    : ('/api/ai/text-to-image' as const);

  return generateViaServer(endpoint, serviceConfig, {
    ...(opts.referenceUrl
      ? { image: opts.referenceUrl, strength: opts.strength || 0.75 }
      : {}),
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt || '',
    width: opts.genWidth || 1024,
    height: opts.genHeight || 1024,
    samples: 1,
    steps: opts.steps || 20,
    cfgScale: opts.cfgScale || 7,
    seed: opts.seed !== undefined && opts.seed >= 0 ? opts.seed : undefined,
  });
}
