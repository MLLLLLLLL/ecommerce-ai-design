import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 工作流与画布联动桥接 Store（借鉴 InvokeAI Unified Canvas 的生成结果双向流转）
 * - pendingCanvasImages: 工作流结果待送入画布的图片队列
 * - canvasToWorkflow: 画布导出待回传工作流的图片
 */
interface WorkflowBridgeState {
  pendingCanvasImages: string[];
  canvasToWorkflow: string | null;

  // 工作流 → 画布
  pushToCanvas: (imageUrl: string) => void;
  popCanvasImages: () => string[];

  // 画布 → 工作流
  sendToWorkflow: (dataUrl: string) => void;
  consumeCanvasImage: () => string | null;
}

export const useWorkflowBridge = create<WorkflowBridgeState>()(
  persist(
    (set, get) => ({
      pendingCanvasImages: [],
      canvasToWorkflow: null,

      pushToCanvas: (imageUrl) => {
        set((state) => ({
          pendingCanvasImages: [...state.pendingCanvasImages, imageUrl],
        }));
      },

      popCanvasImages: () => {
        const images = get().pendingCanvasImages;
        if (images.length > 0) {
          set({ pendingCanvasImages: [] });
        }
        return images;
      },

      sendToWorkflow: (dataUrl) => {
        set({ canvasToWorkflow: dataUrl });
      },

      consumeCanvasImage: () => {
        const image = get().canvasToWorkflow;
        if (image) {
          set({ canvasToWorkflow: null });
        }
        return image;
      },
    }),
    {
      name: 'workflow-canvas-bridge',
    }
  )
);
