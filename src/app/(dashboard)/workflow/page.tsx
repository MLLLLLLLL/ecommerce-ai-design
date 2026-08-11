'use client';

import { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Play, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { label: '文本输入' },
    position: { x: 250, y: 25 },
  },
];

const initialEdges: Edge[] = [];

export default function WorkflowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleExecute = () => {
    toast.info('工作流执行功能开发中...');
  };

  const handleSave = () => {
    const workflow = {
      nodes,
      edges,
    };
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
        const json = event.target?.result as string;
        const workflow = JSON.parse(json);
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
        toast.success('工作流已加载');
      };
      reader.readAsText(file);
    };
    input.click();
  };

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
          <Button size="sm" onClick={handleExecute}>
            <Play className="mr-2 h-4 w-4" />
            执行
          </Button>
        </div>
      </div>

      {/* React Flow 画布 */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <MiniMap />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>

      {/* 提示信息 */}
      <div className="border-t bg-muted p-4 text-center text-sm text-muted-foreground">
        <p>
          工作流编排功能基础架构已完成。完整的节点面板、执行控制等功能可在后续迭代中完善。
        </p>
        <p className="mt-1">
          已实现：WorkflowEngine（拓扑排序、节点执行）、11 种节点类型、React Flow 集成
        </p>
      </div>
    </div>
  );
}
