import { z } from 'zod';
import { TextCompletionClient, TextCompletionError } from '@/lib/ai/text-completion-client';
import { completeJSON } from '@/lib/ai/json-response';

// ============================================
// 模型能力实测（V3 5.2）
// 三种模式：connection / jsonMode / vision。
// 展示标签与能力判定分离；本模块的实测结果才是路由与预检依据。
// ============================================

export type ModelTestKind = 'connection' | 'jsonMode' | 'vision';

export interface ModelTestResult {
  kind: ModelTestKind;
  passed: boolean;
  /** 成功说明或脱敏后的失败摘要（不含 API Key、完整请求/响应内容）。 */
  message: string;
  durationMs: number;
}

export type ModelTestReport = Record<ModelTestKind, ModelTestResult>;

export type ModelTestStatus = 'passed' | 'partial' | 'failed';

/** 内置视觉测试卡：红底白圆，用于 vision 实测（base64 内嵌，上游可直接读取）。 */
const VISION_TEST_IMAGE_BASE64 =
  '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';

const JSON_MODE_SCHEMA = z
  .object({
    test: z.literal('ok'),
    value: z.number(),
  })
  .strict();

function errorSummary(error: unknown): string {
  if (error instanceof TextCompletionError) {
    const statusText = error.status ? ` (HTTP ${error.status})` : '';
    return `${error.kind}${statusText}: ${error.message.slice(0, 200)}`;
  }
  return (error instanceof Error ? error.message : '未知错误').slice(0, 200);
}

/** connection：简短文本，上游 2xx 且存在文本响应即通过。 */
export async function testConnection(client: TextCompletionClient): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    const content = await client.complete({
      messages: [{ role: 'user', content: 'ping，请回复 pong' }],
      temperature: 0,
      maxTokens: 16,
    });
    if (!content.trim()) {
      return { kind: 'connection', passed: false, message: '响应为空', durationMs: Date.now() - startedAt };
    }
    return { kind: 'connection', passed: true, message: '连接成功', durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      kind: 'connection',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** jsonMode：要求固定 JSON，可解析并通过 Zod Schema 即通过。 */
export async function testJsonMode(client: TextCompletionClient): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    await completeJSON(
      client,
      {
        messages: [
          {
            role: 'user',
            content: '请严格输出 JSON：{"test":"ok","value":42}，不要任何解释。',
          },
        ],
        responseFormat: 'json_object',
        temperature: 0,
        maxTokens: 128,
      },
      JSON_MODE_SCHEMA,
      { label: 'JSON 模式测试', repair: false }
    );
    return { kind: 'jsonMode', passed: true, message: 'JSON 输出可用', durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      kind: 'jsonMode',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** vision：内置红色测试卡，模型描述含红色即通过。 */
export async function testVision(client: TextCompletionClient): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    const content = await client.complete({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '这张图片的背景是什么颜色？只回答一个英文颜色单词。',
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${VISION_TEST_IMAGE_BASE64}` },
            },
          ],
        },
      ],
      temperature: 0,
      maxTokens: 32,
    });
    if (/red|红色|红(?!外)/i.test(content)) {
      return { kind: 'vision', passed: true, message: '视觉输入可用', durationMs: Date.now() - startedAt };
    }
    return {
      kind: 'vision',
      passed: false,
      message: `未识别到测试卡颜色（响应：${content.slice(0, 60)}）`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      kind: 'vision',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

export const ALL_MODEL_TEST_KINDS: ModelTestKind[] = ['connection', 'jsonMode', 'vision'];

export async function runModelTests(
  client: TextCompletionClient,
  kinds: ModelTestKind[] = ALL_MODEL_TEST_KINDS
): Promise<{ report: ModelTestReport; status: ModelTestStatus }> {
  const tasks: Record<ModelTestKind, () => Promise<ModelTestResult>> = {
    connection: () => testConnection(client),
    jsonMode: () => testJsonMode(client),
    vision: () => testVision(client),
  };

  const report = {} as ModelTestReport;
  for (const kind of kinds) {
    report[kind] = await tasks[kind]();
  }

  const passedCount = kinds.filter((kind) => report[kind].passed).length;
  const status: ModelTestStatus =
    passedCount === kinds.length ? 'passed' : passedCount === 0 ? 'failed' : 'partial';

  return { report, status };
}

export interface TestedCapabilitiesSnapshot {
  connection: boolean;
  jsonMode: boolean;
  vision: boolean;
}
