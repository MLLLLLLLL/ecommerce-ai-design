'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Download, Trash2, Eye, FolderOpen, FileText, Layout, Workflow, ListChecks } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { getAssetUrl } from '@/lib/utils';
import { ProjectPickerDialog } from '@/components/shared/ProjectPickerDialog';
import { BatchOperations } from '@/components/assets/BatchOperations';
import { useWorkflowBridge } from '@/stores/workflowBridge';
import { Checkbox } from '@/components/ui/checkbox';

interface Asset {
  id: string;
  filename: string;
  filepath: string;
  thumbnail?: string;
  format: string;
  width?: number;
  height?: number;
  prompt?: string;
  negativePrompt?: string;
  aiProvider?: string;
  source: string;
  filesize: number;
  createdAt: string;
  tags?: Array<{ id: string; name: string; color?: string }>;
  folder?: { id: string; name: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  // 加入画布/工作流：目标项目选择状态
  const [picker, setPicker] = useState<{ type: 'canvas' | 'workflow'; assets: Asset[] } | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const loadAssets = async (pageOverride?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: (pageOverride || pagination.page).toString(),
        pageSize: pagination.pageSize.toString(),
      });

      if (sourceFilter && sourceFilter !== 'all') {
        params.append('source', sourceFilter);
      }

      if (search.trim()) {
        params.append('search', search.trim());
      }

      const response = await fetch(`/api/assets?${params}`);
      const data = await response.json();

      if (data.success) {
        setAssets(data.assets);
        setPagination(data.pagination);
        setSelectedIds([]);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
      toast.error('加载资源失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 数据加载需要在客户端 effect 中触发，避免首屏读取浏览器状态。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, sourceFilter]);

  const handleSearch = () => {
    setPagination({ ...pagination, page: 1 });
    loadAssets(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个资源吗？')) return;

    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('删除成功');
        loadAssets();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const toggleMultiSelect = () => {
    setMultiSelectMode((enabled) => !enabled);
    setSelectedIds([]);
  };

  const toggleAssetSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const togglePageSelection = () => {
    const pageIds = assets.map((asset) => asset.id);
    setSelectedIds((current) => {
      const allSelected = pageIds.every((id) => current.includes(id));
      return allSelected
        ? current.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...current, ...pageIds]));
    });
  };

  const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id));

  const openBatchProjectPicker = (type: 'canvas' | 'workflow') => {
    if (selectedAssets.length === 0) {
      toast.error('请先选择资源');
      return;
    }
    const imageAssets = selectedAssets.filter((asset) =>
      ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes((asset.format || '').toLowerCase())
    );
    if (imageAssets.length === 0) {
      toast.error('选中的资源中没有可加入项目的图片');
      return;
    }
    if (imageAssets.length < selectedAssets.length) {
      toast.info(`已跳过 ${selectedAssets.length - imageAssets.length} 个非图片资源`);
    }
    setPicker({ type, assets: imageAssets });
  };

  // 加入画布/工作流：bridge 队列 + 跳转目标项目，编辑器加载完成后自动落位
  const handlePickProject = (projectId: string) => {
    if (!picker) return;
    const urls = picker.assets.map((asset) => getAssetUrl(asset.filepath));
    if (picker.type === 'canvas') {
      urls.forEach((url) => useWorkflowBridge.getState().pushToCanvas(url));
      toast.success(`已加入画布 ${urls.length} 张图片，进入项目后自动落位`);
      router.push(`/canvas/${projectId}`);
    } else {
      urls.forEach((url) => useWorkflowBridge.getState().pushToWorkflow(url));
      toast.success(`已加入工作流 ${urls.length} 张图片，进入项目后自动创建图片输入节点`);
      router.push(`/workflow/${projectId}`);
    }
    setPicker(null);
    setSelectedIds([]);
    setMultiSelectMode(false);
  };

  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择资源');
      return;
    }

    try {
      const response = await fetch('/api/assets/batch/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: selectedIds }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || '批量下载失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assets-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`已打包下载 ${selectedIds.length} 个资源`);
    } catch (error) {
      console.error('Batch download error:', error);
      toast.error(error instanceof Error ? error.message : '批量下载失败');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">资源库</h1>
            <p className="text-muted-foreground">管理你的 AI 生成图片</p>
          </div>
          <Button
            type="button"
            variant={multiSelectMode ? 'secondary' : 'outline'}
            onClick={toggleMultiSelect}
            aria-pressed={multiSelectMode}
          >
            <ListChecks className="mr-2 h-4 w-4" />
            {multiSelectMode ? '退出多选' : '多选'}
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4">
        <div className="flex flex-1 gap-2">
          <Input
            placeholder="搜索提示词或文件名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="来源筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="text-to-image">文生图</SelectItem>
            <SelectItem value="image-to-image">图生图</SelectItem>
            <SelectItem value="canvas">画布</SelectItem>
            <SelectItem value="workflow">工作流</SelectItem>
            <SelectItem value="marketing-assistant">营销助手</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 统计信息 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>共 {pagination.total} 个资源</span>
        <span>•</span>
        <span>
          第 {pagination.page} / {pagination.totalPages || 1} 页
        </span>
        {multiSelectMode && assets.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={assets.every((asset) => selectedIds.includes(asset.id))}
              onCheckedChange={togglePageSelection}
              aria-label="选择当前页资源"
            />
            选择当前页
          </label>
        )}
      </div>

      {multiSelectMode && selectedIds.length > 0 && (
        <BatchOperations
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
          onOperationComplete={() => void loadAssets()}
          onAddToCanvas={() => openBatchProjectPicker('canvas')}
          onAddToWorkflow={() => openBatchProjectPicker('workflow')}
          onDownload={handleBatchDownload}
        />
      )}

      {/* 资源网格 */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      ) : assets.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">暂无资源</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <div
                className={`relative aspect-square w-full overflow-hidden bg-muted ${
                  multiSelectMode ? 'cursor-pointer' : ''
                } ${selectedIds.includes(asset.id) ? 'ring-2 ring-inset ring-primary' : ''}`}
                role={multiSelectMode ? 'button' : undefined}
                tabIndex={multiSelectMode ? 0 : undefined}
                aria-pressed={multiSelectMode ? selectedIds.includes(asset.id) : undefined}
                aria-label={multiSelectMode ? `选择或取消选择 ${asset.filename}` : undefined}
                onClick={() => {
                  if (multiSelectMode) toggleAssetSelection(asset.id);
                }}
                onKeyDown={(event) => {
                  if (multiSelectMode && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    toggleAssetSelection(asset.id);
                  }
                }}
              >
                {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes((asset.format || '').toLowerCase()) ? (
                  <Image
                    src={getAssetUrl(asset.thumbnail || asset.filepath)}
                    alt={asset.filename}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground">
                    <FileText className="h-12 w-12" />
                    <span className="line-clamp-3 text-sm">{asset.filename}</span>
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <Badge variant="secondary" className="text-xs">
                    {asset.source}
                  </Badge>
                </div>
                {multiSelectMode && (
                  <div className="absolute left-2 top-2 rounded-md bg-background/90 p-1 shadow-sm">
                    <Checkbox
                      checked={selectedIds.includes(asset.id)}
                      onCheckedChange={() => toggleAssetSelection(asset.id)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      aria-label={`选择资源 ${asset.filename}`}
                    />
                  </div>
                )}
              </div>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {asset.width}×{asset.height}
                  </span>
                  <span>{formatFileSize(asset.filesize)}</span>
                </div>
                {asset.prompt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {asset.prompt}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {asset.aiProvider}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(asset.createdAt)}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(getAssetUrl(asset.filepath), '_blank')}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes((asset.format || '').toLowerCase()) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        title="加入画布"
                        onClick={() => setPicker({ type: 'canvas', assets: [asset] })}
                      >
                        <Layout className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="加入工作流"
                        onClick={() => setPicker({ type: 'workflow', assets: [asset] })}
                      >
                        <Workflow className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    title="单独下载"
                    aria-label={`单独下载 ${asset.filename}`}
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = getAssetUrl(asset.filepath);
                      link.download = asset.filename;
                      link.click();
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(asset.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setPagination({ ...pagination, page: pagination.page - 1 })
            }
            disabled={pagination.page === 1}
          >
            上一页
          </Button>
          <div className="flex items-center gap-2 px-4">
            <span className="text-sm text-muted-foreground">
              {pagination.page} / {pagination.totalPages}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setPagination({ ...pagination, page: pagination.page + 1 })
            }
            disabled={pagination.page === pagination.totalPages}
          >
            下一页
          </Button>
        </div>
      )}

      {/* 加入画布/工作流：目标项目选择 */}
      <ProjectPickerDialog
        type={picker?.type ?? 'canvas'}
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        onSelect={handlePickProject}
      />
    </div>
  );
}
