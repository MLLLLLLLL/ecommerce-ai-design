import {
  AIServiceConfig,
  TextToImageParams,
  ImageToImageParams,
} from '@/types/ai';

/**
 * AI服务适配器基类
 * 所有AI服务适配器都需要继承此类并实现抽象方法
 */
export abstract class AIServiceAdapter {
  protected config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  /**
   * 测试API连接是否正常
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * 文生图：根据文字描述生成图片
   */
  abstract textToImage(params: TextToImageParams): Promise<string[]>;

  /**
   * 图生图：基于参考图进行AI再创作
   */
  abstract imageToImage(params: ImageToImageParams): Promise<string[]>;

  /**
   * 获取当前配置
   */
  getConfig(): AIServiceConfig {
    return { ...this.config };
  }

  /**
   * 获取服务提供商名称
   */
  getProvider(): string {
    return this.config.provider;
  }

  /**
   * 获取服务名称
   */
  getName(): string {
    return this.config.name;
  }
}
