import { AIServiceConfig } from '@/types/ai';
import { AIServiceAdapter } from './base';
import { OpenAIAdapter } from './adapters/openai';
import { AlibabaAdapter } from './adapters/alibaba';
import { RelayAdapter } from './adapters/relay';

/**
 * AI服务工厂函数
 * 根据配置创建对应的适配器实例
 *
 * @param config AI服务配置
 * @returns AI服务适配器实例
 */
export function createAIService(config: AIServiceConfig): AIServiceAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config);

    case 'alibaba':
      return new AlibabaAdapter(config);

    case 'relay':
      return new RelayAdapter(config);

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * 验证AI服务配置
 */
export function validateConfig(config: Partial<AIServiceConfig>): string[] {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('Provider is required');
  }

  if (!config.name) {
    errors.push('Name is required');
  }

  if (!config.apiKey) {
    errors.push('API Key is required');
  }

  if (config.provider === 'relay' && !config.baseURL) {
    errors.push('Base URL is required for relay provider');
  }

  if (config.maxConcurrent && (config.maxConcurrent < 1 || config.maxConcurrent > 100)) {
    errors.push('Max concurrent must be between 1 and 100');
  }

  return errors;
}
