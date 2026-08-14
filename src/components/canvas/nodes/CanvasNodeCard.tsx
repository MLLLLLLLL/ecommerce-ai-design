'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type {
  CanvasNodeData,
  CanvasNodeMetadata,
  CanvasPlanSlot,
  CanvasPort,
} from '@/lib/canvas/nodes/types';
import { CANVAS_NODE_PORTS } from '@/lib/canvas/nodes/types';
import { ConfigNodeBody } from './ConfigNodeBody';
import { MultiImagePlanBody } from './MultiImagePlanBody';

// 端口颜色（与 workflow 端口着色一致：text 蓝 / image 紫）
const PORT_COLORS: Record<string, string> = {
  text: 'bg-blue-500',
  image: 'bg-purple-500',
};

interface CanvasNodeCardProps {
  node: CanvasNodeData;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartDrag: (e: React.PointerEvent, node: CanvasNodeData) => void;
  onStartConnect: (
    e: React.PointerEvent,
    node: CanvasNodeData,
    port: CanvasPort,
    side: 'input' | 'output'
  ) => void;
  onPatchMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
  onUpdatePlanSlot: (
    nodeId: string,
    slotId: string,
    patch: Partial<CanvasPlanSlot>
  ) => void;
  onExecute: (node: CanvasNodeData) => void;
  // 多图规划槽位结果落画布（世界坐标）
  onResultImage: (url: string, position: { x: number; y: number }) => void;
}

// 文本节点：常驻 textarea（借鉴 st-image Text 节点）
function TextNodeBody({
  node,
  onPatchMetadata,
}: {
  node: CanvasNodeData;
  onPatchMetadata: CanvasNodeCardProps['onPatchMetadata'];
}) {
  return (
    <textarea
      className="h-full w-full resize-none overscroll-contain rounded border bg-white p-2 text-xs outline-none focus:border-blue-400"
      value={node.metadata.content || ''}
      placeholder="输入文本内容（可连线作为编排节点的提示词）"
      onChange={(e) => onPatchMetadata(node.id, { content: e.target.value })}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

// 图片输入节点（借鉴 st-image Image 节点）：上传/URL 设置图片，可连线作为编排节点参考图
function ImageNodeBody({
  node,
  onPatchMetadata,
}: {
  node: CanvasNodeData;
  onPatchMetadata: CanvasNodeCardProps['onPatchMetadata'];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageUrl = node.metadata.imageUrl;

  const handleUpload = () => {
    fileRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      onPatchMetadata(node.id, { imageUrl: url });
    };
    reader.readAsDataURL(file);
  };

  const handleUrlApply = () => {
    const url = urlInput.trim();
    if (url) onPatchMetadata(node.id, { imageUrl: url });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded border bg-slate-50">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="图片节点"
            className="max-h-full max-w-full cursor-zoom-in object-contain"
            onDoubleClick={() => setPreviewOpen(true)}
            title="双击查看大图"
          />
        ) : (
          <span className="text-xs text-slate-400">未设置图片</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onClick={handleUpload}
          onPointerDown={(e) => e.stopPropagation()}
        >
          选择图片
        </button>
        {imageUrl && (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            onClick={() => onPatchMetadata(node.id, { imageUrl: undefined })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            清除
          </button>
        )}
      </div>
      {/* URL 引用输入（借鉴 st-image：图片节点可从资源 URL 设置） */}
      <div className="flex gap-1.5">
        <input
          type="text"
          className="min-w-0 flex-1 rounded border px-1.5 py-1 text-[10px] outline-none focus:border-blue-400"
          placeholder="粘贴图片 URL（可选）"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlApply()}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          className="rounded border px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          disabled={!urlInput.trim()}
          onClick={handleUrlApply}
          onPointerDown={(e) => e.stopPropagation()}
        >
          应用
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* 全屏预览（借鉴 st-image：双击图片打开查看器） */}
      {previewOpen && imageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setPreviewOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="大图预览"
            className="max-h-[90%] max-w-[90%] object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            onClick={() => setPreviewOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function CanvasNodeCard({
  node,
  selected,
  onSelect,
  onDelete,
  onStartDrag,
  onStartConnect,
  onPatchMetadata,
  onUpdatePlanSlot,
  onExecute,
  onResultImage,
}: CanvasNodeCardProps) {
  const ports = CANVAS_NODE_PORTS[node.kind];

  const renderBody = () => {
    switch (node.kind) {
      case 'text':
        return <TextNodeBody node={node} onPatchMetadata={onPatchMetadata} />;
      case 'image':
        return <ImageNodeBody node={node} onPatchMetadata={onPatchMetadata} />;
      case 'config':
        return (
          <ConfigNodeBody
            node={node}
            onPatchMetadata={onPatchMetadata}
            onExecute={onExecute}
          />
        );
      case 'multiImagePlan':
        return (
          <MultiImagePlanBody
            node={node}
            onPatchMetadata={onPatchMetadata}
            onUpdateSlot={onUpdatePlanSlot}
            onResultImage={onResultImage}
          />
        );
    }
  };

  const statusColor =
    node.metadata.status === 'running'
      ? 'border-blue-400'
      : node.metadata.status === 'success'
        ? 'border-emerald-400'
        : node.metadata.status === 'error'
          ? 'border-red-400'
          : selected
            ? 'border-blue-500'
            : 'border-slate-200';

  return (
    <div
      data-canvas-node
      data-node-id={node.id}
      className={`pointer-events-auto absolute rounded-lg border-2 bg-white shadow-md ${statusColor}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.width,
        height: node.height,
        zIndex: 10,
      }}
      onPointerDown={(e) => {
        // 端口命中检测在卡片级委托：事件可达性由卡片保证
        const portEl = (e.target as HTMLElement).closest('[data-canvas-port]');
        if (portEl) {
          e.stopPropagation();
          onStartConnect(
            e,
            node,
            {
              name: portEl.getAttribute('data-port-name') || '',
              type: (portEl.getAttribute('data-port-type') || 'text') as CanvasPort['type'],
            },
            portEl.getAttribute('data-side') === 'input' ? 'input' : 'output'
          );
          return;
        }
        onSelect(node.id);
      }}
    >
      {/* 标题栏（拖动把手） */}
      <div
        className="flex cursor-move items-center justify-between border-b border-slate-100 bg-slate-50 px-2 py-1"
        style={{ height: 28 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartDrag(e, node);
        }}
      >
        <span className="truncate text-xs font-medium text-slate-700">
          {node.title}
          {node.metadata.status === 'running' && '（执行中…）'}
          {node.metadata.status === 'error' && '（失败）'}
        </span>
        <button
          type="button"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          onClick={() => onDelete(node.id)}
          onPointerDown={(e) => e.stopPropagation()}
          title="删除节点"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="p-2" style={{ height: 'calc(100% - 28px)' }}>
        {renderBody()}
      </div>

      {/* 输入端口（左） */}
      {ports.inputs.map((port, i) => (
        <PortDot
          key={`in-${port.name}`}
          port={port}
          side="input"
          top={28 + ((i + 1) / (ports.inputs.length + 1)) * (node.height - 28)}
        />
      ))}

      {/* 输出端口（右） */}
      {ports.outputs.map((port, i) => (
        <PortDot
          key={`out-${port.name}`}
          port={port}
          side="output"
          top={28 + ((i + 1) / (ports.outputs.length + 1)) * (node.height - 28)}
        />
      ))}
    </div>
  );
}

function PortDot({
  port,
  side,
  top,
}: {
  port: CanvasPort;
  side: 'input' | 'output';
  top: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        zIndex: 50,
        ...(side === 'input' ? { left: -6 } : { right: -6 }),
        top: top - 7,
      }}
      title={`${side === 'input' ? '输入' : '输出'}：${port.name}（${port.type}）`}
    >
      <div
        data-canvas-port
        data-side={side}
        data-port-name={port.name}
        data-port-type={port.type}
        className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow ${PORT_COLORS[port.type] || 'bg-slate-400'}`}
      />
    </div>
  );
}
