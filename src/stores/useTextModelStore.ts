import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';
import { generateId } from '@/lib/utils';

/**
 * 文本模型配置（用于提示词优化等 LLM 功能）
 */
export interface TextModelConfig {
  id: string;
  name: string;
  baseURL: string; // OpenAI 兼容接口地址，如 https://api.openai.com/v1
  apiKey: string; // 持久化时加密存储
  model: string; // 模型名，如 gpt-4o、qwen-vl-max
}

interface TextModelState {
  models: TextModelConfig[];
  activeModelId: string | null;

  // 查询方法（返回解密后的配置）
  getTextModel: () => TextModelConfig | null;
  getModelById: (id: string) => TextModelConfig | null;

  // 修改方法（传入明文 apiKey，内部加密）
  setTextModel: (config: TextModelConfig) => void;
  addTextModel: (config: Omit<TextModelConfig, 'id'>) => string;
  updateTextModel: (id: string, config: Partial<TextModelConfig>) => void;
  deleteTextModel: (id: string) => void;
  setActiveModel: (id: string) => void;
  clearTextModel: () => void;
}

/**
 * 文本模型配置Store
 * 独立于图像生成服务，供提示词优化使用
 */
export const useTextModelStore = create<TextModelState>()(
  persist(
    (set, get) => ({
      models: [],
      activeModelId: null,

      /**
       * 获取文本模型配置
       * 返回解密后的 apiKey；解密失败返回 null
       */
      getTextModel: () => {
        const { models, activeModelId } = get();
        const config = models.find((model) => model.id === activeModelId) || models[0];
        if (!config) {
          return null;
        }

        try {
          return {
            ...config,
            apiKey: decryptApiKey(config.apiKey),
          };
        } catch (error) {
          console.error('[TextModelStore] Failed to decrypt API key:', error);
          return null;
        }
      },

      getModelById: (id) => {
        const config = get().models.find((model) => model.id === id);
        if (!config) return null;
        try {
          return { ...config, apiKey: decryptApiKey(config.apiKey) };
        } catch (error) {
          console.error('[TextModelStore] Failed to decrypt API key:', error);
          return null;
        }
      },

      /**
       * 保存文本模型配置
       * apiKey 加密后持久化
       */
      setTextModel: (config) => {
        const id = config.id || generateId();
        const encrypted = {
          ...config,
          id,
          name: config.name?.trim() || config.model.trim(),
          baseURL: config.baseURL.trim(),
          apiKey: encryptApiKey(config.apiKey.trim()),
          model: config.model.trim(),
        };
        set((state) => ({
          models: state.models.some((item) => item.id === id)
            ? state.models.map((item) => (item.id === id ? encrypted : item))
            : [...state.models, encrypted],
          activeModelId: state.activeModelId || id,
        }));
        console.log('[TextModelStore] Text model config saved');
      },

      addTextModel: (config) => {
        const id = generateId();
        get().setTextModel({ ...config, id });
        return id;
      },

      updateTextModel: (id, config) => {
        const current = get().getModelById(id);
        if (current) get().setTextModel({ ...current, ...config, id });
      },

      deleteTextModel: (id) => {
        set((state) => {
          const models = state.models.filter((model) => model.id !== id);
          return {
            models,
            activeModelId:
              state.activeModelId === id ? models[0]?.id || null : state.activeModelId,
          };
        });
      },

      setActiveModel: (id) => {
        if (get().models.some((model) => model.id === id)) set({ activeModelId: id });
      },

      /**
       * 清除文本模型配置
       */
      clearTextModel: () => {
        set({ models: [], activeModelId: null });
        console.log('[TextModelStore] Text model config cleared');
      },
    }),
    {
      name: 'text-model-config', // localStorage key
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as { config?: Omit<TextModelConfig, 'id' | 'name'> & Partial<Pick<TextModelConfig, 'id' | 'name'>>; models?: TextModelConfig[]; activeModelId?: string | null };
        if (state.models) return state;
        if (state.config) {
          const id = state.config.id || generateId();
          return {
            models: [{ ...state.config, id, name: state.config.name || state.config.model }],
            activeModelId: id,
          };
        }
        return { models: [], activeModelId: null };
      },
    }
  )
);
