import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams, AIServiceConfig } from '@/types/ai';

// ToAPI 异步任务轮询参数（官方文档建议间隔 5-10 秒并加抖动，最长等待 120 秒）
const TASK_POLL_INTERVAL_MS = 5000;
const TASK_POLL_TIMEOUT_MS = 120000;

// ToAPI 支持的 13 种比例（size 参数）
const TOAPI_RATIOS = [
  '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5',
  '16:9', '9:16', '2:1', '1:2', '21:9', '9:21',
];

// ToAPI 4k 分辨率仅支持 6 种比例
const TOAPI_4K_RATIOS = new Set(['16:9', '9:16', '2:1', '1:2', '21:9', '9:21']);

/**
 * 中转站适配器
 * 支持OpenAI兼容格式和Stable Diffusion格式
 * ToAPI 等中转站的图片接口为异步任务模式（提交返回 task_id，需轮询取图）
 */
export class RelayAdapter extends AIServiceAdapter {
  private baseURL: string;
  private relayType: 'openai' | 'sd';

  constructor(config: AIServiceConfig) {
    super(config);

    if (!config.baseURL) {
      throw new Error('Base URL is required for relay adapter');
    }

    this.baseURL = config.baseURL.trim().replace(/\/+$/, '');
    this.relayType = config.relayType || 'openai';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 拼接候选端点：根地址和 /v1 地址都很常见；仅在路由不存在时尝试另一个候选地址。
   */
  private endpoints(path: string): string[] {
    const primary = `${this.baseURL}${path}`;
    if (/\/v1$/i.test(this.baseURL)) return [primary];
    return [primary, `${this.baseURL}/v1${path}`];
  }

  /**
   * 是否为 ToAPI 中转站（图片接口为异步任务模式，且要求比例/分辨率参数）
   */
  private isToAPI(): boolean {
    return /toapis\.com/i.test(this.baseURL);
  }

  /**
   * 将像素尺寸转换为 ToAPI 的比例(size)+分辨率(resolution)格式
   * 4k 仅支持部分比例，不支持时降级为 2k（保持比例不变）
   */
  private toAPISize(width: number, height: number): { size: string; resolution: string } {
    const aspect = width / height;
    let ratio = '1:1';
    let bestDiff = Infinity;
    for (const r of TOAPI_RATIOS) {
      const [w, h] = r.split(':').map(Number);
      const diff = Math.abs(aspect - w / h);
      if (diff < bestDiff) {
        bestDiff = diff;
        ratio = r;
      }
    }

    const longEdge = Math.max(width, height);
    let resolution = longEdge >= 3072 ? '4k' : longEdge >= 1536 ? '2k' : '1k';
    if (resolution === '4k' && !TOAPI_4K_RATIOS.has(ratio)) {
      resolution = '2k';
    }
    return { size: ratio, resolution };
  }

  /**
   * 上传图片到中转站获取公网 URL（ToAPI 图生图要求公网 URL，不支持 base64）
   */
  private async uploadImage(data: string): Promise<string> {
    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    const blob = new Blob([Buffer.from(base64Data, 'base64')], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, 'image.png');
    formData.append('purpose', 'generation');

    let lastError = '';
    for (const endpoint of this.endpoints('/uploads/images')) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        body: formData,
      });

      if (response.ok) {
        const payload = await response.json();
        const url = payload?.data?.url || payload?.url;
        if (typeof url === 'string' && url.length > 0) return url;
        lastError = 'upload response missing url';
        break;
      }

      lastError = await this.readApiError(response);
      if (response.status !== 404 && response.status !== 405) break;
    }

    throw new Error(`Relay API upload failed: ${lastError}`);
  }

  /**
   * 轮询异步图片生成任务（ToAPI 提交后返回 task_id，需轮询直到 completed / failed）
   */
  private async pollImageTask(taskId: string): Promise<string[]> {
    const startedAt = Date.now();
    let lastError = '';

    while (Date.now() - startedAt < TASK_POLL_TIMEOUT_MS) {
      // 文档建议轮询间隔 5-10 秒并加入随机抖动
      await this.sleep(TASK_POLL_INTERVAL_MS + Math.random() * 1000);

      for (const endpoint of this.endpoints(`/images/generations/${taskId}`)) {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'completed') {
            return this.parseTaskResult(data);
          }
          if (data.status === 'failed') {
            const message = data.error?.message || data.message || data.error || 'unknown error';
            throw new Error(`Relay API task failed: ${message}`);
          }
          // queued / in_progress：继续轮询
          break;
        }

        lastError = await this.readApiError(response);
        // 密钥/参数错误属于配置问题，立即抛出而不是空等
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new Error(`Relay API error: ${lastError}`);
        }
        // 路由不存在时尝试候选地址；其余错误（429/5xx）视为任务仍在处理中
        if (response.status !== 404 && response.status !== 405) break;
      }
    }

    throw new Error(
      `Relay API task timed out: ${lastError || `task ${taskId} did not complete within ${TASK_POLL_TIMEOUT_MS / 1000}s`}`
    );
  }

  /**
   * 解析异步任务完成后的结果（ToAPI: result.data[].url）
   */
  private parseTaskResult(data: any): string[] {
    if (Array.isArray(data?.result?.data)) {
      const images = data.result.data
        .map((item: any) => item?.url || item?.b64_json)
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
      if (images.length > 0) return images;
    }
    // 部分中转站的轮询结果直接是标准 OpenAI 格式
    return this.parseImageResponse(data);
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
   * 标准 OpenAI 兼容中转站同步返回图片；ToAPI 等异步任务中转站返回 task_id，需轮询
   */
  private async textToImageOpenAI(params: TextToImageParams): Promise<string[]> {
    try {
      const isToAPI = this.isToAPI();
      const body = JSON.stringify({
        model: this.config.model || 'dall-e-3',
        prompt: params.prompt,
        n: params.samples,
        // ToAPI 要求比例+分辨率参数，标准 OpenAI 兼容接口为像素尺寸
        ...(isToAPI ? this.toAPISize(params.width, params.height) : { size: `${params.width}x${params.height}` }),
        response_format: 'url',
      });
      const endpoints = this.imageEndpoints('generations');
      let lastError = '';

      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (response.ok) {
          const data = await response.json();
          // 异步任务模式：响应体是任务对象（含 id/status），需轮询取图
          if (data && typeof data.id === 'string' && (data.status || data.object === 'generation.task')) {
            return await this.pollImageTask(data.id);
          }
          return this.parseImageResponse(data);
        }

        lastError = await this.readApiError(response);
        if (response.status !== 404 && response.status !== 405) break;
      }

      throw new Error(`Relay API error: ${lastError || 'images endpoint unavailable'}`);
    } catch (error) {
      console.error('[Relay-OpenAI] Text-to-image failed:', error);
      throw error;
    }
  }

  private imageEndpoints(operation: 'generations' | 'edits'): string[] {
    return this.endpoints(`/images/${operation}`);
  }

  private async readApiError(response: Response): Promise<string> {
    try {
      const payload = await response.json();
      return payload?.error?.message || payload?.detail || payload?.message || JSON.stringify(payload);
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  private parseImageResponse(data: any): string[] {
    if (Array.isArray(data?.data)) {
      const images = data.data
        .map((item: any) => item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null))
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
      if (images.length > 0) return images;
    }
    if (Array.isArray(data?.images)) {
      const images = data.images
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
        .map((value: string) => value.startsWith('data:') ? value : `data:image/png;base64,${value}`);
      if (images.length > 0) return images;
    }
    throw new Error('Relay API returned no images');
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
    // ToAPI 图生图走同一 generations 端点（image_urls 触发编辑模式），异步任务
    if (this.isToAPI()) {
      return await this.imageToImageToAPI(params);
    }

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
   * ToAPI 格式图生图：JSON 请求（image_urls 触发编辑模式）+ 异步任务轮询
   */
  private async imageToImageToAPI(params: ImageToImageParams): Promise<string[]> {
    try {
      // ToAPI 仅接受公网图片 URL，base64 需先上传
      let imageUrl = params.image;
      if (imageUrl.startsWith('data:')) {
        imageUrl = await this.uploadImage(imageUrl);
      }

      const body = JSON.stringify({
        model: this.config.model || 'gpt-image-2',
        prompt: params.prompt,
        n: params.samples,
        image_urls: [imageUrl],
        ...this.toAPISize(params.width, params.height),
        response_format: 'url',
      });
      let lastError = '';

      for (const endpoint of this.endpoints('/images/generations')) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.id === 'string' && (data.status || data.object === 'generation.task')) {
            return await this.pollImageTask(data.id);
          }
          return this.parseImageResponse(data);
        }

        lastError = await this.readApiError(response);
        if (response.status !== 404 && response.status !== 405) break;
      }

      throw new Error(`Relay API error: ${lastError || 'images endpoint unavailable'}`);
    } catch (error) {
      console.error('[Relay-ToAPI] Image-to-image failed:', error);
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
