'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { ArrowLeft, FolderOpen, Play, Save, Upload, Download, Loader2, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { registerAllNodes, NodeRegistry, getDefaultConfig } from '@/lib/workflow/nodes';
import type { NodeType, NodeData } from '@/lib/workflow/nodes/base';
import { canConnect } from '@/lib/workflow/portTypes';
import { WorkflowEngine } from '@/lib/workflow/WorkflowEngine';
import { useConfigStore } from '@/stores/useConfigStore';
import { useWorkflowBridge } from '@/stores/workflowBridge';
import { getAssetUrl } from '@/lib/utils';
import { AssetPickerDialog } from '@/components/shared/AssetPickerDialog';
import type { PickedAsset } from '@/components/shared/AssetPickerDialog';
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

// 载入定义时剥离运行态（与旧版文件加载行为一致）
function stripRuntimeState(nodes: Node<NodeData>[]): Node<NodeData>[] {
  return nodes.map((n) => ({
    ...n,
    data: { ...n.data, status: 'idle' as const, error: undefined, result: undefined },
  }));
}

function WorkflowEditor() {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;
  const router = useRouter();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // 仓库项目状态：初始加载完成后才允许自动保存
  const [workflowName, setWorkflowName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const loadedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesLatestRef = useRef(nodes);
  const edgesLatestRef = useRef(edges);
  // 最近一次已落库内容指纹：相同内容跳过写入，避免进入项目即刷新 updatedAt
  const lastSavedRef = useRef('');

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  useEffect(() => {
    nodesLatestRef.current = nodes;
    edgesLatestRef.current = edges;
  }, [nodes, edges]);

  // 保存到仓库（PATCH definition = { nodes, edges }）
  const saveToDb = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!workflowId) return;
      const definition = {
        nodes: nodesLatestRef.current,
        edges: edgesLatestRef.current,
      };
      const fingerprint = JSON.stringify(definition);
      if (fingerprint === lastSavedRef.current) return;
      if (!options?.silent) setSaving(true);
      try {
        const res = await fetch(`/api/workflows/${workflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '保存失败');
        lastSavedRef.current = fingerprint;
        if (!options?.silent) toast.success('工作流已保存到仓库');
      } catch (err) {
        toast.error(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        if (!options?.silent) setSaving(false);
      }
    },
    [workflowId]
  );

  const saveToDbRef = useRef(saveToDb);
  useEffect(() => {
    saveToDbRef.current = saveToDb;
  }, [saveToDb]);

  // 自动保存：节点/连线变更后防抖 2s 写库
  useEffect(() => {
    if (!loadedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveToDbRef.current({ silent: true });
    }, 2000);
  }, [nodes, edges]);

  // 离开编辑器时补一次未落库的保存
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        void saveToDbRef.current({ silent: true });
      }
    };
  }, []);

  // 进入编辑器：加载仓库中的工作流定义；不存在则退回仓库
  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '工作流不存在');
        if (cancelled) return;
        setWorkflowName(data.workflow.name);
        const definition = data.workflow.definition || {};
        const loadedNodes = stripRuntimeState(definition.nodes || []);
        const loadedEdges = definition.edges || [];
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        lastSavedRef.current = JSON.stringify({ nodes: loadedNodes, edges: loadedEdges });
        loadedRef.current = true;
      } catch (err) {
        toast.error(`加载工作流失败：${err instanceof Error ? err.message : '未知错误'}`);
        router.replace('/workflow');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, setNodes, setEdges, router]);

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
    if (loading) return;
    const bridge = useWorkflowBridge.getState();
    const images = bridge.popWorkflowImages();
    const legacyImage = bridge.consumeCanvasImage();
    if (legacyImage) images.push(legacyImage);
    if (images.length === 0) return;

    setNodes((nds) => nds.concat(images.map((image, index) => {
      const node = createNode('imageInput', { x: 80 + index * 40, y: 80 + index * 40 });
      node.data.config = { ...node.data.config, imageUrl: image };
      return node;
    })));
    toast.success(`已接收 ${images.length} 张图片，创建了图片输入节点`);
  }, [setNodes, loading]);

  // 从资源库插入图片：在视口中心创建图片输入节点（与画布回传同一模式）
  const handleInsertAsset = useCallback(
    (asset: PickedAsset) => {
      const el = wrapperRef.current;
      const rect = el?.getBoundingClientRect();
      const position = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 80, y: 80 };
      const node = createNode('imageInput', position);
      node.data.config = { ...node.data.config, imageUrl: getAssetUrl(asset.filepath) };
      setNodes((nds) => nds.concat(node));
      toast.success(`已插入「${asset.filename}」图片输入节点`);
    },
    [screenToFlowPosition, setNodes]
  );

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
    toast.success('已送入画布，进入画布仓库选择项目即可接收');
  };

  // 保存到仓库
  const handleSave = () => {
    void saveToDb();
  };

  // 导出 JSON 文件（兼容旧版本地文件流转）
  const handleExportJson = () => {
    const workflow = { nodes, edges };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow_${Date.now()}.json`;
    link.click();
    toast.success('工作流 JSON 已导出');
  };

  // 从 JSON 文件导入，导入内容随自动保存写回仓库
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
          setNodes(stripRuntimeState(workflow.nodes || []));
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
  // 编排节点批量出图结果：{ image, images, text? }
  const resultImages =
    result &&
    typeof result === 'object' &&
    Array.isArray((result as any).images) &&
    (result as any).images.length > 0
      ? ((result as any).images as string[]).filter(isImageLike)
      : null;
  const resultText =
    result && typeof result === 'object' && typeof (result as any).text === 'string'
      ? ((result as any).text as string)
      : null;

  return (
    <div className="flex h-screen flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b bg-white p-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/workflow">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回仓库
            </Link>
          </Button>
          <h1 className="max-w-64 truncate text-xl font-bold">
            {workflowName || '工作流编辑器'}
          </h1>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssetPickerOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            资源库
          </Button>
          <Button variant="outline" size="sm" onClick={handleLoad}>
            <Upload className="mr-2 h-4 w-4" />
            导入
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
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
        <div className="relative flex-1" ref={wrapperRef}>
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

          {/* 项目加载遮罩 */}
          {loading && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center gap-2 bg-white/70 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              加载工作流项目...
            </div>
          )}
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
              {resultImages && resultImages.length > 0 ? (
                <div className="space-y-2">
                  {resultText && (
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted p-2 text-xs text-muted-foreground">
                      {resultText}
                    </pre>
                  )}
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto">
                    {resultImages.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={img}
                        src={img}
                        alt="批量生成结果"
                        className="w-full rounded border object-contain"
                      />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => resultImages.forEach(handleSendToCanvas)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    全部送入画布（{resultImages.length} 张）
                  </Button>
                </div>
              ) : resultImage ? (
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

      {/* 资源库选择器：插入图片输入节点 */}
      <AssetPickerDialog
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        onSelect={handleInsertAsset}
      />
    </div>
  );
}

export default function WorkflowEditorPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
