import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';

/**
 * 文本模型配置（用于提示词优化等 LLM 功能）
 */
export interface TextModelConfig {
  baseURL: string; // OpenAI 兼容接口地址，如 https://api.openai.com/v1
  apiKey: string; // 持久化时加密存储
  model: string; // 模型名，如 gpt-4o、qwen-vl-max
}

interface TextModelState {
  // 状态
  config: TextModelConfig | null;

  // 查询方法（返回解密后的配置）
  getTextModel: () => TextModelConfig | null;

  // 修改方法（传入明文 apiKey，内部加密）
  setTextModel: (config: TextModelConfig) => void;
  clearTextModel: () => void;
}

/**
 * 文本模型配置Store
 * 独立于图像生成服务，供提示词优化使用
 */
export const useTextModelStore = create<TextModelState>()(
  persist(
    (set, get) => ({
      config: null,

      /**
       * 获取文本模型配置
       * 返回解密后的 apiKey；解密失败返回 null
       */
      getTextModel: () => {
        const { config } = get();

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

      /**
       * 保存文本模型配置
       * apiKey 加密后持久化
       */
      setTextModel: (config) => {
        set({
          config: {
            baseURL: config.baseURL.trim(),
            apiKey: encryptApiKey(config.apiKey.trim()),
            model: config.model.trim(),
          },
        });
        console.log('[TextModelStore] Text model config saved');
      },

      /**
       * 清除文本模型配置
       */
      clearTextModel: () => {
        set({ config: null });
        console.log('[TextModelStore] Text model config cleared');
      },
    }),
    {
      name: 'text-model-config', // localStorage key
      version: 1,
    }
  )
);
