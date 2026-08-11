'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, X, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  _count?: {
    assets: number;
  };
}

interface TagManagerProps {
  onTagsChange?: () => void;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

export function TagManager({ onTagsChange }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: PRESET_COLORS[0],
    description: '',
  });

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();

      if (data.success) {
        setTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      toast.error('加载标签失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag);
      setFormData({
        name: tag.name,
        color: tag.color || PRESET_COLORS[0],
        description: tag.description || '',
      });
    } else {
      setEditingTag(null);
      setFormData({
        name: '',
        color: PRESET_COLORS[0],
        description: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入标签名称');
      return;
    }

    try {
      const url = editingTag ? `/api/tags/${editingTag.id}` : '/api/tags';
      const method = editingTag ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '操作失败');
      }

      toast.success(editingTag ? '标签已更新' : '标签已创建');
      setDialogOpen(false);
      loadTags();
      onTagsChange?.();
    } catch (error: any) {
      console.error('Save tag error:', error);
      toast.error(error.message || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个标签吗？')) return;

    try {
      const response = await fetch(`/api/tags/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '删除失败');
      }

      toast.success('标签已删除');
      loadTags();
      onTagsChange?.();
    } catch (error: any) {
      console.error('Delete tag error:', error);
      toast.error(error.message || '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">标签管理</h3>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新建标签
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无标签</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="group flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted"
            >
              <Badge
                style={{
                  backgroundColor: tag.color || '#6b7280',
                  color: 'white',
                }}
              >
                {tag.name}
              </Badge>
              {tag._count && (
                <span className="text-xs text-muted-foreground">
                  {tag._count.assets}
                </span>
              )}
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleOpenDialog(tag)}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDelete(tag.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? '编辑标签' : '新建标签'}</DialogTitle>
            <DialogDescription>
              设置标签的名称和颜色，便于资源分类管理
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>标签名称</Label>
              <Input
                placeholder="例如：商品主图"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>标签颜色</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-md transition-transform hover:scale-110 ${
                      formData.color === color ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input
                placeholder="标签用途说明"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
