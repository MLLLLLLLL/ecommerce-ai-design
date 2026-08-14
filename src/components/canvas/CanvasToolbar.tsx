'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  MousePointer2,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  RotateCcw,
  FileText,
  ImagePlus,
  Workflow,
  Grid3X3,
} from 'lucide-react';
import { CanvasManager } from '@/lib/canvas/CanvasManager';
import type { CanvasNodeKind } from '@/lib/canvas/nodes/types';
import { useState } from 'react';

interface CanvasToolbarProps {
  canvasManager: CanvasManager | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  // 添加画布节点（借鉴 st-image 画布节点体系）
  onAddNode?: (kind: CanvasNodeKind) => void;
}

export function CanvasToolbar({
  canvasManager,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onAddNode,
}: CanvasToolbarProps) {
  const [activeTool, setActiveTool] = useState<string>('select');

  const handleDelete = () => {
    canvasManager?.deleteSelected();
  };

  const handleCopy = () => {
    canvasManager?.copySelected();
  };

  const handleUndo = () => {
    if (onUndo) onUndo();
    else canvasManager?.undo();
  };

  const handleRedo = () => {
    if (onRedo) onRedo();
    else canvasManager?.redo();
  };

  const handleClear = () => {
    if (confirm('确定要清空画布吗？')) {
      if (onClear) onClear();
      else canvasManager?.clear();
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

      {/* 画布节点（借鉴 st-image：文本/图片/编排/多图规划节点） */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddNode?.('text')}
        title="文本节点（可连线作为提示词）"
        disabled={!onAddNode}
      >
        <FileText className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddNode?.('image')}
        title="图片输入节点（上传或粘贴 URL，可连线作为参考图）"
        disabled={!onAddNode}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddNode?.('config')}
        title="编排节点（组合提示词，按模式生成图片/文案）"
        disabled={!onAddNode}
      >
        <Workflow className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddNode?.('multiImagePlan')}
        title="多图规划节点（AI 拆分提示词批量生成）"
        disabled={!onAddNode}
      >
        <Grid3X3 className="h-4 w-4" />
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
        disabled={canUndo === undefined ? !canvasManager?.canUndo() : !canUndo}
      >
        <Undo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleRedo}
        title="重做"
        disabled={canRedo === undefined ? !canvasManager?.canRedo() : !canRedo}
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
