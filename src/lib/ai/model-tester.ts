import { z } from 'zod';
import sharp from 'sharp';
import { TextCompletionClient, TextCompletionError } from '@/lib/ai/text-completion-client';
import { completeJSON } from '@/lib/ai/json-response';
import type { AIServiceAdapter } from '@/lib/ai/base';

// ============================================
// 模型能力实测（V3 5.2 / V2 5.3）
// 文本：connection / jsonMode / vision。
// 图片：imageGeneration / imageEditing / referenceImage。
// 展示标签与能力判定分离；本模块的实测结果才是路由与预检依据。
// ============================================

export type ModelTestKind =
  | 'connection'
  | 'jsonMode'
  | 'vision'
  | 'imageGeneration'
  | 'imageEditing'
  | 'referenceImage';

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

/** 内置高分辨率五色测试卡，包含红、蓝、绿、黄、紫五个大色块。 */
const VISION_FIVE_COLOR_TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAABLAAAADwCAIAAACfVArnAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAJYUlEQVR42u3XMQ3AIAAEQEzUAEkVYAEdLJVUTd1Q0g7sTPXxueRMXFm9Q4zz+iBGfQbE2POAGHd7IUZRCIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEECG0CIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQSFQAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIEUKLQAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIEUKLQAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQlAIhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQIbQIhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQIbQIhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBIVACEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQgRQotACEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQgRQotACEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhtAiEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhtAiEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBAhBCEEIQQhBCFECEEIQQhBCEEIEUIQQhBCEEIQQoQQhBCEEIQQhBAhBCEEIQQhRAhBCEEIQQhBCBFCEEIQQhBCEEKEEIQQhBCEEIQQIQQhBCEEIQQhRAhBCEEIQQgRQhBCEEIQQhBChBCEEIQQhBCEECEEIQQhBCEEIUQIQQhBCEEIQQhJ8wNmOd/XcZwQcgAAAABJRU5ErkJggg==';

const VISION_COLOR_ALIASES = [
  ['red', 'crimson', 'scarlet', 'maroon', '红', '赤'],
  ['blue', 'azure', 'navy', 'cobalt', '蓝'],
  ['green', 'emerald', 'lime', 'olive', '绿'],
  ['yellow', 'gold', 'amber', '黄', '金'],
  ['purple', 'violet', 'indigo', 'lavender', '紫'],
] as const;

function recognizesAllFiveColors(content: string): boolean {
  const normalized = content.toLowerCase();

  for (const aliases of VISION_COLOR_ALIASES) {
    if (!aliases.some((alias) => normalized.includes(alias))) return false;
  }
  return true;
}

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

/** vision：识别五色测试卡，颜色齐全即可通过，不受回答排序影响。 */
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
              text: '请识别图片中出现的五种颜色。只输出五个英文颜色词，用英文逗号分隔。',
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${VISION_FIVE_COLOR_TEST_IMAGE_BASE64}` },
            },
          ],
        },
      ],
      temperature: 0,
      maxTokens: 64,
    });
    if (recognizesAllFiveColors(content)) {
      return { kind: 'vision', passed: true, message: '五色视觉输入可用', durationMs: Date.now() - startedAt };
    }
    return {
      kind: 'vision',
      passed: false,
      message: `五色识别不完整（响应：${content.slice(0, 100)}）`,
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

export const IMAGE_MODEL_TEST_KINDS: ModelTestKind[] = [
  'imageGeneration',
  'imageEditing',
  'referenceImage',
];

export async function runModelTests(
  client: TextCompletionClient,
  kinds: ModelTestKind[] = ALL_MODEL_TEST_KINDS
): Promise<{ report: ModelTestReport; status: ModelTestStatus }> {
  const tasks: Record<'connection' | 'jsonMode' | 'vision', () => Promise<ModelTestResult>> = {
    connection: () => testConnection(client),
    jsonMode: () => testJsonMode(client),
    vision: () => testVision(client),
  };

  const report = {} as ModelTestReport;
  for (const kind of kinds) {
    if (kind in tasks) {
      report[kind] = await tasks[kind as 'connection' | 'jsonMode' | 'vision']();
    }
  }

  const evaluated = kinds.filter((kind) => report[kind]);
  const passedCount = evaluated.filter((kind) => report[kind].passed).length;
  const status: ModelTestStatus =
    passedCount === evaluated.length ? 'passed' : passedCount === 0 ? 'failed' : 'partial';

  return { report, status };
}

// ============================================
// 图片能力实测（V2 5.3）
// 通过服务端解密后的受保护 Adapter 执行；返回图片经 sharp 文件校验。
// ============================================

/** 拉取并校验返回图片：可解码、尺寸非空即通过文件校验。 */
async function validateGeneratedImage(imageRef: string): Promise<{ width?: number; height?: number }> {
  let buffer: Buffer;
  if (imageRef.startsWith('data:')) {
    const base64 = imageRef.slice(imageRef.indexOf(',') + 1);
    buffer = Buffer.from(base64, 'base64');
  } else if (imageRef.startsWith('http')) {
    const response = await fetch(imageRef);
    if (!response.ok) throw new Error(`返回图片下载失败 (HTTP ${response.status})`);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    // 裸 base64
    buffer = Buffer.from(imageRef, 'base64');
  }
  if (buffer.length < 100) throw new Error('返回图片内容过小，疑似无效响应');
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error('返回内容不是有效图片');
  return { width: metadata.width, height: metadata.height };
}

/** imageGeneration：短提示词生成，返回可下载图片并通过文件校验。 */
export async function testImageGeneration(adapter: AIServiceAdapter): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    const urls = await adapter.textToImage({
      prompt: '一个红色圆形在白色背景上，极简风格',
      width: 512,
      height: 512,
      samples: 1,
    });
    if (!urls.length) throw new Error('未返回任何图片');
    const info = await validateGeneratedImage(urls[0]);
    return {
      kind: 'imageGeneration',
      passed: true,
      message: `图片生成可用（${info.width}x${info.height}）`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      kind: 'imageGeneration',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** imageEditing：内置测试卡 + 编辑指令，返回图片且可解码。 */
export async function testImageEditing(adapter: AIServiceAdapter): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    const urls = await adapter.imageToImage({
      image: `data:image/png;base64,${VISION_TEST_IMAGE_BASE64}`,
      prompt: '保持红色背景与白色圆形主体不变，整体风格保持不变',
      width: 512,
      height: 512,
      samples: 1,
      strength: 0.3,
    });
    if (!urls.length) throw new Error('未返回任何图片');
    await validateGeneratedImage(urls[0]);
    return {
      kind: 'imageEditing',
      passed: true,
      message: '图片编辑/图生图可用',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      kind: 'imageEditing',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** referenceImage：请求确定携带参考图（由本模块构造），返回图片即通过。 */
export async function testReferenceImage(adapter: AIServiceAdapter): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    const urls = await adapter.imageToImage({
      image: `data:image/png;base64,${VISION_TEST_IMAGE_BASE64}`,
      prompt: '参考这张图片的产品外观，生成一张保持相同主体外观的图片',
      width: 512,
      height: 512,
      samples: 1,
      strength: 0.5,
    });
    if (!urls.length) throw new Error('未返回任何图片');
    await validateGeneratedImage(urls[0]);
    return {
      kind: 'referenceImage',
      passed: true,
      message: '参考图接收可用（请求已携带参考图）',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      kind: 'referenceImage',
      passed: false,
      message: errorSummary(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function runImageModelTests(
  adapter: AIServiceAdapter,
  kinds: ModelTestKind[]
): Promise<{ report: Partial<ModelTestReport>; status: ModelTestStatus }> {
  const tasks: Record<'imageGeneration' | 'imageEditing' | 'referenceImage', () => Promise<ModelTestResult>> = {
    imageGeneration: () => testImageGeneration(adapter),
    imageEditing: () => testImageEditing(adapter),
    referenceImage: () => testReferenceImage(adapter),
  };

  const report: Partial<ModelTestReport> = {};
  const evaluated = kinds.filter((kind): kind is keyof typeof tasks => kind in tasks);
  for (const kind of evaluated) {
    report[kind] = await tasks[kind]();
  }

  const passedCount = evaluated.filter((kind) => report[kind]?.passed).length;
  const status: ModelTestStatus =
    evaluated.length === 0
      ? 'passed'
      : passedCount === evaluated.length
        ? 'passed'
        : passedCount === 0
          ? 'failed'
          : 'partial';

  return { report, status };
}

export interface TestedCapabilitiesSnapshot {
  connection: boolean;
  jsonMode: boolean;
  vision: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  referenceImage: boolean;
}
