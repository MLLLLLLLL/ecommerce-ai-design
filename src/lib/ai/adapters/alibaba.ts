import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams, AIServiceConfig } from '@/types/ai';

/**
 * 阿里百炼（通义万相）适配器
 * 文档: https://help.aliyun.com/zh/model-studio/
 */
export class AlibabaAdapter extends AIServiceAdapter {
  private baseURL: string;

  constructor(config: AIServiceConfig) {
    super(config);
    this.baseURL = config.baseURL || 'https://dashscope.aliyuncs.com/api/v1';
  }

  /**
   * 测试阿里百炼API连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 使用一个简单的请求测试连接
      const response = await fetch(`${this.baseURL}/services/aigc/text2image/image-synthesis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: this.config.model || 'wanx-v1',
          input: {
            prompt: 'test',
          },
          parameters: {
            n: 1,
            size: '1024*1024',
          },
        }),
      });

      return response.ok || response.status === 400; // 400也算连接成功
    } catch (error) {
      console.error('[Alibaba] Connection test failed:', error);
      return false;
    }
  }

  /**
   * 阿里百炼 文生图
   */
  async textToImage(params: TextToImageParams): Promise<string[]> {
    try {
      const model = this.config.model || 'wanx-v1';

      // 阿里百炼的尺寸格式: 1024*1024
      const size = `${params.width}*${params.height}`;

      const response = await fetch(`${this.baseURL}/services/aigc/text2image/image-synthesis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            prompt: params.prompt,
            negative_prompt: params.negativePrompt,
          },
          parameters: {
            n: params.samples,
            size,
            seed: params.seed,
            steps: params.steps,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Alibaba API error: ${error.message || 'Unknown error'}`
        );
      }

      const data = await response.json();

      // 阿里百炼返回格式
      if (data.output && data.output.results) {
        return data.output.results.map((item: any) => item.url);
      }

      throw new Error('Invalid response format from Alibaba API');
    } catch (error) {
      console.error('[Alibaba] Text-to-image failed:', error);
      throw error;
    }
  }

  /**
   * 阿里百炼 图生图
   */
  async imageToImage(params: ImageToImageParams): Promise<string[]> {
    try {
      const model = this.config.model || 'wanx-v1';
      const size = `${params.width}*${params.height}`;

      const response = await fetch(`${this.baseURL}/services/aigc/image2image/image-synthesis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            image_url: params.image,
            prompt: params.prompt,
            negative_prompt: params.negativePrompt,
          },
          parameters: {
            n: params.samples,
            size,
            seed: params.seed,
            strength: params.strength || 0.75,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Alibaba API error: ${error.message || 'Unknown error'}`
        );
      }

      const data = await response.json();

      if (data.output && data.output.results) {
        return data.output.results.map((item: any) => item.url);
      }

      throw new Error('Invalid response format from Alibaba API');
    } catch (error) {
      console.error('[Alibaba] Image-to-image failed:', error);
      throw error;
    }
  }
}
