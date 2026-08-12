import { NodeType, PortType, NodeRegistry } from './nodes/base';

// 端口类型兼容性判断：同类型可连，'any' 与任意类型可连
export function isPortTypeCompatible(source: PortType, target: PortType): boolean {
  return source === 'any' || target === 'any' || source === target;
}

/**
 * 判断两个端口之间是否允许连线（借鉴 InvokeAI 的类型化连线约束）
 * @param sourceType 源节点类型
 * @param sourcePort 源端口名（outputs 中的名称）
 * @param targetType 目标节点类型
 * @param targetPort 目标端口名（inputs 中的名称）
 */
export function canConnect(
  sourceType: NodeType,
  sourcePort: string | null,
  targetType: NodeType,
  targetPort: string | null
): boolean {
  // 不允许自连
  const sourceImpl = NodeRegistry.get(sourceType);
  const targetImpl = NodeRegistry.get(targetType);
  if (!sourceImpl || !targetImpl) return false;

  const sourcePortType = sourcePort ? sourceImpl.getPortType(sourcePort) : 'any';
  const targetPortType = targetPort ? targetImpl.getPortType(targetPort) : 'any';

  return isPortTypeCompatible(sourcePortType, targetPortType);
}
