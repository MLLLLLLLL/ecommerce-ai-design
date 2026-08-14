import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { configEmitter } from '@/lib/ai/AIServiceManager';
import { AIServiceConfig } from '@/types/ai';
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';
import { generateId } from '@/lib/utils';

/**
 * 配置状态接口
 */
interface ConfigState {
  // 状态
  services: AIServiceConfig[];
  activeServiceId: string | null;
  version: number;

  // 查询方法
  getActiveService: () => AIServiceConfig | null;
  getServiceById: (id: string) => AIServiceConfig | null;
  getAllServices: () => AIServiceConfig[];

  // 修改方法
  addService: (config: Omit<AIServiceConfig, 'id'>) => string;
  updateService: (id: string, updates: Partial<AIServiceConfig>) => void;
  deleteService: (id: string) => void;
  setActiveService: (id: string) => void;

  // 批量操作
  importServices: (services: AIServiceConfig[]) => void;
  clearAllServices: () => void;
}

/**
 * AI服务配置Store
 * 使用Zustand管理配置状态，支持持久化
 */
export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      // ============================================
      // 初始状态
      // ============================================
      services: [],
      activeServiceId: null,
      version: 0,

      // ============================================
      // 查询方法
      // ============================================

      /**
       * 获取当前激活的服务
       * 返回解密后的配置
       */
      getActiveService: () => {
        const { services, activeServiceId } = get();
        const service = services.find((s) => s.id === activeServiceId);

        if (!service) {
          return null;
        }

        // 解密API Key
        try {
          return {
            ...service,
            apiKey: decryptApiKey(service.apiKey),
          };
        } catch (error) {
          console.error('[ConfigStore] Failed to decrypt API key:', error);
          return null;
        }
      },

      /**
       * 根据ID获取服务
       * 返回解密后的配置
       */
      getServiceById: (id: string) => {
        const service = get().services.find((s) => s.id === id);

        if (!service) {
          return null;
        }

        try {
          return {
            ...service,
            apiKey: decryptApiKey(service.apiKey),
          };
        } catch (error) {
          console.error('[ConfigStore] Failed to decrypt API key:', error);
          return null;
        }
      },

      /**
       * 获取所有服务
       * 返回加密的配置（不解密API Key）
       */
      getAllServices: () => {
        return get().services;
      },

      // ============================================
      // 修改方法
      // ============================================

      /**
       * 添加新服务
       * 自动加密API Key并生成ID
       */
      addService: (config) => {
        const newService: AIServiceConfig = {
          ...config,
          id: generateId(),
          apiKey: encryptApiKey(config.apiKey),
          maxConcurrent: config.maxConcurrent || 50,
        };

        set((state) => ({
          services: [...state.services, newService],
          version: state.version + 1,
          // 如果没有激活服务，自动激活新添加的
          activeServiceId: state.activeServiceId || newService.id,
        }));

        console.log('[ConfigStore] Service added:', newService.id);
        return newService.id;
      },

      /**
       * 更新服务配置
       * 如果更新API Key，会自动重新加密
       */
      updateService: (id, updates) => {
        set((state) => {
          const services = state.services.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...updates,
                  // 如果更新API Key，重新加密
                  apiKey: updates.apiKey ? encryptApiKey(updates.apiKey) : s.apiKey,
                }
              : s
          );

          return {
            services,
            version: state.version + 1,
          };
        });

        // 发出更新事件，通知AIServiceManager清除缓存
        configEmitter.emit('service:updated', id);
        console.log('[ConfigStore] Service updated:', id);
      },

      /**
       * 删除服务
       * 如果删除的是激活服务，自动切换到第一个服务
       */
      deleteService: (id) => {
        set((state) => {
          const services = state.services.filter((s) => s.id !== id);
          const activeServiceId =
            state.activeServiceId === id
              ? services.length > 0
                ? services[0].id
                : null
              : state.activeServiceId;

          return {
            services,
            activeServiceId,
            version: state.version + 1,
          };
        });

        // 发出删除事件
        configEmitter.emit('service:deleted', id);
        console.log('[ConfigStore] Service deleted:', id);
      },

      /**
       * 设置激活的服务
       */
      setActiveService: (id) => {
        const service = get().services.find((s) => s.id === id);

        if (!service) {
          console.warn('[ConfigStore] Service not found:', id);
          return;
        }

        set({ activeServiceId: id });
        configEmitter.emit('service:activated', id);
        console.log('[ConfigStore] Service activated:', id);
      },

      // ============================================
      // 批量操作
      // ============================================

      /**
       * 导入服务配置
       * 用于从备份恢复或批量导入
       */
      importServices: (services) => {
        const encryptedServices = services.map((s) => ({
          ...s,
          id: s.id || generateId(),
          apiKey: encryptApiKey(s.apiKey),
          maxConcurrent: s.maxConcurrent || 50,
        }));

        set((state) => ({
          services: [...state.services, ...encryptedServices],
          version: state.version + 1,
          activeServiceId:
            state.activeServiceId || (encryptedServices.length > 0 ? encryptedServices[0].id : null),
        }));

        console.log('[ConfigStore] Imported', encryptedServices.length, 'services');
      },

      /**
       * 清除所有服务
       * 谨慎使用
       */
      clearAllServices: () => {
        set({
          services: [],
          activeServiceId: null,
          version: 0,
        });

        console.log('[ConfigStore] All services cleared');
      },
    }),
    {
      name: 'ai-service-config', // localStorage key
      version: 1, // 配置版本，用于迁移
    }
  )
);
