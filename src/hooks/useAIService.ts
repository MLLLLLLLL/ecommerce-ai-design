import { useMemo } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { AIServiceManager } from '@/lib/ai/AIServiceManager';
import { AIServiceAdapter } from '@/lib/ai/base';
import { AIServiceConfig } from '@/types/ai';

/**
 * AI服务Hook
 * 简化AI服务的使用
 */
export function useAIService(serviceId?: string) {
  const { getActiveService, getServiceById } = useConfigStore();
  // 订阅配置版本号，服务增删改后重新计算配置
  const version = useConfigStore((state) => state.version);

  // 获取配置
  const config = useMemo(() => {
    if (serviceId) {
      return getServiceById(serviceId);
    }
    return getActiveService();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, version]);

  // 创建适配器
  const adapter = useMemo(() => {
    if (!config) return null;
    return AIServiceManager.getAdapter(config);
  }, [config]);

  return {
    config,
    adapter,
    isReady: !!adapter,
  };
}

/**
 * 批量AI服务Hook
 * 返回所有可用的服务
 */
export function useAIServices() {
  const { services, activeServiceId, setActiveService } = useConfigStore();

  // 解密所有服务的配置
  const decryptedServices = useMemo(() => {
    return services.map((s) => {
      try {
        const decrypted = useConfigStore.getState().getServiceById(s.id);
        return decrypted;
      } catch {
        return null;
      }
    }).filter((s): s is AIServiceConfig => s !== null);
  }, [services]);

  return {
    services: decryptedServices,
    activeServiceId,
    setActiveService,
    count: services.length,
  };
}

/**
 * 配置管理Hook
 * 简化配置的增删改查
 */
export function useConfigManager() {
  const {
    services,
    addService,
    updateService,
    deleteService,
    importServices,
    clearAllServices,
  } = useConfigStore();

  return {
    services,
    addService,
    updateService,
    deleteService,
    importServices,
    clearAllServices,
    count: services.length,
  };
}
