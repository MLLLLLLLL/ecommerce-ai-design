'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Layout, Loader2, Plus, Search, Workflow } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectItem {
  id: string;
  name: string;
  thumbnail?: string | null;
  nodeCount?: number;
  updatedAt: string;
}

interface ProjectPickerDialogProps {
  type: 'canvas' | 'workflow';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (projectId: string) => void;
}

/**
 * 目标项目选择对话框（资源库「加入画布/加入工作流」用）：
 * 列出对应仓库的项目，空仓库时可直接新建并选中。
 */
export function ProjectPickerDialog({ type, open, onOpenChange, onSelect }: ProjectPickerDialogProps) {
  const isCanvas = type === 'canvas';
  const label = isCanvas ? '画布' : '工作流';
  const listUrl = isCanvas ? '/api/canvas-projects' : '/api/workflows';
  const listKey = isCanvas ? 'projects' : 'workflows';

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setProjects(data[listKey]);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      toast.error(error.message || `加载${label}仓库失败`);
    } finally {
      setLoading(false);
    }
  }, [listUrl, listKey, label]);

  // 打开时重置搜索并加载列表
  useEffect(() => {
    if (open) {
      setSearch('');
      void load();
    }
  }, [open, load]);

  // 空仓库兜底：新建项目并直接选中
  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(listUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const created = isCanvas ? data.project : data.workflow;
      onSelect(created.id);
    } catch (error: any) {
      toast.error(error.message || `新建${label}失败`);
      setCreating(false);
    }
  };

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? projects.filter((p) => p.name.toLowerCase().includes(keyword))
    : projects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>加入{label}</DialogTitle>
          <DialogDescription>选择目标{label}项目，进入后图片自动落位</DialogDescription>
        </DialogHeader>

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`搜索${label}项目...`}
            className="pl-8"
          />
        </div>

        {/* 项目网格 */}
        <div className="max-h-[55vh] min-h-40 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
              {isCanvas ? (
                <Layout className="h-10 w-10" />
              ) : (
                <Workflow className="h-10 w-10" />
              )}
              <p className="text-sm">
                {keyword ? `没有匹配的${label}项目` : `还没有${label}项目`}
              </p>
              {!keyword && (
                <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  新建{label}并加入
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="group overflow-hidden rounded-md border text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(project.id)}
                >
                  <div className="flex h-20 items-center justify-center overflow-hidden bg-gray-100">
                    {isCanvas && project.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.thumbnail}
                        alt={project.name}
                        className="h-full w-full object-cover"
                      />
                    ) : isCanvas ? (
                      <Layout className="h-8 w-8 text-gray-300" />
                    ) : (
                      <Workflow className="h-8 w-8 text-gray-300" />
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-sm font-medium">{project.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {!isCanvas && typeof project.nodeCount === 'number'
                        ? `${project.nodeCount} 个节点 · `
                        : ''}
                      {new Date(project.updatedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
