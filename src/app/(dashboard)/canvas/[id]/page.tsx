'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { FabricObject } from 'fabric';
import {
  CanvasManager,
  ViewportState,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@/lib/canvas/CanvasManager';
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { LayersPanel } from '@/components/canvas/LayersPanel';
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, FolderOpen, ImageDown, Loader2, Save, Upload, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowBridge } from '@/stores/workflowBridge';
import { getAssetUrl } from '@/lib/utils';
import { AssetPickerDialog } from '@/components/shared/AssetPickerDialog';
import type { PickedAsset } from '@/components/shared/AssetPickerDialog';
import type {
  CanvasNodeData,
  CanvasConnection,
  CanvasNodeKind,
} from '@/lib/canvas/nodes/types';
import { createCanvasNode, normalizeCanvasConnections } from '@/lib/canvas/nodes/types';
import { CanvasNodeLayer } from '@/components/canvas/nodes/CanvasNodeLayer';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const GRID_SIZE = 48;

interface CanvasProjectSnapshot {
  fabric: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
}

export default function CanvasEditorPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canvasManager, setCanvasManager] = useState<CanvasManager | null>(null);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [objects, setObjects] = useState<FabricObject[]>([]);
  // 无限视口：fabric viewportTransform 与节点层 CSS transform 共用同一份状态
  const [viewport, setViewportState] = useState<ViewportState>({ x: 0, y: 0, k: 0.5 });
  // 空白拖拽平移状态（视口坐标系）
  const panRef = useRef<{
    startX: number;
    startY: number;
    startViewport: ViewportState;
  } | null>(null);

  // 仓库项目状态：初始加载完成后才允许自动保存
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const loadedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画布节点（借鉴 st-image 节点体系：纯数据驱动 DOM 卡片）
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const nodesStateRef = useRef(nodes);
  const connectionsStateRef = useRef(connections);
  const viewportLatestRef = useRef(viewport);
  const historyRef = useRef<CanvasProjectSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringHistoryRef = useRef(false);
  const [historyState, setHistoryState] = useState({ index: -1, length: 0, restoring: false });

  useEffect(() => {
    viewportLatestRef.current = viewport;
  }, [viewport]);

  // 保存到仓库（PATCH definition；手动保存时附带缩略图）
  const saveToDb = useCallback(
    async (options?: { silent?: boolean; withThumbnail?: boolean }) => {
      if (!canvasManager || !projectId) return;
      const payload = {
        version: 2,
        fabric: JSON.parse(canvasManager.exportToJSON()),
        nodes: nodesStateRef.current,
        connections: connectionsStateRef.current,
        viewport: viewportLatestRef.current,
      };
      if (!options?.silent) setSaving(true);
      try {
        const res = await fetch(`/api/canvas-projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            definition: payload,
            ...(options?.withThumbnail
              ? { thumbnail: canvasManager.exportToImage('png', 1.0) }
              : {}),
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '保存失败');
        if (!options?.silent) toast.success('画布已保存到仓库');
      } catch (err) {
        toast.error(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        if (!options?.silent) setSaving(false);
      }
    },
    [canvasManager, projectId]
  );

  const saveToDbRef = useRef(saveToDb);
  useEffect(() => {
    saveToDbRef.current = saveToDb;
  }, [saveToDb]);

  // 自动保存：内容变更后防抖 2s 写库（历史记录是全部变更的统一入口）
  const scheduleAutosave = useCallback(() => {
    if (!loadedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveToDbRef.current({ silent: true });
    }, 2000);
  }, []);

  const scheduleAutosaveRef = useRef(scheduleAutosave);
  useEffect(() => {
    scheduleAutosaveRef.current = scheduleAutosave;
  }, [scheduleAutosave]);

  // 离开编辑器时补一次未落库的保存
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        void saveToDbRef.current({ silent: true });
      }
    };
  }, []);

  const recordProjectHistory = useCallback(
    (next?: Partial<Pick<CanvasProjectSnapshot, 'nodes' | 'connections'>>) => {
      if (!canvasManager || isRestoringHistoryRef.current) return;
      const snapshot: CanvasProjectSnapshot = {
        fabric: canvasManager.exportToJSON(),
        nodes: structuredClone(next?.nodes ?? nodesStateRef.current),
        connections: structuredClone(next?.connections ?? connectionsStateRef.current),
      };
      const previous = historyRef.current[historyIndexRef.current];
      if (
        previous &&
        previous.fabric === snapshot.fabric &&
        JSON.stringify(previous.nodes) === JSON.stringify(snapshot.nodes) &&
        JSON.stringify(previous.connections) === JSON.stringify(snapshot.connections)
      ) {
        return;
      }

      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(snapshot);
      if (history.length > 50) history.shift();
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
      setHistoryState({ index: historyIndexRef.current, length: history.length, restoring: false });
      scheduleAutosaveRef.current();
    },
    [canvasManager]
  );

  const recordProjectHistoryRef = useRef(recordProjectHistory);
  useEffect(() => {
    recordProjectHistoryRef.current = recordProjectHistory;
  }, [recordProjectHistory]);

  const handleNodesChange = useCallback(
    (next: CanvasNodeData[]) => {
      nodesStateRef.current = next;
      setNodes(next);
      recordProjectHistory({ nodes: next });
    },
    [recordProjectHistory]
  );

  const handleConnectionsChange = useCallback(
    (next: CanvasConnection[]) => {
      connectionsStateRef.current = next;
      setConnections(next);
      recordProjectHistory({ connections: next });
    },
    [recordProjectHistory]
  );

  // 在视口中心添加节点；已有节点时排在上一个节点右侧（避免重叠遮挡）
  const handleAddNode = useCallback(
    (kind: CanvasNodeKind) => {
      const el = viewportRef.current;
      if (!el) return;
      const worldX = (el.clientWidth / 2 - viewport.x) / viewport.k;
      const worldY = (el.clientHeight / 2 - viewport.y) / viewport.k;
      const last = nodesStateRef.current[nodesStateRef.current.length - 1];
      const position = last
        ? {
            x: Math.round(last.position.x + last.width + 40),
            y: Math.round(last.position.y),
          }
        : {
            x: Math.round(worldX - 150),
            y: Math.round(worldY - 100),
          };
      // 节点创建放在 updater 外，避免 StrictMode 双调用产生重复节点
      const node = createCanvasNode(kind, position);
      handleNodesChange([...nodesStateRef.current, node]);
      setSelectedNodeId(node.id);
    },
    [handleNodesChange, viewport]
  );

  // 生成结果自动落到 fabric 图层（世界坐标 = 节点坐标）
  const handleAddLayerImage = useCallback(
    (url: string, position: { x: number; y: number }) => {
      canvasManager?.addImage(url, {
        left: position.x,
        top: position.y,
      });
    },
    [canvasManager]
  );

  // 从资源库插入图片：落在视口中心（与新增节点同一套坐标换算）
  const handleInsertAsset = useCallback(
    async (asset: PickedAsset) => {
      if (!canvasManager) return;
      const el = viewportRef.current;
      const v = viewportLatestRef.current;
      const position = el
        ? {
            x: Math.round((el.clientWidth / 2 - v.x) / v.k),
            y: Math.round((el.clientHeight / 2 - v.y) / v.k),
          }
        : { x: 100, y: 100 };
      try {
        await canvasManager.addImage(getAssetUrl(asset.filepath), {
          left: position.x,
          top: position.y,
        });
        toast.success(`已插入「${asset.filename}」`);
      } catch {
        toast.error('图片加载失败，资源文件可能已被删除');
      }
    },
    [canvasManager]
  );

  useEffect(() => {
    if (!canvasRef.current) return;

    const manager = new CanvasManager(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: '#ffffff',
    });

    setCanvasManager(manager);

    // 初始视口：画布在视口内居中
    const el = viewportRef.current;
    if (el) {
      const k = 0.5;
      const x = (el.clientWidth - CANVAS_WIDTH * k) / 2;
      const y = (el.clientHeight - CANVAS_HEIGHT * k) / 2;
      manager.setViewport(x, y, k);
      setViewportState({ x, y, k });
    }

    const canvas = manager.getCanvas();
    if (canvas) {
      // 监听选中变化
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
        recordProjectHistoryRef.current();
      };

      canvas.on('object:added', updateObjects);
      canvas.on('object:removed', updateObjects);
      canvas.on('object:modified', updateObjects);

      updateObjects();

      // 空白处拖拽平移（借鉴 st-image：空白按住拖动视口，对象上交给 fabric）
      const handlePanMove = (ev: PointerEvent) => {
        const pan = panRef.current;
        if (!pan) return;
        const dx = ev.clientX - pan.startX;
        const dy = ev.clientY - pan.startY;
        const { x, y, k } = pan.startViewport;
        manager.setViewport(x + dx, y + dy, k);
        setViewportState({ x: x + dx, y: y + dy, k });
      };

      const handlePanEnd = () => {
        panRef.current = null;
        window.removeEventListener('pointermove', handlePanMove);
        window.removeEventListener('pointerup', handlePanEnd);
        window.removeEventListener('pointercancel', handlePanEnd);
      };

      canvas.on('mouse:down', (e) => {
        if (e.target) return; // 点在对象上：交给 fabric 处理对象拖动
        setSelectedNodeId(null); // 空白处取消节点选择
        const native = e.e as MouseEvent;
        panRef.current = {
          startX: native.clientX,
          startY: native.clientY,
          startViewport: manager.getViewport(),
        };
        window.addEventListener('pointermove', handlePanMove);
        window.addEventListener('pointerup', handlePanEnd);
        window.addEventListener('pointercancel', handlePanEnd);
      });
    }

    return () => {
      manager.dispose();
    };
  }, []);

  useEffect(() => {
    if (canvasManager && historyRef.current.length === 0) {
      recordProjectHistory();
    }
  }, [canvasManager, recordProjectHistory]);

  // 恢复项目定义（version 2 复合格式；兼容旧版纯 fabric JSON）
  const loadDefinition = useCallback(
    async (payload: any) => {
      if (!canvasManager) return;
      isRestoringHistoryRef.current = true;
      try {
        if (payload?.version === 2) {
          if (payload.fabric) {
            await canvasManager.importFromJSON(JSON.stringify(payload.fabric));
          }
          const loadedNodes = payload.nodes || [];
          const loadedConnections = normalizeCanvasConnections(loadedNodes, payload.connections);
          nodesStateRef.current = loadedNodes;
          connectionsStateRef.current = loadedConnections;
          setNodes(loadedNodes);
          setConnections(loadedConnections);
          setSelectedNodeId(null);
          if (payload.viewport) {
            canvasManager.setViewport(
              payload.viewport.x,
              payload.viewport.y,
              payload.viewport.k
            );
            setViewportState(payload.viewport);
          }
        } else if (payload) {
          // 旧版：纯 fabric JSON
          await canvasManager.importFromJSON(JSON.stringify(payload));
          nodesStateRef.current = [];
          connectionsStateRef.current = [];
          setNodes([]);
          setConnections([]);
        }
        setObjects([...canvasManager.getObjects()]);
      } finally {
        isRestoringHistoryRef.current = false;
      }
    },
    [canvasManager]
  );

  const resetProjectHistory = useCallback(() => {
    if (!canvasManager) return;
    const snapshot: CanvasProjectSnapshot = {
      fabric: canvasManager.exportToJSON(),
      nodes: structuredClone(nodesStateRef.current),
      connections: structuredClone(connectionsStateRef.current),
    };
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    setHistoryState({ index: 0, length: 1, restoring: false });
  }, [canvasManager]);

  // 进入编辑器：加载仓库中的项目定义；不存在则退回仓库
  useEffect(() => {
    if (!canvasManager || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/canvas-projects/${projectId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '项目不存在');
        if (cancelled) return;
        setProjectName(data.project.name);
        await loadDefinition(data.project.definition);
        if (cancelled) return;
        resetProjectHistory();
        loadedRef.current = true;
      } catch (err) {
        toast.error(`加载画布项目失败：${err instanceof Error ? err.message : '未知错误'}`);
        router.replace('/canvas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canvasManager, projectId, loadDefinition, resetProjectHistory, router]);

  // 滚轮缩放（以鼠标为中心，0.05~5，与 st-image 交互一致）
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!canvasManager) return;
      // 节点表单可独立滚动，画布其余区域仍以滚轮缩放。
      const target = e.target as HTMLElement;
      if (target.closest('[data-canvas-scroll], textarea, input')) return;
      e.preventDefault();

      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const current = canvasManager.getViewport();
      // 反转 deltaY 符号：滚轮向上（deltaY<0）放大，向下缩小（与常见设计工具一致）
      const factor = Math.pow(1.1, -e.deltaY / 100);
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
      // 保持鼠标下的世界点不动：新平移量 = 鼠标屏幕坐标 - 世界点 * 新缩放
      const worldX = (mouseX - current.x) / current.k;
      const worldY = (mouseY - current.y) / current.k;
      const x = mouseX - worldX * k;
      const y = mouseY - worldY * k;

      canvasManager.setViewport(x, y, k);
      setViewportState({ x, y, k });
    },
    [canvasManager]
  );

  const restoreProjectHistory = useCallback(
    async (snapshot: CanvasProjectSnapshot, index: number) => {
      if (!canvasManager) return;
      isRestoringHistoryRef.current = true;
      setHistoryState((current) => ({ ...current, restoring: true }));
      try {
        await canvasManager.importFromJSON(snapshot.fabric);
        nodesStateRef.current = structuredClone(snapshot.nodes);
        connectionsStateRef.current = structuredClone(snapshot.connections);
        setNodes(nodesStateRef.current);
        setConnections(connectionsStateRef.current);
        setSelectedNodeId(null);
        setSelectedObject(null);
        setObjects([...canvasManager.getObjects()]);
        historyIndexRef.current = index;
        setHistoryState({ index, length: historyRef.current.length, restoring: false });
      } finally {
        isRestoringHistoryRef.current = false;
      }
      scheduleAutosaveRef.current();
    },
    [canvasManager]
  );

  const handleUndo = useCallback(() => {
    if (isRestoringHistoryRef.current || historyState.restoring || historyIndexRef.current <= 0) return;
    const index = historyIndexRef.current - 1;
    void restoreProjectHistory(historyRef.current[index], index);
  }, [historyState.restoring, restoreProjectHistory]);

  const handleRedo = useCallback(() => {
    if (
      isRestoringHistoryRef.current ||
      historyState.restoring ||
      historyIndexRef.current >= historyRef.current.length - 1
    ) return;
    const index = historyIndexRef.current + 1;
    void restoreProjectHistory(historyRef.current[index], index);
  }, [historyState.restoring, restoreProjectHistory]);

  const handleClearCanvas = useCallback(() => {
    if (!canvasManager) return;
    isRestoringHistoryRef.current = true;
    canvasManager.clear();
    nodesStateRef.current = [];
    connectionsStateRef.current = [];
    setNodes([]);
    setConnections([]);
    setSelectedNodeId(null);
    setSelectedObject(null);
    isRestoringHistoryRef.current = false;
    recordProjectHistory({ nodes: [], connections: [] });
  }, [canvasManager, recordProjectHistory]);

  // 消费工作流送入画布的图片队列（借鉴 InvokeAI Unified Canvas 的生成结果流转）
  useEffect(() => {
    if (!canvasManager || loading) return;

    const images = useWorkflowBridge.getState().popCanvasImages();
    if (images.length === 0) return;

    images.forEach((url, index) => {
      canvasManager.addImage(url, {
        left: 100 + index * 40,
        top: 100 + index * 40,
      });
    });

    toast.success(`已接收 ${images.length} 张工作流生成图片`);
  }, [canvasManager, loading]);

  // 画布导出并回传工作流，作为图片输入节点的数据源
  const handleSendToWorkflow = () => {
    if (!canvasManager) return;

    const dataUrl = canvasManager.exportToImage('png', 1.0);
    if (!dataUrl) return;

    useWorkflowBridge.getState().sendToWorkflow(dataUrl);
    toast.success('已发送到工作流，进入工作流仓库选择项目即可接收');
  };

  const handleExportImage = () => {
    if (!canvasManager) return;

    const dataUrl = canvasManager.exportToImage('png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `canvas_${Date.now()}.png`;
    link.click();

    toast.success('画布已导出');
  };

  // 保存到仓库（含缩略图）
  const handleSave = () => {
    void saveToDb({ withThumbnail: true });
  };

  // 导出 JSON 文件（兼容旧版本地文件流转）
  const handleExportJson = () => {
    if (!canvasManager) return;

    const payload = {
      version: 2,
      fabric: JSON.parse(canvasManager.exportToJSON()),
      nodes,
      connections,
      viewport,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `canvas_${Date.now()}.json`;
    link.click();

    toast.success('画布 JSON 已导出');
  };

  // 从 JSON 文件导入，导入内容随自动保存写回仓库
  const handleLoad = () => {
    if (!canvasManager) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const json = event.target?.result as string;
        try {
          const payload = JSON.parse(json);
          await loadDefinition(payload);
          resetProjectHistory();
          scheduleAutosaveRef.current();
          toast.success('画布已加载');
        } catch (err) {
          toast.error(`加载失败：${err instanceof Error ? err.message : '文件格式错误'}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 背景网格：随视口平移缩放（借鉴 st-image CanvasGrid）
  const gridStyle = {
    backgroundImage:
      'radial-gradient(circle, rgba(148,163,184,0.6) 1px, transparent 1px)',
    backgroundSize: `${GRID_SIZE * viewport.k}px ${GRID_SIZE * viewport.k}px`,
    backgroundPosition: `${viewport.x % (GRID_SIZE * viewport.k)}px ${
      viewport.y % (GRID_SIZE * viewport.k)
    }px`,
  };

  return (
    <div className="flex h-screen flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b bg-white p-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/canvas">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回仓库
            </Link>
          </Button>
          <span className="max-w-48 truncate text-sm font-medium text-gray-700">
            {projectName || '画布编辑器'}
          </span>
          <CanvasToolbar
            canvasManager={canvasManager}
            canUndo={!historyState.restoring && historyState.index > 0}
            canRedo={!historyState.restoring && historyState.index < historyState.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClearCanvas}
            onAddNode={handleAddNode}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssetPickerOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            资源库
          </Button>
          <Button variant="outline" size="sm" onClick={handleSendToWorkflow}>
            <Send className="mr-2 h-4 w-4" />
            送入工作流
          </Button>
          <Button variant="outline" size="sm" onClick={handleLoad}>
            <Upload className="mr-2 h-4 w-4" />
            导入
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportImage}>
            <ImageDown className="mr-2 h-4 w-4" />
            导出图片
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
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

        {/* 无限画布视口：fabric 画布（原生缩放平移）+ 节点层（CSS transform 同步） */}
        <div
          ref={viewportRef}
          className="relative flex-1 touch-none overscroll-contain overflow-hidden bg-gray-100"
          onWheel={handleWheel}
        >
          {/* 背景网格 */}
          <div className="pointer-events-none absolute inset-0" style={gridStyle} />

          {/* fabric 画布：视口变换由 fabric viewportTransform 控制（矢量重绘，缩放清晰） */}
          <div className="absolute left-0 top-0">
            <div className="shadow-lg">
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* 节点层（st-image 同构：DOM 节点 + SVG 连线，CSS transform 与 fabric 视口同步） */}
          <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
            <div
              className="pointer-events-none absolute origin-top-left"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
              }}
            >
              {canvasManager && (
                <CanvasNodeLayer
                  nodes={nodes}
                  connections={connections}
                  selectedNodeId={selectedNodeId}
                  viewport={viewport}
                  canvasManager={canvasManager}
                  onNodesChange={handleNodesChange}
                  onConnectionsChange={handleConnectionsChange}
                  onSelectNode={setSelectedNodeId}
                  onAddLayerImage={handleAddLayerImage}
                />
              )}
            </div>
          </div>

          {/* 项目加载遮罩 */}
          {loading && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center gap-2 bg-white/70 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              加载画布项目...
            </div>
          )}
        </div>

        {/* 右侧属性面板 */}
        <div className="w-64 border-l bg-white p-4">
          <PropertiesPanel
            selectedObject={selectedObject}
            canvasManager={canvasManager}
          />
        </div>
      </div>

      {/* 资源库选择器：插入图片到视口中心 */}
      <AssetPickerDialog
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        onSelect={(asset) => void handleInsertAsset(asset)}
      />
    </div>
  );
}
