import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams, AIServiceConfig } from '@/types/ai';

/**
 * 中转站适配器
 * 支持OpenAI兼容格式和Stable Diffusion格式
 */
export class RelayAdapter extends AIServiceAdapter {
  private baseURL: string;
  private relayType: 'openai' | 'sd';

  constructor(config: AIServiceConfig) {
    super(config);

    if (!config.baseURL) {
      throw new Error('Base URL is required for relay adapter');
    }

    this.baseURL = config.baseURL;
    this.relayType = config.relayType || 'openai';
  }

  /**
   * 测试中转站连接
   */
  async testConnection(): Promise<boolean> {
    try {
      if (this.relayType === 'openai') {
        return await this.testOpenAIRelay();
      } else {
        return await this.testSDRelay();
      }
    } catch (error) {
      console.error('[Relay] Connection test failed:', error);
      return false;
    }
  }

  /**
   * 测试OpenAI格式中转站
   */
  private async testOpenAIRelay(): Promise<boolean> {
    const response = await fetch(`${this.baseURL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  }

  /**
   * 测试SD格式中转站
   */
  private async testSDRelay(): Promise<boolean> {
    const response = await fetch(`${this.baseURL}/sdapi/v1/sd-models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  }

  /**
   * 文生图
   */
  async textToImage(params: TextToImageParams): Promise<string[]> {
    if (this.relayType === 'openai') {
      return await this.textToImageOpenAI(params);
    } else {
      return await this.textToImageSD(params);
    }
  }

  /**
   * OpenAI格式文生图
   */
  private async textToImageOpenAI(params: TextToImageParams): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model || 'dall-e-3',
          prompt: params.prompt,
          n: params.samples,
          size: `${params.width}x${params.height}`,
          response_format: 'url',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Relay API error: ${error.error?.message || 'Unknown error'}`
        );
      }

      const data = await response.json();
      return data.data.map((item: any) => item.url);
    } catch (error) {
      console.error('[Relay-OpenAI] Text-to-image failed:', error);
      throw error;
    }
  }

  /**
   * Stable Diffusion格式文生图
   */
  private async textToImageSD(params: TextToImageParams): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          negative_prompt: params.negativePrompt || '',
          width: params.width,
          height: params.height,
          n_iter: params.samples,
          steps: params.steps || 20,
          cfg_scale: params.cfgScale || 7,
          seed: params.seed || -1,
          override_settings: {
            sd_model_checkpoint: this.config.model,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Relay API error: ${error.detail || 'Unknown error'}`
        );
      }

      const data = await response.json();

      // SD返回base64图片
      if (data.images && data.images.length > 0) {
        return data.images.map((img: string) => `data:image/png;base64,${img}`);
      }

      throw new Error('No images returned from Relay API');
    } catch (error) {
      console.error('[Relay-SD] Text-to-image failed:', error);
      throw error;
    }
  }

  /**
   * 图生图
   */
  async imageToImage(params: ImageToImageParams): Promise<string[]> {
    if (this.relayType === 'openai') {
      return await this.imageToImageOpenAI(params);
    } else {
      return await this.imageToImageSD(params);
    }
  }

  /**
   * OpenAI格式图生图
   */
  private async imageToImageOpenAI(params: ImageToImageParams): Promise<string[]> {
    try {
      const formData = new FormData();
      const imageBlob = await this.urlOrBase64ToBlob(params.image);

      formData.append('image', imageBlob, 'image.png');
      formData.append('prompt', params.prompt);
      formData.append('n', params.samples.toString());
      formData.append('size', `${params.width}x${params.height}`);

      const response = await fetch(`${this.baseURL}/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Relay API error: ${error.error?.message || 'Unknown error'}`
        );
      }

      const data = await response.json();
      return data.data.map((item: any) => item.url);
    } catch (error) {
      console.error('[Relay-OpenAI] Image-to-image failed:', error);
      throw error;
    }
  }

  /**
   * Stable Diffusion格式图生图
   */
  private async imageToImageSD(params: ImageToImageParams): Promise<string[]> {
    try {
      // 确保图片是base64格式
      const base64Image = await this.ensureBase64(params.image);

      const response = await fetch(`${this.baseURL}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          init_images: [base64Image],
          prompt: params.prompt,
          negative_prompt: params.negativePrompt || '',
          width: params.width,
          height: params.height,
          n_iter: params.samples,
          steps: params.steps || 20,
          cfg_scale: params.cfgScale || 7,
          denoising_strength: params.strength || 0.75,
          seed: params.seed || -1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Relay API error: ${error.detail || 'Unknown error'}`
        );
      }

      const data = await response.json();

      if (data.images && data.images.length > 0) {
        return data.images.map((img: string) => `data:image/png;base64,${img}`);
      }

      throw new Error('No images returned from Relay API');
    } catch (error) {
      console.error('[Relay-SD] Image-to-image failed:', error);
      throw error;
    }
  }

  /**
   * 将URL或base64转换为Blob
   */
  private async urlOrBase64ToBlob(data: string): Promise<Blob> {
    if (data.startsWith('http')) {
      const response = await fetch(data);
      return await response.blob();
    }

    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    return new Blob([buffer], { type: 'image/png' });
  }

  /**
   * 确保图片是base64格式（去掉前缀）
   */
  private async ensureBase64(data: string): Promise<string> {
    if (data.startsWith('http')) {
      const response = await fetch(data);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    }

    return data.replace(/^data:image\/\w+;base64,/, '');
  }
}
