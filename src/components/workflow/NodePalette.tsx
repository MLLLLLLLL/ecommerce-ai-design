'use client';

import { NodeRegistry } from '@/lib/workflow/nodes/base';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const CATEGORY_LABELS: Record<string, string> = {
  input: '输入节点',
  ai: 'AI 处理',
  image: '图片处理',
  text: '文字处理',
  logic: '逻辑控制',
  output: '输出节点',
};

export const NODE_DRAG_MIME = 'application/workflownode';

/**
 * 节点库面板（借鉴 InvokeAI 节点库交互）
 * 按分类展示已注册节点，拖拽到画布创建节点
 */
export function NodePalette() {
  const categories = NodeRegistry.getAllByCategory();

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        <h2 className="mb-2 text-sm font-semibold">节点库</h2>
        {Object.entries(categories).map(([category, nodes]) => {
          if (nodes.length === 0) return null;
          return (
            <div key={category} className="mb-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {CATEGORY_LABELS[category] || category}
                </span>
                <Separator className="flex-1" />
              </div>
              <div className="space-y-1">
                {nodes.map((node) => (
                  <div
                    key={node.type}
                    className="cursor-grab rounded-md border bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary hover:bg-primary/5 active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(NODE_DRAG_MIME, node.type);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    title={node.description}
                  >
                    <div className="font-medium">{node.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
