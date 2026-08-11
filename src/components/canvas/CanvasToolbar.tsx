'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  MousePointer2,
  Square,
  Circle,
  Type,
  Image,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  RotateCcw,
} from 'lucide-react';
import { CanvasManager } from '@/lib/canvas/CanvasManager';
import { useState } from 'react';

interface CanvasToolbarProps {
  canvasManager: CanvasManager | null;
}

export function CanvasToolbar({ canvasManager }: CanvasToolbarProps) {
  const [activeTool, setActiveTool] = useState<string>('select');

  const handleAddRect = () => {
    canvasManager?.addRect();
    setActiveTool('select');
  };

  const handleAddCircle = () => {
    canvasManager?.addCircle();
    setActiveTool('select');
  };

  const handleAddText = () => {
    canvasManager?.addText();
    setActiveTool('select');
  };

  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        canvasManager?.addImage(url);
      };
      reader.readAsDataURL(file);
    };
    input.click();
    setActiveTool('select');
  };

  const handleDelete = () => {
    canvasManager?.deleteSelected();
  };

  const handleCopy = () => {
    canvasManager?.copySelected();
  };

  const handleUndo = () => {
    canvasManager?.undo();
  };

  const handleRedo = () => {
    canvasManager?.redo();
  };

  const handleClear = () => {
    if (confirm('确定要清空画布吗？')) {
      canvasManager?.clear();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* 选择工具 */}
      <Button
        variant={activeTool === 'select' ? 'default' : 'ghost'}
        size="icon"
        onClick={() => setActiveTool('select')}
        title="选择"
      >
        <MousePointer2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* 形状工具 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleAddRect}
        title="矩形"
      >
        <Square className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleAddCircle}
        title="圆形"
      >
        <Circle className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleAddText}
        title="文字"
      >
        <Type className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleAddImage}
        title="图片"
      >
        <Image className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* 编辑工具 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title="复制"
        disabled={!canvasManager?.getActiveObject()}
      >
        <Copy className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        title="删除"
        disabled={!canvasManager?.getActiveObject()}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* 历史操作 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleUndo}
        title="撤销"
        disabled={!canvasManager?.canUndo()}
      >
        <Undo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleRedo}
        title="重做"
        disabled={!canvasManager?.canRedo()}
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* 清空画布 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClear}
        title="清空画布"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}
