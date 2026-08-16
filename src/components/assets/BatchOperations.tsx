'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, MoreVertical, Tag, FolderInput, Trash2, Layout, Workflow } from 'lucide-react';
import { toast } from 'sonner';

interface BatchOperationsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onOperationComplete: () => void;
  onAddToCanvas: () => void;
  onAddToWorkflow: () => void;
  onDownload: () => Promise<void>;
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface Folder {
  id: string;
  name: string;
}

export function BatchOperations({
  selectedIds,
  onClearSelection,
  onOperationComplete,
  onAddToCanvas,
  onAddToWorkflow,
  onDownload,
}: BatchOperationsProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'tag' | 'move' | 'delete'>('tag');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.success) {
        setTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const response = await fetch('/api/folders');
      const data = await response.json();
      if (data.success) {
        setFolders(data.folders);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

  useEffect(() => {
    // 打开批量操作栏时同步拉取标签和文件夹选项。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTags();
    void loadFolders();
  }, [loadFolders, loadTags]);

  const handleBatchOperation = async (action: string) => {
    if (selectedIds.length === 0) {
      toast.error('请先选择资源');
      return;
    }

    setProcessing(true);

    try {
      const requestData: { action: string; assetIds: string[]; data?: unknown } = {
        action,
        assetIds: selectedIds,
      };

      if (action === 'addTags') {
        if (selectedTags.length === 0) {
          toast.error('请选择标签');
          setProcessing(false);
          return;
        }
        requestData.data = { tagIds: selectedTags };
      } else if (action === 'move') {
        requestData.data = { folderId: selectedFolder };
      }

      const response = await fetch('/api/assets/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '操作失败');
      }

      toast.success(`成功处理 ${data.updated || data.deleted || 0} 个资源`);
      setDialogOpen(false);
      onClearSelection();
      onOperationComplete();
    } catch (error) {
      console.error('Batch operation error:', error);
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setProcessing(false);
    }
  };

  const openDialog = (type: 'tag' | 'move' | 'delete') => {
    setDialogType(type);
    setSelectedTags([]);
    setSelectedFolder(null);
    setDialogOpen(true);
  };

  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择资源');
      return;
    }
    setProcessing(true);
    try {
      await onDownload();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-2">
      <span className="text-sm font-medium">
        已选择 {selectedIds.length} 项
      </span>
      <Button size="sm" variant="outline" onClick={onClearSelection}>
        取消选择
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MoreVertical className="mr-2 h-4 w-4" />
            批量操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>批量操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDialog('tag')}>
            <Tag className="mr-2 h-4 w-4" />
            添加标签
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('move')}>
            <FolderInput className="mr-2 h-4 w-4" />
            移动到文件夹
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddToCanvas}>
            <Layout className="mr-2 h-4 w-4" />
            添加到画布
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddToWorkflow}>
            <Workflow className="mr-2 h-4 w-4" />
            添加到工作流
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleBatchDownload()} disabled={processing}>
            <Download className="mr-2 h-4 w-4" />
            批量下载
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openDialog('delete')}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            删除选中项
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 批量操作对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === 'tag'
                ? '批量添加标签'
                : dialogType === 'move'
                  ? '批量移动'
                  : '批量删除'}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'tag'
                ? `为选中的 ${selectedIds.length} 个资源添加标签`
                : dialogType === 'move'
                  ? `将选中的 ${selectedIds.length} 个资源移动到文件夹`
                  : `确定要删除选中的 ${selectedIds.length} 个资源吗？此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>

          {dialogType === 'tag' && (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTags.includes(tag.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTags([...selectedTags, tag.id]);
                      } else {
                        setSelectedTags(selectedTags.filter((id) => id !== tag.id));
                      }
                    }}
                  />
                  <Badge
                    style={{
                      backgroundColor: tag.color || '#6b7280',
                      color: 'white',
                    }}
                  >
                    {tag.name}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {dialogType === 'move' && (
            <Select value={selectedFolder || ''} onValueChange={setSelectedFolder}>
              <SelectTrigger>
                <SelectValue placeholder="选择目标文件夹" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">根目录</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() =>
                handleBatchOperation(
                  dialogType === 'tag'
                    ? 'addTags'
                    : dialogType === 'move'
                      ? 'move'
                      : 'delete'
                )
              }
              disabled={processing}
              variant={dialogType === 'delete' ? 'destructive' : 'default'}
            >
              {processing ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
