'use client';

import { useEffect, useRef, useState } from 'react';
import type { FabricObject } from 'fabric';
import { CanvasManager } from '@/lib/canvas/CanvasManager';
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { LayersPanel } from '@/components/canvas/LayersPanel';
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel';
import { Button } from '@/components/ui/button';
import { Download, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function CanvasPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasManager, setCanvasManager] = useState<CanvasManager | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [objects, setObjects] = useState<FabricObject[]>([]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const manager = new CanvasManager(canvasRef.current, {
      width: 1920,
      height: 1080,
      backgroundColor: '#f5f5f5',
    });

    setCanvasManager(manager);

    // 监听选中变化
    const canvas = manager.getCanvas();
    if (canvas) {
      canvas.on('selection:created', (e) => {
        setSelectedObject(e.selected?.[0] || null);
      });

      canvas.on('selection:updated', (e) => {
        setSelectedObject(e.selected?.[0] || null);
      });

      canvas.on('selection:cleared', () => {
        setSelectedObject(null);
      });

      // 监听对象变化
      const updateObjects = () => {
        setObjects([...manager.getObjects()]);
      };

      canvas.on('object:added', updateObjects);
      canvas.on('object:removed', updateObjects);
      canvas.on('object:modified', updateObjects);

      updateObjects();
    }

    return () => {
      manager.dispose();
    };
  }, []);

  const handleExport = () => {
    if (!canvasManager) return;

    const dataUrl = canvasManager.exportToImage('png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `canvas_${Date.now()}.png`;
    link.click();

    toast.success('画布已导出');
  };

  const handleSave = () => {
    if (!canvasManager) return;

    const json = canvasManager.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `canvas_${Date.now()}.json`;
    link.click();

    toast.success('画布已保存');
  };

  const handleLoad = () => {
    if (!canvasManager) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        canvasManager.importFromJSON(json);
        toast.success('画布已加载');
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex h-screen flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b bg-white p-2">
        <CanvasToolbar canvasManager={canvasManager} />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleLoad}>
            <Upload className="mr-2 h-4 w-4" />
            加载
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧工具面板 */}
        <div className="w-64 border-r bg-white p-4">
          <LayersPanel
            objects={objects}
            selectedObject={selectedObject}
            canvasManager={canvasManager}
          />
        </div>

        {/* 画布区域 */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex items-center justify-center">
            <div className="shadow-lg">
              <canvas ref={canvasRef} />
            </div>
          </div>
        </div>

        {/* 右侧属性面板 */}
        <div className="w-64 border-l bg-white p-4">
          <PropertiesPanel
            selectedObject={selectedObject}
            canvasManager={canvasManager}
          />
        </div>
      </div>
    </div>
  );
}
