'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CanvasManager, ViewportState } from '@/lib/canvas/CanvasManager';
import type { CanvasConnection, CanvasNodeData, CanvasPort } from '@/lib/canvas/nodes/types';
import {
  CANVAS_NODE_PORTS,
  createCanvasNode,
  generateConnectionId,
} from '@/lib/canvas/nodes/types';
import {
  computeResultPositions,
  executeConfigNode,
  validateConfigNode,
} from '@/lib/canvas/nodes/engine';
import { CanvasConnections } from './CanvasConnections';
import { CanvasNodeCard } from './CanvasNodeCard';

interface CanvasNodeLayerProps {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  selectedNodeId: string | null;
  viewport: ViewportState;
  canvasManager: CanvasManager | null;
  onNodesChange: (nodes: CanvasNodeData[]) => void;
  onConnectionsChange: (connections: CanvasConnection[]) => void;
  onSelectNode: (id: string | null) => void;
  onAddLayerImage: (url: string, position: { x: number; y: number }) => void;
}

export function CanvasNodeLayer({
  nodes,
  connections,
  selectedNodeId,
  viewport,
  canvasManager,
  onNodesChange,
  onConnectionsChange,
  onSelectNode,
  onAddLayerImage,
}: CanvasNodeLayerProps) {
  const [activeConnection, setActiveConnection] = useState<{
    fromNodeId: string;
    fromPort: CanvasPort;
    side: 'input' | 'output';
    toX: number;
    toY: number;
  } | null>(null);
  const viewportRef = useRef(viewport);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
  } | null>(null);
  const connectRef = useRef<{
    nodeId: string;
    port: CanvasPort;
    side: 'input' | 'output';
  } | null>(null);

  useEffect(() => {
    viewportRef.current = viewport;
    nodesRef.current = nodes;
    connectionsRef.current = connections;
  }, [connections, nodes, viewport]);

  const commitNodes = (next: CanvasNodeData[]) => {
    nodesRef.current = next;
    onNodesChange(next);
  };

  const commitConnections = (next: CanvasConnection[]) => {
    connectionsRef.current = next;
    onConnectionsChange(next);
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasManager?.getCanvas();
    const rect = canvas?.getElement().getBoundingClientRect();
    if (!canvasManager || !rect) return { x: 0, y: 0 };
    return canvasManager.screenToWorld(clientX - rect.left, clientY - rect.top);
  };

  const handleDragMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / viewportRef.current.k;
    const dy = (event.clientY - drag.startY) / viewportRef.current.k;
    commitNodes(
      nodesRef.current.map((node) =>
        node.id === drag.nodeId
          ? { ...node, position: { x: drag.origin.x + dx, y: drag.origin.y + dy } }
          : node
      )
    );
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);
    window.removeEventListener('pointercancel', handleDragEnd);
  };

  const handleConnectMove = (event: PointerEvent) => {
    const connection = connectRef.current;
    if (!connection) return;
    const world = clientToWorld(event.clientX, event.clientY);
    setActiveConnection({
      fromNodeId: connection.nodeId,
      fromPort: connection.port,
      side: connection.side,
      toX: world.x,
      toY: world.y,
    });
  };

  const handleConnectEnd = (event: PointerEvent) => {
    const connection = connectRef.current;
    const targetPortElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-canvas-port]');
    const targetNodeId = targetPortElement
      ?.closest<HTMLElement>('[data-canvas-node]')
      ?.getAttribute('data-node-id');
    const targetSide = targetPortElement?.getAttribute('data-side');
    const targetPortName = targetPortElement?.getAttribute('data-port-name');
    const targetPortType = targetPortElement?.getAttribute('data-port-type') as CanvasPort['type'] | null;

    if (
      connection &&
      targetNodeId &&
      targetPortName &&
      targetPortType &&
      targetNodeId !== connection.nodeId &&
      targetSide &&
      targetSide !== connection.side
    ) {
      const targetPort = { name: targetPortName, type: targetPortType };
      const fromNodeId = connection.side === 'output' ? connection.nodeId : targetNodeId;
      const fromPort = connection.side === 'output' ? connection.port : targetPort;
      const toNodeId = connection.side === 'output' ? targetNodeId : connection.nodeId;
      const toPort = connection.side === 'output' ? targetPort : connection.port;

      const fromNode = nodesRef.current.find((node) => node.id === fromNodeId);
      const toNode = nodesRef.current.find((node) => node.id === toNodeId);
      const outputExists = fromNode?.kind
        ? CANVAS_NODE_PORTS[fromNode.kind].outputs.some(
            (port) => port.name === fromPort.name && port.type === fromPort.type
          )
        : false;
      const inputExists = toNode?.kind
        ? CANVAS_NODE_PORTS[toNode.kind].inputs.some(
            (port) => port.name === toPort.name && port.type === toPort.type
          )
        : false;

      if (fromPort.type !== toPort.type) {
        toast.error('端口类型不匹配');
      } else if (!outputExists || !inputExists) {
        toast.error('端口不可用');
      } else if (
        connectionsRef.current.some(
          (item) => item.toNodeId === toNodeId && item.toPortName === toPort.name
        )
      ) {
        toast.error('该输入端口已有连线');
      } else {
        commitConnections([
          ...connectionsRef.current,
          {
            id: generateConnectionId(),
            fromNodeId,
            fromPortName: fromPort.name,
            toNodeId,
            toPortName: toPort.name,
          },
        ]);
      }
    }

    connectRef.current = null;
    setActiveConnection(null);
    window.removeEventListener('pointermove', handleConnectMove);
    window.removeEventListener('pointerup', handleConnectEnd);
    window.removeEventListener('pointercancel', handleConnectEnd);
  };

  // 监听器使用 ref 获取最新状态，挂载期间只注册一次。
  useEffect(() => {
    return () => {
      handleDragEnd();
      window.removeEventListener('pointermove', handleConnectMove);
      window.removeEventListener('pointerup', handleConnectEnd);
      window.removeEventListener('pointercancel', handleConnectEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartDrag = (event: React.PointerEvent, node: CanvasNodeData) => {
    event.preventDefault();
    dragRef.current = {
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...node.position },
    };
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', handleDragEnd);
  };

  const handleStartConnect = (
    event: React.PointerEvent,
    node: CanvasNodeData,
    port: CanvasPort,
    side: 'input' | 'output'
  ) => {
    event.preventDefault();
    connectRef.current = { nodeId: node.id, port, side };
    const world = clientToWorld(event.clientX, event.clientY);
    setActiveConnection({ fromNodeId: node.id, fromPort: port, side, toX: world.x, toY: world.y });
    window.addEventListener('pointermove', handleConnectMove);
    window.addEventListener('pointerup', handleConnectEnd);
    window.addEventListener('pointercancel', handleConnectEnd);
  };

  const handleExecute = async (requestedNode: CanvasNodeData) => {
    const node = nodesRef.current.find((item) => item.id === requestedNode.id) || requestedNode;
    const validationError = validateConfigNode(node, nodesRef.current, connectionsRef.current);
    if (validationError) {
      commitNodes(
        nodesRef.current.map((item) =>
          item.id === node.id
            ? { ...item, metadata: { ...item.metadata, status: 'error', error: validationError } }
            : item
        )
      );
      toast.error(validationError);
      return;
    }

    commitNodes(
      nodesRef.current.map((item) =>
        item.id === node.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                status: 'running',
                error: undefined,
                resultText: undefined,
                resultImages: undefined,
              },
            }
          : item
      )
    );

    try {
      const result = await executeConfigNode(node, nodesRef.current, connectionsRef.current);
      const images = result.images || (result.image ? [result.image] : []);
      const source = nodesRef.current.find((item) => item.id === node.id) || node;
      const resultNodes = images.map((url, index) => {
        const resultNode = createCanvasNode('image', computeResultPositions(source, images.length)[index]);
        resultNode.metadata.imageUrl = url;
        return resultNode;
      });
      const completedNodes: CanvasNodeData[] = nodesRef.current.map((item) =>
        item.id === node.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                status: 'success',
                error: undefined,
                resultText: result.text,
                resultImages: images.length > 0 ? images : undefined,
              },
            }
          : item
      );

      commitNodes([...completedNodes, ...resultNodes]);
      if (resultNodes.length > 0) {
        commitConnections([
          ...connectionsRef.current,
          ...resultNodes.map((resultNode) => ({
            id: generateConnectionId(),
            fromNodeId: node.id,
            fromPortName: 'image',
            toNodeId: resultNode.id,
            toPortName: 'image',
          })),
        ]);
        const positions = computeResultPositions(source, images.length);
        images.forEach((url, index) => onAddLayerImage(url, positions[index]));
      }

      toast.success(
        images.length > 1
          ? `已生成 ${images.length} 张图片并落到画布`
          : images.length === 1
            ? '图片已生成并落到画布'
            : '文案生成完成'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败';
      commitNodes(
        nodesRef.current.map((item) =>
          item.id === node.id
            ? { ...item, metadata: { ...item.metadata, status: 'error', error: message } }
            : item
        )
      );
      toast.error(message);
    }
  };

  const activeFrom = activeConnection
    ? nodes.find((node) => node.id === activeConnection.fromNodeId)
    : null;

  return (
    <>
      <CanvasConnections
        nodes={nodes}
        connections={connections}
        onDeleteConnection={(id) =>
          commitConnections(connectionsRef.current.filter((connection) => connection.id !== id))
        }
      />

      {activeConnection && activeFrom && (
        <svg className="pointer-events-none absolute overflow-visible" style={{ width: 1, height: 1 }}>
          <path
            d={buildTempPath(activeFrom, activeConnection.fromPort, activeConnection.side, activeConnection.toX, activeConnection.toY)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </svg>
      )}

      {nodes.map((node) => (
        <CanvasNodeCard
          key={node.id}
          node={node}
          selected={node.id === selectedNodeId}
          onSelect={onSelectNode}
          onDelete={(id) => {
            commitNodes(nodesRef.current.filter((item) => item.id !== id));
            commitConnections(
              connectionsRef.current.filter(
                (connection) => connection.fromNodeId !== id && connection.toNodeId !== id
              )
            );
            if (selectedNodeId === id) onSelectNode(null);
          }}
          onStartDrag={handleStartDrag}
          onStartConnect={handleStartConnect}
          onPatchMetadata={(nodeId, patch) =>
            commitNodes(
              nodesRef.current.map((item) =>
                item.id === nodeId
                  ? { ...item, metadata: { ...item.metadata, ...patch } }
                  : item
              )
            )
          }
          onUpdatePlanSlot={(nodeId, slotId, patch) =>
            commitNodes(
              nodesRef.current.map((item) =>
                item.id === nodeId
                  ? {
                      ...item,
                      metadata: {
                        ...item.metadata,
                        slots: (item.metadata.slots || []).map((slot) =>
                          slot.id === slotId ? { ...slot, ...patch } : slot
                        ),
                      },
                    }
                  : item
              )
            )
          }
          onExecute={handleExecute}
          onResultImage={onAddLayerImage}
        />
      ))}
    </>
  );
}

function buildTempPath(
  from: CanvasNodeData,
  port: CanvasPort,
  side: 'input' | 'output',
  toX: number,
  toY: number
): string {
  const ports = CANVAS_NODE_PORTS[from.kind][side === 'output' ? 'outputs' : 'inputs'];
  const index = ports.findIndex((item) => item.name === port.name);
  const startX = side === 'output' ? from.position.x + from.width : from.position.x;
  const startY =
    from.position.y + 28 + ((Math.max(index, 0) + 1) / (ports.length + 1)) * (from.height - 28);
  const curvature = Math.max(Math.abs(toX - startX) * 0.5, 50);
  return `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${toX - curvature} ${toY}, ${toX} ${toY}`;
}
