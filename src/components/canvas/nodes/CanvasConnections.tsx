'use client';

import type { CanvasNodeData, CanvasConnection } from '@/lib/canvas/nodes/types';
import { CANVAS_NODE_PORTS } from '@/lib/canvas/nodes/types';

interface CanvasConnectionsProps {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  onDeleteConnection: (id: string) => void;
}

/**
 * 连线层（借鉴 st-image：SVG 贝塞尔曲线，坐标按节点 position 渲染时现算，
 * 节点移动后 React 重渲染自动跟随；双层 path = 透明热区 + 可见描边）
 */
export function CanvasConnections({
  nodes,
  connections,
  onDeleteConnection,
}: CanvasConnectionsProps) {
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ width: 1, height: 1 }}
    >
      {connections.map((conn) => {
        const from = nodes.find((n) => n.id === conn.fromNodeId);
        const to = nodes.find((n) => n.id === conn.toNodeId);
        if (!from || !to) return null;

        const start = getPortPosition(from, conn.fromPortName, 'output');
        const end = getPortPosition(to, conn.toPortName, 'input');
        if (!start || !end) return null;
        const { x: startX, y: startY } = start;
        const { x: endX, y: endY } = end;
        const dx = Math.abs(endX - startX);
        const curvature = Math.max(dx * 0.5, 50);
        const d = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${
          endX - curvature
        } ${endY}, ${endX} ${endY}`;

        return (
          <g
            key={conn.id}
            className="pointer-events-auto cursor-pointer"
            onDoubleClick={() => onDeleteConnection(conn.id)}
          >
            <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
            <path
              d={d}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="none"
            />
          </g>
        );
      })}
    </svg>
  );
}

function getPortPosition(
  node: CanvasNodeData,
  portName: string,
  side: 'input' | 'output'
): { x: number; y: number } | null {
  const ports = CANVAS_NODE_PORTS[node.kind][side === 'input' ? 'inputs' : 'outputs'];
  const index = ports.findIndex((port) => port.name === portName);
  if (index === -1) return null;

  const contentHeight = node.height - 28;
  return {
    x: side === 'input' ? node.position.x : node.position.x + node.width,
    y: node.position.y + 28 + ((index + 1) / (ports.length + 1)) * contentHeight,
  };
}
