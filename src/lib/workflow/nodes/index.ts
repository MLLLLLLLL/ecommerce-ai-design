import { NodeRegistry } from './base';
import { TextInputNode, ImageInputNode, ParameterInputNode } from './input';
import { OutputNode } from './output';
import { TextToImageNode, ImageToImageNode, BackgroundRemovalNode } from './ai';
import { CropNode, ResizeNode, FilterNode } from './image';
import { ConditionNode } from './logic';
import { OrchestratorNode } from './orchestrator';

// 注册所有节点
export function registerAllNodes() {
  // 输入节点
  NodeRegistry.register('textInput', new TextInputNode());
  NodeRegistry.register('imageInput', new ImageInputNode());
  NodeRegistry.register('parameterInput', new ParameterInputNode());

  // 编排节点
  NodeRegistry.register('orchestrator', new OrchestratorNode());

  // AI 节点
  NodeRegistry.register('textToImage', new TextToImageNode());
  NodeRegistry.register('imageToImage', new ImageToImageNode());
  NodeRegistry.register('backgroundRemoval', new BackgroundRemovalNode());

  // 图片处理节点
  NodeRegistry.register('crop', new CropNode());
  NodeRegistry.register('resize', new ResizeNode());
  NodeRegistry.register('filter', new FilterNode());

  // 逻辑节点
  NodeRegistry.register('condition', new ConditionNode());

  // 输出节点
  NodeRegistry.register('output', new OutputNode());
}

// 导出所有节点类
export * from './base';
export * from './input';
export * from './output';
export * from './ai';
export * from './image';
export * from './logic';
export * from './orchestrator';
export * from '../portTypes';
