// ============================================
// AI服务配置类型
// ============================================

export interface AIServiceConfig {
  id: string;
  provider: 'openai' | 'alibaba' | 'relay';
  name: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  apiProtocol?: 'chat_completions' | 'responses';
  relayType?: 'openai' | 'sd';
  maxConcurrent?: number;
}

// ============================================
// 文生图参数
// ============================================

export interface TextToImageParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  samples: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

// ============================================
// 图生图参数
// ============================================

export interface ImageToImageParams extends TextToImageParams {
  image: string; // base64 or URL
  strength?: number; // 0-1, 图片影响强度
  mask?: string; // base64 mask for inpainting
}

// ============================================
// AI服务响应
// ============================================

export interface AIServiceResponse {
  images: string[]; // URLs or base64
  metadata?: {
    seed?: number;
    model?: string;
    cost?: number;
    duration?: number;
  };
}

// ============================================
// 队列任务
// ============================================

export interface QueueTask<T> {
  id: string;
  execute: () => Promise<T>;
  priority?: number;
  onProgress?: (progress: number) => void;
}

// ============================================
// 队列配置
// ============================================

export interface QueueConfig {
  concurrency: number; // 最大并发数
  timeout?: number; // 单个请求超时时间（毫秒）
  retries?: number; // 重试次数
}

// ============================================
// 队列统计
// ============================================

export interface QueueStats {
  total: number;
  completed: number;
  failed: number;
  active: number;
  pending: number;
}
