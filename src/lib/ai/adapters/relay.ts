import { AIServiceAdapter } from '../base';
import { TextToImageParams, ImageToImageParams, AIServiceConfig } from '@/types/ai';
import { safeFetch } from '@/lib/security/safe-fetch';

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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

/**
 * 中转站适配器
 * 支持OpenAI兼容格式和Stable Diffusion格式
 * ToAPI 等中转站的图片接口为异步任务模式（提交返回 task_id，需轮询取图）
 */
export class RelayAdapter extends AIServiceAdapter {
  private baseURL: string;
  private relayType: 'openai' | 'sd' | 'toapis';

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
    if (this.relayType === 'toapis') return true;
    try {
      return /(?:^|\.)toapis\.com(?::\d+)?$/i.test(new URL(this.baseURL).hostname);
    } catch {
      return false;
    }
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
   * ToAPIs 不同图片模型的分辨率字段和可用档位不同：
   * GPT-Image-2 使用顶层小写 resolution；Gemini/Seedream 使用 metadata.resolution。
   */
  private toAPIModelPayload(params: {
    prompt: string;
    samples: number;
    width: number;
    height: number;
    imageUrl?: string;
  }): Record<string, unknown> {
    const model = this.config.model || 'gpt-image-2';
    const normalizedModel = model.toLowerCase();
    const { size, resolution } = this.toAPISize(params.width, params.height);
    const requestedResolution = Math.max(params.width, params.height) >= 3072
      ? '4K'
      : Math.max(params.width, params.height) >= 1536
      ? '2K'
      : '1K';
    const isGemini25 = normalizedModel.includes('gemini-2.5-flash-image');
    const isGemini31 = normalizedModel.includes('gemini-3.1-flash-image');
    const isSeedreamPro = normalizedModel.includes('doubao-seedream-5-0-pro');
    const isModelMetadataProtocol = isGemini25 || isGemini31 || isSeedreamPro;

    let modelResolution = resolution;
    if (isGemini25) {
      modelResolution = '1K';
    } else if (isSeedreamPro) {
      modelResolution = resolution === '1k' ? '1K' : '2K';
    } else if (isGemini31) {
      modelResolution = requestedResolution;
    }

    const payload: Record<string, unknown> = {
      model,
      prompt: params.prompt,
      n: isGemini25 || isGemini31 ? 1 : params.samples,
      size,
    };

    if (isModelMetadataProtocol) {
      payload.metadata = { resolution: modelResolution };
      if (params.imageUrl) payload.image_urls = [params.imageUrl];
    } else {
      payload.resolution = resolution;
      payload.response_format = 'url';
      if (params.imageUrl) payload.reference_images = [params.imageUrl];
    }

    return payload;
  }

  /**
   * 上传图片到中转站获取公网 URL（ToAPI 图生图要求公网 URL，不支持 base64）
   */
  private async uploadImage(data: string): Promise<string> {
    const match = data.match(/^data:(image\/[\w.+-]+);base64,([\s\S]*)$/);
    if (!match) throw new Error('ToAPIs 参考图必须是 data URL 或公网 URL');
    const [, mimeType, base64Data] = match;
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    const blob = new Blob([Buffer.from(base64Data, 'base64')], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, `reference.${extension}`);

    let lastError = '';
    for (const endpoint of this.endpoints('/uploads/images')) {
      const response = await safeFetch(endpoint, {
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
      for (const endpoint of this.endpoints(`/images/generations/${taskId}`)) {
        const response = await safeFetch(endpoint, {
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

      // 第一次查询立即执行，后续查询按文档建议间隔 5-10 秒并加入抖动。
      await this.sleep(TASK_POLL_INTERVAL_MS + Math.random() * 1000);
    }

    throw new Error(
      `Relay API task timed out: ${lastError || `task ${taskId} did not complete within ${TASK_POLL_TIMEOUT_MS / 1000}s`}`
    );
  }

  /**
   * 解析异步任务完成后的结果（ToAPI: result.data[].url）
   */
  private parseTaskResult(data: unknown): string[] {
    const root = asRecord(data);
    const result = asRecord(root.result);
    if (Array.isArray(result.data)) {
      const images = result.data
        .map((item: unknown) => {
          const record = asRecord(item);
          return record.url || record.b64_json;
        })
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
      if (images.length > 0) return images;
    }
    if (typeof result.url === 'string' && result.url.length > 0) {
      return [result.url];
    }
    if (typeof root.url === 'string' && root.url.length > 0) {
      return [root.url];
    }
    // 部分中转站的轮询结果直接是标准 OpenAI 格式
    return this.parseImageResponse(data);
  }

  /**
   * 测试中转站连接
   */
  async testConnection(): Promise<boolean> {
    try {
      if (this.relayType === 'openai' || this.relayType === 'toapis') {
        return await this.testOpenAIRelay();
      } else {
        return await this.testSDRelay();
      }
    } catch (error) {
      console.error('[Relay] Connection test failed:', error);
      throw error;
    }
  }

  /**
   * 测试OpenAI格式中转站
   */
  private async testOpenAIRelay(): Promise<boolean> {
    let lastError = '';
    for (const endpoint of this.endpoints('/models')) {
      const response = await safeFetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) return true;
      lastError = await this.readApiError(response);
      // 中转站常见两种 Base URL：根地址或带 /v1；路由不存在时继续尝试另一个。
      if (response.status !== 404 && response.status !== 405) break;
    }

    throw new Error(`中转站连接失败：${lastError || '模型列表接口不可用，请检查 Base URL'}`);
  }

  /**
   * 测试SD格式中转站
   */
  private async testSDRelay(): Promise<boolean> {
    const response = await safeFetch(`${this.baseURL}/sdapi/v1/sd-models`, {
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
    if (this.relayType === 'openai' || this.relayType === 'toapis') {
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
      const body = JSON.stringify(isToAPI
        ? this.toAPIModelPayload(params)
        : {
            model: this.config.model || 'dall-e-3',
            prompt: params.prompt,
            n: params.samples,
            size: `${params.width}x${params.height}`,
            response_format: 'url',
          });
      const endpoints = this.imageEndpoints('generations');
      let lastError = '';

      for (const endpoint of endpoints) {
        const response = await safeFetch(endpoint, {
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

  private parseImageResponse(data: unknown): string[] {
    const root = asRecord(data);
    if (Array.isArray(root.data)) {
      const images = root.data
        .map((item: unknown) => {
          const record = asRecord(item);
          return record.url || (record.b64_json ? `data:image/png;base64,${record.b64_json}` : null);
        })
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
      if (images.length > 0) return images;
    }
    if (Array.isArray(root.images)) {
      const images = root.images
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
      const response = await safeFetch(`${this.baseURL}/sdapi/v1/txt2img`, {
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
    if (this.relayType === 'openai' || this.relayType === 'toapis') {
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

      const response = await safeFetch(`${this.baseURL}/images/edits`, {
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
      return this.parseImageResponse(data);
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

      const body = JSON.stringify(this.toAPIModelPayload({
        prompt: params.prompt,
        samples: params.samples,
        width: params.width,
        height: params.height,
        imageUrl,
      }));
      let lastError = '';

      for (const endpoint of this.endpoints('/images/generations')) {
        const response = await safeFetch(endpoint, {
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

      const response = await safeFetch(`${this.baseURL}/sdapi/v1/img2img`, {
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
      const response = await safeFetch(data);
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
      const response = await safeFetch(data);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    }

    return data.replace(/^data:image\/\w+;base64,/, '');
  }
}
