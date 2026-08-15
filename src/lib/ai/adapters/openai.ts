import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams, AIServiceConfig } from '@/types/ai';
import { safeFetch } from '@/lib/security/safe-fetch';

/**
 * OpenAI DALL-E 适配器
 * 支持 DALL-E 2 和 DALL-E 3
 */
export class OpenAIAdapter extends AIServiceAdapter {
  private baseURL: string;

  constructor(config: AIServiceConfig) {
    super(config);
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  /**
   * 测试OpenAI API连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await safeFetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[OpenAI] Connection test failed:', error);
      return false;
    }
  }

  /**
   * DALL-E 文生图
   */
  async textToImage(params: TextToImageParams): Promise<string[]> {
    try {
      const model = this.config.model || 'dall-e-3';

      // DALL-E 3 只支持特定尺寸
      const size = this.normalizeSize(params.width, params.height, model);

      // DALL-E 3 每次只能生成1张
      const n = model === 'dall-e-3' ? 1 : Math.min(params.samples, 10);

      const response = await safeFetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: params.prompt,
          n,
          size,
          quality: model === 'dall-e-3' ? 'standard' : undefined,
          response_format: 'url',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `OpenAI API error: ${error.error?.message || 'Unknown error'}`
        );
      }

      const data = await response.json();
      const images = data.data.map((item: any) => item.url);

      // 如果需要多张且使用DALL-E 3，需要多次调用
      if (params.samples > 1 && model === 'dall-e-3') {
        console.warn('[OpenAI] DALL-E 3 only generates 1 image per request');
      }

      return images;
    } catch (error) {
      console.error('[OpenAI] Text-to-image failed:', error);
      throw error;
    }
  }

  /**
   * DALL-E 图生图（编辑和变体）
   */
  async imageToImage(params: ImageToImageParams): Promise<string[]> {
    try {
      // DALL-E 2 支持编辑和变体
      // DALL-E 3 暂不支持
      if (this.config.model === 'dall-e-3') {
        throw new Error('DALL-E 3 does not support image-to-image yet');
      }

      // 使用 variations 端点
      const formData = new FormData();

      // 如果是base64，需要转换为Blob
      const imageBlob = await this.base64ToBlob(params.image);
      formData.append('image', imageBlob, 'image.png');
      formData.append('n', Math.min(params.samples, 10).toString());

      const size = this.normalizeSize(params.width, params.height, 'dall-e-2');
      formData.append('size', size);

      const response = await safeFetch(`${this.baseURL}/images/variations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `OpenAI API error: ${error.error?.message || 'Unknown error'}`
        );
      }

      const data = await response.json();
      return data.data.map((item: any) => item.url);
    } catch (error) {
      console.error('[OpenAI] Image-to-image failed:', error);
      throw error;
    }
  }

  /**
   * 标准化图片尺寸
   * DALL-E 只支持特定尺寸
   */
  private normalizeSize(width: number, height: number, model: string): string {
    if (model === 'dall-e-3') {
      // DALL-E 3 支持: 1024x1024, 1792x1024, 1024x1792
      if (width === height) return '1024x1024';
      if (width > height) return '1792x1024';
      return '1024x1792';
    } else {
      // DALL-E 2 支持: 256x256, 512x512, 1024x1024
      if (width <= 256 && height <= 256) return '256x256';
      if (width <= 512 && height <= 512) return '512x512';
      return '1024x1024';
    }
  }

  /**
   * 将base64转换为Blob
   */
  private async base64ToBlob(base64: string): Promise<Blob> {
    // 如果是URL，先下载
    if (base64.startsWith('http')) {
      const response = await fetch(base64);
      return await response.blob();
    }

    // 如果是base64
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    return new Blob([buffer], { type: 'image/png' });
  }
}
