'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData, NodeRegistry } from '@/lib/workflow/nodes/base';
import type { PortType } from '@/lib/workflow/nodes/base';
import { cn } from '@/lib/utils';

// 端口类型着色（借鉴 InvokeAI 的端口类型可视化）
export const PORT_COLORS: Record<PortType, string> = {
  text: '#3b82f6',
  image: '#a855f7',
  number: '#10b981',
  boolean: '#f59e0b',
  any: '#94a3b8',
};

const PORT_TYPE_LABELS: Record<PortType, string> = {
  text: '文本',
  image: '图片',
  number: '数值',
  boolean: '布尔',
  any: '任意',
};

// 执行状态样式
const STATUS_STYLES: Record<string, string> = {
  idle: 'border-border',
  running: 'border-blue-500 ring-2 ring-blue-200',
  success: 'border-green-500',
  error: 'border-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  idle: '',
  running: '执行中',
  success: '成功',
  error: '失败',
};

/**
 * 工作流节点卡片（借鉴 InvokeAI 节点渲染）
 * 左侧渲染输入端口、右侧渲染输出端口，端口按数据类型着色
 */
function WorkflowNodeCardInner({ data, selected }: NodeProps<NodeData>) {
  const impl = NodeRegistry.get(data.type);
  const inputs = impl?.inputs ?? [];
  const outputs = impl?.outputs ?? [];
  const status = data.status || 'idle';

  const portColor = (port: string) =>
    PORT_COLORS[impl?.getPortType(port) || 'any'];

  return (
    <div
      className={cn(
        'min-w-[160px] rounded-lg border-2 bg-white shadow-sm',
        STATUS_STYLES[status],
        selected && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between rounded-t-md border-b bg-muted/50 px-3 py-1.5">
        <span className="text-sm font-medium">{data.label}</span>
        {status !== 'idle' && (
          <span
            className={cn(
              'ml-2 text-xs',
              status === 'running' && 'animate-pulse text-blue-600',
              status === 'success' && 'text-green-600',
              status === 'error' && 'text-red-600'
            )}
          >
            {STATUS_LABELS[status]}
          </span>
        )}
      </div>

      {/* 端口区（行容器不设定位，Handle 以节点为基准定位在节点边缘） */}
      <div className="flex justify-between gap-4 px-3 py-2">
        {/* 输入端口 */}
        <div className="space-y-1.5">
          {inputs.map((port, i) => (
            <div key={port} className="flex items-center text-xs">
              <Handle
                type="target"
                position={Position.Left}
                id={port}
                style={{
                  background: portColor(port),
                  top: `${((i + 1) / (inputs.length + 1)) * 100}%`,
                  zIndex: 10,
                }}
              />
              <span className="text-muted-foreground">{port}</span>
            </div>
          ))}
        </div>

        {/* 输出端口 */}
        <div className="space-y-1.5 text-right">
          {outputs.map((port, i) => {
            const type = impl?.getPortType(port) || 'any';
            return (
              <div key={port} className="flex items-center justify-end gap-1 text-xs">
                <span className="text-muted-foreground">
                  {port}
                  <span className="ml-1 text-[10px] opacity-60">
                    {PORT_TYPE_LABELS[type]}
                  </span>
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={port}
                  style={{
                    background: portColor(port),
                    top: `${((i + 1) / (outputs.length + 1)) * 100}%`,
                    zIndex: 10,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 错误信息 */}
      {status === 'error' && data.error && (
        <div className="max-w-[200px] truncate border-t px-3 py-1 text-xs text-red-600" title={data.error}>
          {data.error}
        </div>
      )}
    </div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardInner);
