'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout, Loader2, Pencil, Plus, Search, Send, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowBridge } from '@/stores/workflowBridge';

interface CanvasProjectMeta {
  id: string;
  name: string;
  thumbnail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function CanvasRepoPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<CanvasProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // zustand persist 在客户端水合后才有值，挂载后再展示横幅避免水合不一致
  const [mounted, setMounted] = useState(false);
  const pendingCount = useWorkflowBridge((s) => s.pendingCanvasImages.length);
  useEffect(() => setMounted(true), []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/canvas-projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Failed to load canvas projects:', error);
      toast.error(error.message || '加载画布仓库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/canvas-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      router.push(`/canvas/${data.project.id}`);
    } catch (error: any) {
      toast.error(error.message || '新建画布失败');
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
          const res = await fetch('/api/canvas-projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name.replace(/\.json$/i, ''),
              definition,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          toast.success('画布已导入仓库');
          router.push(`/canvas/${data.project.id}`);
        } catch (error: any) {
          toast.error(`导入失败：${error instanceof Error ? error.message : '文件格式错误'}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleRename = async (project: CanvasProjectMeta) => {
    const name = window.prompt('重命名画布', project.name)?.trim();
    if (!name || name === project.name) return;

    try {
      const res = await fetch(`/api/canvas-projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('已重命名');
      void loadProjects();
    } catch (error: any) {
      toast.error(error.message || '重命名失败');
    }
  };

  const handleDelete = async (project: CanvasProjectMeta) => {
    if (!window.confirm(`确定要删除画布「${project.name}」吗？`)) return;

    try {
      const res = await fetch(`/api/canvas-projects/${project.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('删除成功');
      void loadProjects();
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? projects.filter((p) => p.name.toLowerCase().includes(keyword))
    : projects;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 头部：标题 + 搜索 + 操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">画布仓库</h1>
          <p className="mt-1 text-sm text-gray-500">共 {projects.length} 个画布项目</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索画布..."
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
            新建画布
          </Button>
        </div>
      </div>

      {/* 工作流 → 画布 待接收横幅 */}
      {mounted && pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Send className="h-4 w-4" />
          有 {pendingCount} 张工作流图片待接收，点击进入目标画布项目后自动落位。
        </div>
      )}

      {/* 项目列表 */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载画布仓库...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
          <Layout className="h-12 w-12" />
          <p className="text-sm">{keyword ? '没有匹配的画布项目' : '还没有画布项目'}</p>
          {!keyword && (
            <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              新建第一个画布
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => router.push(`/canvas/${project.id}`)}
            >
              <div className="flex h-36 items-center justify-center overflow-hidden bg-gray-100">
                {project.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.thumbnail}
                    alt={project.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Layout className="h-10 w-10 text-gray-300" />
                )}
              </div>
              <CardContent className="p-3">
                <div className="truncate text-sm font-medium">{project.name}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {new Date(project.updatedAt).toLocaleString('zh-CN')}
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
                      onClick={() => handleRename(project)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="删除"
                      onClick={() => handleDelete(project)}
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
