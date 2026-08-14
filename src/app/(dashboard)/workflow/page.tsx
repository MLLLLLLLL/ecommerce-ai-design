'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Plus, Search, Send, Trash2, Upload, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowBridge } from '@/stores/workflowBridge';

interface WorkflowMeta {
  id: string;
  name: string;
  description?: string | null;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function WorkflowRepoPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // zustand persist 在客户端水合后才有值，挂载后再展示横幅避免水合不一致
  const [mounted, setMounted] = useState(false);
  const hasCanvasImage = useWorkflowBridge((s) => s.canvasToWorkflow !== null);
  useEffect(() => setMounted(true), []);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.workflows);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Failed to load workflows:', error);
      toast.error(error.message || '加载工作流仓库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      router.push(`/workflow/${data.workflow.id}`);
    } catch (error: any) {
      toast.error(error.message || '新建工作流失败');
      setCreating(false);
    }
  };

  // 导入旧版本地 JSON 文件，创建为新仓库项目
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const definition = JSON.parse(event.target?.result as string);
          if (!Array.isArray(definition?.nodes) || !Array.isArray(definition?.edges)) {
            throw new Error('文件格式错误');
          }
          const res = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name.replace(/\.json$/i, ''),
              definition,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          toast.success('工作流已导入仓库');
          router.push(`/workflow/${data.workflow.id}`);
        } catch (error: any) {
          toast.error(`导入失败：${error instanceof Error ? error.message : '文件格式错误'}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleRename = async (workflow: WorkflowMeta) => {
    const name = window.prompt('重命名工作流', workflow.name)?.trim();
    if (!name || name === workflow.name) return;

    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('已重命名');
      void loadWorkflows();
    } catch (error: any) {
      toast.error(error.message || '重命名失败');
    }
  };

  const handleDelete = async (workflow: WorkflowMeta) => {
    if (!window.confirm(`确定要删除工作流「${workflow.name}」吗？`)) return;

    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('删除成功');
      void loadWorkflows();
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? workflows.filter((w) => w.name.toLowerCase().includes(keyword))
    : workflows;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 头部：标题 + 搜索 + 操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">工作流仓库</h1>
          <p className="mt-1 text-sm text-gray-500">共 {workflows.length} 个工作流项目</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工作流..."
              className="w-48 pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="mr-2 h-4 w-4" />
            导入 JSON
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            新建工作流
          </Button>
        </div>
      </div>

      {/* 画布 → 工作流 待接收横幅 */}
      {mounted && hasCanvasImage && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Send className="h-4 w-4" />
          有 1 张画布图片待接收，点击进入目标工作流项目后自动创建图片输入节点。
        </div>
      )}

      {/* 项目列表 */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载工作流仓库...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
          <Workflow className="h-12 w-12" />
          <p className="text-sm">{keyword ? '没有匹配的工作流项目' : '还没有工作流项目'}</p>
          {!keyword && (
            <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              新建第一个工作流
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((workflow) => (
            <Card
              key={workflow.id}
              className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => router.push(`/workflow/${workflow.id}`)}
            >
              <div className="flex h-36 items-center justify-center bg-gray-100">
                <Workflow className="h-10 w-10 text-gray-300" />
              </div>
              <CardContent className="p-3">
                <div className="truncate text-sm font-medium">{workflow.name}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {workflow.nodeCount} 个节点 · {new Date(workflow.updatedAt).toLocaleString('zh-CN')}
                  </span>
                  <div
                    className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="重命名"
                      onClick={() => handleRename(workflow)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="删除"
                      onClick={() => handleDelete(workflow)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
