import { randomUUID } from 'node:crypto';
import {
  TextCompletionClient,
  TextCompletionClientConfig,
  TextCompletionError,
  TextCompletionRequest,
  classifyHttpStatus,
} from '@/lib/ai/text-completion-client';

// ============================================
// OpenAI Chat Completions 兼容 HTTP 客户端（V3 5.1）
// 统一处理：URL 拼接、鉴权头、response_format 兼容重试、
// 上游错误解析、超时、可重试错误分类与指数退避、内容提取、
// 日志脱敏与 requestId。
// ============================================

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;

/** 不支持 response_format 参数时的状态码集合（去掉参数重试一次）。 */
const RESPONSE_FORMAT_RETRY_STATUSES = [400, 404, 422];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 截断并脱敏上游错误消息，避免把完整上游回显写入日志或异常信息。 */
function sanitizeDetail(detail: string): string {
  return detail.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new TextCompletionError('上游响应结构无效', 'invalid_json', { retryable: false });
  }
  const data = payload as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const content = (first?.message as Record<string, unknown> | undefined)?.content;

  if (content === undefined || content === null) {
    throw new TextCompletionError('模型响应缺少文本内容', 'empty_response', { retryable: false });
  }
  if (typeof content === 'string') {
    if (!content.trim()) {
      throw new TextCompletionError('模型响应文本为空', 'empty_response', { retryable: false });
    }
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          return String((part as Record<string, unknown>).text ?? '');
        }
        return '';
      })
      .join('');
    if (!text.trim()) {
      throw new TextCompletionError('模型响应文本为空', 'empty_response', { retryable: false });
    }
    return text;
  }
  if (typeof content === 'object') {
    return JSON.stringify(content);
  }
  throw new TextCompletionError('模型响应内容类型无法识别', 'invalid_json', { retryable: false });
}

export class HttpTextCompletionClient implements TextCompletionClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: TextCompletionClientConfig) {
    this.baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async complete(request: TextCompletionRequest): Promise<string> {
    const requestId = randomUUID();
    const bodyBase: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 6000,
    };
    if (request.responseFormat) {
      bodyBase.response_format = { type: request.responseFormat };
    }

    let lastError: TextCompletionError | null = null;
    let fallbackUsed = false;

    for (let attempt = 0; attempt <= this.maxRetries; ) {
      // 每次尝试独立构造 body，兼容重试时去掉 response_format。
      const body = { ...bodyBase };

      try {
        const text = await this.requestOnce(body, request.signal);
        return text;
      } catch (error) {
        const typed = error as TextCompletionError;
        lastError = typed;

        // response_format 兼容降级：特定 4xx 且带该参数时，去掉后重试一次（不占重试配额）。
        if (
          typed.kind === 'invalid_request' &&
          typed.status !== undefined &&
          RESPONSE_FORMAT_RETRY_STATUSES.includes(typed.status) &&
          bodyBase.response_format !== undefined &&
          !fallbackUsed
        ) {
          bodyBase.response_format = undefined;
          fallbackUsed = true;
          console.warn(
            `[TextCompletionClient] requestId=${requestId} response_format 不受支持，降级重试`
          );
          continue;
        }

        if (!typed.retryable) {
          break;
        }
        if (attempt < this.maxRetries) {
          const delayMs = BASE_RETRY_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 200);
          console.warn(
            `[TextCompletionClient] requestId=${requestId} model=${this.model} 可重试错误(${typed.kind}${typed.status ? ` HTTP ${typed.status}` : ''})，第 ${attempt + 1} 次重试，退避 ${delayMs}ms`
          );
          await sleep(delayMs);
        }
        attempt += 1;
      }
    }

    console.error(
      `[TextCompletionClient] requestId=${requestId} model=${this.model} 最终失败: kind=${lastError?.kind} status=${lastError?.status ?? '-'} message=${lastError ? sanitizeDetail(lastError.message) : 'unknown'}`
    );
    throw (
      lastError ?? new TextCompletionError('请求失败', 'unknown', { retryable: false })
    );
  }

  private async requestOnce(
    body: Record<string, unknown>,
    externalSignal: AbortSignal | undefined
  ): Promise<string> {
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort();
    }, this.timeoutMs);

    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const url = `${this.baseURL}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch {
        if (signal.aborted) {
          throw new TextCompletionError(`请求超过 ${this.timeoutMs}ms 未响应`, 'timeout', {
            retryable: true,
          });
        }
        throw new TextCompletionError('网络连接失败', 'network', { retryable: true });
      }

      if (!response.ok) {
        let detail = '';
        try {
          const payload = (await response.json()) as Record<string, unknown>;
          const err = payload.error as Record<string, unknown> | undefined;
          detail = sanitizeDetail(
            String(err?.message ?? payload.detail ?? payload.message ?? '')
          );
        } catch {
          // 上游可能返回非 JSON 错误体。
        }
        const { kind, retryable } = classifyHttpStatus(response.status);
        throw new TextCompletionError(
          detail || `API error: ${response.status}`,
          kind,
          { status: response.status, retryable }
        );
      }

      const payload: unknown = await response.json();
      return extractContent(payload);
    } catch (error) {
      if (error instanceof TextCompletionError) {
        throw error;
      }
      throw new TextCompletionError(
        `请求处理失败: ${sanitizeDetail(error instanceof Error ? error.message : '未知错误')}`,
        'unknown',
        { retryable: false }
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
