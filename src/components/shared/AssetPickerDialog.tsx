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
import { FolderOpen, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getAssetUrl } from '@/lib/utils';

const IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const PAGE_SIZE = 24;

export interface PickedAsset {
  id: string;
  filename: string;
  filepath: string;
  thumbnail?: string | null;
  format: string;
  width?: number | null;
  height?: number | null;
}

interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: PickedAsset) => void;
}

/**
 * 编辑器内资源库选择器（画布/工作流共用）：搜索 + 图片网格 + 加载更多分页。
 * 取数与分页封装在内部，调用方只处理 onSelect 的插入逻辑。
 */
export function AssetPickerDialog({ open, onOpenChange, onSelect }: AssetPickerDialogProps) {
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pageToLoad: number, keyword: string, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        pageSize: String(PAGE_SIZE),
      });
      if (keyword.trim()) {
        params.append('search', keyword.trim());
      }
      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // 仅展示图片格式资源
      const images = (data.assets as PickedAsset[]).filter((a) =>
        IMAGE_FORMATS.includes((a.format || '').toLowerCase())
      );
      setAssets((prev) => (append ? [...prev, ...images] : images));
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages || 1);
    } catch (error: any) {
      console.error('Failed to load assets:', error);
      toast.error(error.message || '加载资源库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 打开时重置并加载第一页
  useEffect(() => {
    if (open) {
      setSearch('');
      setAssets([]);
      void load(1, '', false);
    }
  }, [open, load]);

  const handleSearch = () => {
    void load(1, search, false);
  };

  const handleLoadMore = () => {
    void load(page + 1, search, true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>从资源库插入</DialogTitle>
          <DialogDescription>选择图片插入当前项目，可连续插入多张</DialogDescription>
        </DialogHeader>

        {/* 搜索 */}
        <div className="flex gap-2">
          <Input
            placeholder="搜索提示词或文件名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* 图片网格 */}
        <div className="max-h-[55vh] min-h-40 overflow-y-auto">
          {assets.length === 0 && !loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FolderOpen className="h-10 w-10" />
              <p className="text-sm">暂无图片资源</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  title={`${asset.filename}${asset.width && asset.height ? `（${asset.width}×${asset.height}）` : ''}`}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(asset)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getAssetUrl(asset.thumbnail || asset.filepath)}
                    alt={asset.filename}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        {/* 分页 */}
        {page < totalPages && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              加载更多（{page} / {totalPages} 页）
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
