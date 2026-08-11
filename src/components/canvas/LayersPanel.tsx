'use client';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { FabricObject } from 'fabric';
import { CanvasManager } from '@/lib/canvas/CanvasManager';

interface LayersPanelProps {
  objects: FabricObject[];
  selectedObject: FabricObject | null;
  canvasManager: CanvasManager | null;
}

export function LayersPanel({
  objects,
  selectedObject,
  canvasManager,
}: LayersPanelProps) {
  const getObjectName = (obj: FabricObject): string => {
    return obj.type || 'Object';
  };

  const handleSelectObject = (obj: FabricObject) => {
    canvasManager?.setActiveObject(obj);
  };

  const handleToggleVisibility = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.set('visible', !obj.visible);
    canvasManager?.getCanvas()?.renderAll();
  };

  const handleToggleLock = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.set('selectable', !obj.selectable);
    obj.set('evented', !obj.evented);
    canvasManager?.getCanvas()?.renderAll();
  };

  const handleDelete = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    canvasManager?.getCanvas()?.remove(obj);
    canvasManager?.getCanvas()?.renderAll();
  };

  const handleMoveUp = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    canvasManager?.moveObjectToLayer(obj, 'forward');
  };

  const handleMoveDown = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    canvasManager?.moveObjectToLayer(obj, 'backward');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">图层</h3>
        <p className="text-xs text-muted-foreground">
          共 {objects.length} 个对象
        </p>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-1">
          {objects.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无图层
            </p>
          ) : (
            objects
              .slice()
              .reverse()
              .map((obj, index) => {
                const isSelected = obj === selectedObject;
                const isVisible = obj.visible !== false;
                const isLocked = obj.selectable === false;

                return (
                  <div
                    key={index}
                    className={`group flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted ${
                      isSelected ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => handleSelectObject(obj)}
                  >
                    <div className="flex flex-1 items-center gap-2 overflow-hidden">
                      <div
                        className="h-8 w-8 flex-shrink-0 rounded border bg-white"
                        style={{
                          background:
                            obj.type === 'rect' || obj.type === 'circle'
                              ? (obj as any).fill || '#ccc'
                              : '#fff',
                        }}
                      />
                      <span className="truncate text-sm font-medium">
                        {getObjectName(obj)}
                      </span>
                    </div>

                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleToggleVisibility(obj, e)}
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleToggleLock(obj, e)}
                      >
                        {isLocked ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <Unlock className="h-3 w-3" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleMoveUp(obj, e)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleMoveDown(obj, e)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleDelete(obj, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
