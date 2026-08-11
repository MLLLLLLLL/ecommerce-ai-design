'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { FabricObject } from 'fabric';
import { CanvasManager } from '@/lib/canvas/CanvasManager';

interface PropertiesPanelProps {
  selectedObject: FabricObject | null;
  canvasManager: CanvasManager | null;
}

export function PropertiesPanel({
  selectedObject,
  canvasManager,
}: PropertiesPanelProps) {
  const [properties, setProperties] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    angle: 0,
    opacity: 1,
    fill: '#000000',
  });

  useEffect(() => {
    if (!selectedObject) return;

    setProperties({
      left: Math.round(selectedObject.left || 0),
      top: Math.round(selectedObject.top || 0),
      width: Math.round(selectedObject.width || 0),
      height: Math.round(selectedObject.height || 0),
      angle: Math.round(selectedObject.angle || 0),
      opacity: selectedObject.opacity || 1,
      fill: (selectedObject as any).fill || '#000000',
    });
  }, [selectedObject]);

  const updateProperty = (key: string, value: any) => {
    if (!selectedObject || !canvasManager) return;

    selectedObject.set(key as any, value);
    canvasManager.getCanvas()?.renderAll();
    setProperties((prev) => ({ ...prev, [key]: value }));
  };

  if (!selectedObject) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">属性</h3>
        <p className="text-sm text-muted-foreground">请选择一个对象</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">属性</h3>
        <p className="text-xs text-muted-foreground">
          {selectedObject.type || 'Object'}
        </p>
      </div>

      {/* 位置 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">位置</h4>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">X</Label>
            <Input
              type="number"
              value={properties.left}
              onChange={(e) =>
                updateProperty('left', parseInt(e.target.value) || 0)
              }
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Y</Label>
            <Input
              type="number"
              value={properties.top}
              onChange={(e) =>
                updateProperty('top', parseInt(e.target.value) || 0)
              }
              className="h-8"
            />
          </div>
        </div>
      </div>

      {/* 尺寸 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">尺寸</h4>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">宽度</Label>
            <Input
              type="number"
              value={properties.width}
              onChange={(e) =>
                updateProperty('width', parseInt(e.target.value) || 0)
              }
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">高度</Label>
            <Input
              type="number"
              value={properties.height}
              onChange={(e) =>
                updateProperty('height', parseInt(e.target.value) || 0)
              }
              className="h-8"
            />
          </div>
        </div>
      </div>

      {/* 旋转 */}
      <div className="space-y-2">
        <Label className="text-xs">旋转: {properties.angle}°</Label>
        <Slider
          value={[properties.angle]}
          onValueChange={([value]) => updateProperty('angle', value)}
          min={0}
          max={360}
          step={1}
        />
      </div>

      {/* 透明度 */}
      <div className="space-y-2">
        <Label className="text-xs">
          透明度: {Math.round(properties.opacity * 100)}%
        </Label>
        <Slider
          value={[properties.opacity]}
          onValueChange={([value]) => updateProperty('opacity', value)}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      {/* 填充颜色 */}
      {(selectedObject.type === 'rect' ||
        selectedObject.type === 'circle' ||
        selectedObject.type === 'i-text') && (
        <div className="space-y-2">
          <Label className="text-xs">填充颜色</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={properties.fill}
              onChange={(e) => updateProperty('fill', e.target.value)}
              className="h-10 w-16"
            />
            <Input
              type="text"
              value={properties.fill}
              onChange={(e) => updateProperty('fill', e.target.value)}
              className="h-10 flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
