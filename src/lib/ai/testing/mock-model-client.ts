import {
  TextCompletionClient,
  TextCompletionError,
  TextCompletionRequest,
} from '@/lib/ai/text-completion-client';

// ============================================
// 模型调用 Mock（V3 Phase 0 交付 3）
// 覆盖五类结果：成功、超时、429、5xx、无效 JSON。
// 用途：单元测试、引擎开发期脱离真实上游验证。
// ============================================

export type MockScenario =
  | { kind: 'success'; content?: string }
  | { kind: 'invalid-json' }
  | { kind: 'timeout'; afterMs?: number }
  | { kind: 'rate-limited' }
  | { kind: 'server-error'; status?: 500 | 502 | 503 }
  | { kind: 'network-error' };

export const DEFAULT_MOCK_JSON_CONTENT =
  '{"ok":true,"message":"mock success"}';

export const DEFAULT_MOCK_INVALID_JSON_CONTENT =
  '{"ok": true, "message": "truncated';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 可编程场景的 TextCompletionClient 实现。
 * 默认场景为 success 并返回一段合法 JSON 文本。
 */
export class MockTextCompletionClient implements TextCompletionClient {
  private scenario: MockScenario = { kind: 'success' };
  private queue: MockScenario[] = [];
  private calls: TextCompletionRequest[] = [];
  private defaultContent = DEFAULT_MOCK_JSON_CONTENT;

  setScenario(scenario: MockScenario): this {
    this.scenario = scenario;
    return this;
  }

  /** 按调用顺序出队的场景；队列耗尽后回落到当前 scenario。 */
  setScenarioQueue(scenarios: MockScenario[]): this {
    this.queue = [...scenarios];
    return this;
  }

  setDefaultContent(content: string): this {
    this.defaultContent = content;
    return this;
  }

  get callCount(): number {
    return this.calls.length;
  }

  get requests(): readonly TextCompletionRequest[] {
    return this.calls;
  }

  get lastRequest(): TextCompletionRequest | undefined {
    return this.calls[this.calls.length - 1];
  }

  async complete(request: TextCompletionRequest): Promise<string> {
    this.calls.push(request);
    const scenario = this.queue.shift() ?? this.scenario;

    switch (scenario.kind) {
      case 'success':
        return scenario.content ?? this.defaultContent;
      case 'invalid-json':
        // 模拟上游返回无法解析的文本（客户端不负责解析，上层 completeJSON 会抛 invalid_json）
        return DEFAULT_MOCK_INVALID_JSON_CONTENT;
      case 'timeout': {
        const waitMs = scenario.afterMs ?? 1;
        await delay(waitMs);
        if (request.signal?.aborted) {
          throw new TextCompletionError('请求已中止', 'timeout', { retryable: true });
        }
        throw new TextCompletionError(`请求超过 ${waitMs}ms 未响应`, 'timeout', {
          retryable: true,
        });
      }
      case 'rate-limited':
        throw new TextCompletionError('上游限流（HTTP 429）', 'rate_limited', {
          status: 429,
          retryable: true,
        });
      case 'server-error':
        throw new TextCompletionError(
          `上游服务错误（HTTP ${scenario.status ?? 500}）`,
          'server_error',
          { status: scenario.status ?? 500, retryable: true }
        );
      case 'network-error':
        throw new TextCompletionError('网络连接失败', 'network', { retryable: true });
      default:
        throw new TextCompletionError('未知 Mock 场景', 'unknown', { retryable: false });
    }
  }
}
