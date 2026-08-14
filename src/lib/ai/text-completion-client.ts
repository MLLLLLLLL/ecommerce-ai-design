// ============================================
// 统一文本补全客户端（V3 5.1）
// Phase 0：冻结接口与错误分类；Phase 1：实现真实 HTTP 客户端。
// 第一阶段仅支持 OpenAI Chat Completions 兼容协议。
// ============================================

export type TextCompletionMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface TextCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | TextCompletionMessagePart[];
}

export interface TextCompletionRequest {
  messages: TextCompletionMessage[];
  responseFormat?: 'json_object';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type TextCompletionErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'invalid_request'
  | 'invalid_json'
  | 'schema_mismatch'
  | 'empty_response'
  | 'network'
  | 'unknown';

export class TextCompletionError extends Error {
  readonly kind: TextCompletionErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    kind: TextCompletionErrorKind,
    options?: { status?: number; retryable?: boolean }
  ) {
    super(message);
    this.name = 'TextCompletionError';
    this.kind = kind;
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
  }
}

export interface TextCompletionClient {
  /** 发起一次补全请求，返回模型原始文本内容（不做 JSON 解析）。 */
  complete(request: TextCompletionRequest): Promise<string>;
}

export interface TextCompletionClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  /** 单次请求超时（毫秒），默认 120000。 */
  timeoutMs?: number;
  /** 可重试错误最大重试次数（超时/429/5xx），默认 2。 */
  maxRetries?: number;
}

/** 可重试错误分类（V3 5.3）：仅网络超时、429 和明确 5xx 自动重试。 */
export function classifyHttpStatus(status: number): { kind: TextCompletionErrorKind; retryable: boolean } {
  if (status === 408) return { kind: 'timeout', retryable: true };
  if (status === 429) return { kind: 'rate_limited', retryable: true };
  if (status >= 500 && status <= 599) return { kind: 'server_error', retryable: true };
  if (status >= 400 && status < 500) return { kind: 'invalid_request', retryable: false };
  return { kind: 'unknown', retryable: false };
}
