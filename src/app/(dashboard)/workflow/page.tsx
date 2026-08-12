'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Save, Upload, Loader2, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { registerAllNodes, NodeRegistry, getDefaultConfig } from '@/lib/workflow/nodes';
import type { NodeType, NodeData } from '@/lib/workflow/nodes/base';
import { canConnect } from '@/lib/workflow/portTypes';
import { WorkflowEngine } from '@/lib/workflow/WorkflowEngine';
import { useConfigStore } from '@/stores/useConfigStore';
import { useWorkflowBridge } from '@/stores/workflowBridge';
import { NodePalette, NODE_DRAG_MIME } from '@/components/workflow/NodePalette';
import { WorkflowNodeCard } from '@/components/workflow/WorkflowNodeCard';
import { NodeConfigPanel } from '@/components/workflow/NodeConfigPanel';

// 注册所有节点实现（模块加载时执行一次，重复注册会覆盖，幂等安全）
registerAllNodes();

const nodeTypes = { workflow: WorkflowNodeCard };

// 创建工作流节点（React Flow 节点 type 统一为 'workflow'，业务类型存于 data.type）
function createNode(type: NodeType, position: { x: number; y: number }): Node<NodeData> {
  const impl = NodeRegistry.get(type);
  if (!impl) {
    throw new Error(`Node type ${type} not registered`);
  }
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    type: 'workflow',
    position,
    data: {
      label: impl.name,
      type,
      config: getDefaultConfig(impl.getConfigSchema()),
      status: 'idle',
    },
  };
}

// 判断结果是否为可展示/可送入画布的图片（含 /api/files 本地资源路由）
function isImageLike(value: any): boolean {
  return (
    typeof value === 'string' && /^(https?:|data:image|\/api\/)/.test(value)
  );
}

function WorkflowEditor() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  // 类型化连线校验（借鉴 InvokeAI：仅允许兼容数据类型的端口相连）
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      if (!source || !target || source.id === target.id) return false;
      return canConnect(
        source.data.type,
        connection.sourceHandle,
        target.data.type,
        connection.targetHandle
      );
    },
    [nodes]
  );

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)),
    [setEdges]
  );

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => setSelectedId(nodes[0]?.id ?? null),
    []
  );

  // 从节点库拖入画布创建节点
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(NODE_DRAG_MIME) as NodeType;
      if (!type || !NodeRegistry.get(type)) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodes((nds) => nds.concat(createNode(type, position)));
    },
    [screenToFlowPosition, setNodes]
  );

  // schema 驱动的节点配置更新
  const onConfigChange = useCallback(
    (nodeId: string, key: string, value: any) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config: { ...(n.data.config || {}), [key]: value } } }
            : n
        )
      );
    },
    [setNodes]
  );

  // 消费画布回传的图片：自动创建图片输入节点（借鉴 InvokeAI 画布-工作流双向流转）
  useEffect(() => {
    const image = useWorkflowBridge.getState().consumeCanvasImage();
    if (image) {
      const node = createNode('imageInput', { x: 80, y: 80 });
      node.data.config = { ...node.data.config, imageUrl: image };
      setNodes((nds) => nds.concat(node));
      toast.success('已接收画布图片，创建了图片输入节点');
    }
  }, [setNodes]);

  // 执行工作流：AI 节点的服务配置经中转站 adapter 链路解析
  const handleExecute = async () => {
    if (running || nodes.length === 0) return;

    // 重置状态
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' as const, error: undefined, result: undefined },
      }))
    );

    // 解析 AI 服务字段：serviceId → 完整配置（未选择时回退到激活服务）
    const { getServiceById, getActiveService } = useConfigStore.getState();
    const resolvedNodes = nodes.map((n) => {
      const impl = NodeRegistry.get(n.data.type);
      const schema = impl?.getConfigSchema() || {};
      const config = { ...(n.data.config || {}) };

      Object.entries(schema).forEach(([key, field]) => {
        if (field.type === 'service') {
          const serviceId = config[key];
          const service =
            (typeof serviceId === 'string' && serviceId
              ? getServiceById(serviceId)
              : null) || getActiveService();
          config[key] = service || undefined;
        }
      });

      return { ...n, data: { ...n.data, config } };
    });

    setRunning(true);
    try {
      const engine = new WorkflowEngine(
        resolvedNodes,
        edges,
        (nodeId, status) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, status: status as NodeData['status'] } }
                : n
            )
          );
        }
      );

      const result = await engine.execute();

      // 回写结果与错误信息
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            result: result.results.get(n.id),
            error: result.errors.get(n.id),
          },
        }))
      );

      if (result.success) {
        toast.success('工作流执行完成');
      } else {
        toast.error(`工作流执行完成，${result.errors.size} 个节点失败`);
      }
    } catch (error: any) {
      toast.error(`工作流执行出错：${error.message}`);
    } finally {
      setRunning(false);
    }
  };

  // 将节点结果图片送入画布
  const handleSendToCanvas = (imageUrl: string) => {
    useWorkflowBridge.getState().pushToCanvas(imageUrl);
    toast.success('已送入画布，打开画布页面即可查看');
  };

  const handleSave = () => {
    const workflow = { nodes, edges };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow_${Date.now()}.json`;
    link.click();
    toast.success('工作流已保存');
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const workflow = JSON.parse(json);
          // 加载时重置运行态
          setNodes(
            (workflow.nodes || []).map((n: Node<NodeData>) => ({
              ...n,
              data: { ...n.data, status: 'idle' as const, error: undefined, result: undefined },
            }))
          );
          setEdges(workflow.edges || []);
          toast.success('工作流已加载');
        } catch {
          toast.error('工作流文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  // 选中节点的结果预览
  const result = selectedNode?.data?.result;
  const resultImage = isImageLike(result)
    ? result
    : result && typeof result === 'object' && isImageLike(result.imageUrl)
      ? result.imageUrl
      : null;

  return (
    <div className="flex h-screen flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b bg-white p-2">
        <h1 className="text-xl font-bold">工作流编辑器</h1>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleLoad}>
            <Upload className="mr-2 h-4 w-4" />
            加载
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={!selectedId}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            删除节点
          </Button>
          <Button size="sm" onClick={handleExecute} disabled={running || nodes.length === 0}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {running ? '执行中...' : '执行'}
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧节点库 */}
        <div className="w-60 border-r bg-white">
          <NodePalette />
        </div>

        {/* React Flow 画布 */}
        <div className="flex-1" ref={wrapperRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* 右侧配置面板 */}
        <div className="flex w-72 flex-col border-l bg-white">
          <div className="flex-1 overflow-hidden">
            <NodeConfigPanel node={selectedNode} onConfigChange={onConfigChange} />
          </div>

          {/* 结果预览 */}
          {selectedNode && (result !== undefined || selectedNode.data.error) && (
            <div className="border-t p-4">
              <h3 className="mb-2 text-sm font-semibold">执行结果</h3>
              {selectedNode.data.error && (
                <p className="mb-2 break-all text-xs text-red-600">
                  {selectedNode.data.error}
                </p>
              )}
              {resultImage ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resultImage}
                    alt="节点结果"
                    className="max-h-40 w-full rounded border object-contain"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSendToCanvas(resultImage)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    送入画布
                  </Button>
                </div>
              ) : (
                result !== undefined && (
                  <ScrollArea className="max-h-40">
                    <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {typeof result === 'string'
                        ? result
                        : JSON.stringify(result, null, 2)}
                    </pre>
                  </ScrollArea>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 提示信息 */}
      <div className="border-t bg-muted p-2 text-center text-xs text-muted-foreground">
        从左侧拖拽节点到画布，连线时按端口类型校验；执行走已配置的 AI 中转站服务
      </div>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
