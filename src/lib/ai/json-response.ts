import type { z } from 'zod';
import {
  TextCompletionClient,
  TextCompletionError,
  TextCompletionRequest,
} from '@/lib/ai/text-completion-client';

// ============================================
// JSON 响应解析与 Schema 校验（V3 5.1）
// 统一处理模型文本响应中的 JSON 提取与 Zod 校验。
// Schema 不匹配归类为 schema_mismatch（不可盲目重试，V3 5.3），
// 调用方映射为 OUTPUT_INVALID。
// ============================================

const WRAPPER_KEYS = ['data', 'result', 'analysis'] as const;

function tryParseJSON(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    // 处理模型常见的尾逗号，不改变字符串内部内容。
    try {
      return JSON.parse(value.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/** 从解释文字中提取第一个完整 JSON 对象，支持字符串和转义引号。 */
export function extractJSONObject(value: string): string | null {
  const start = value.search(/[\[{]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack.pop() !== expected) return null;
      if (stack.length === 0) return value.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 从模型响应文本中解析出对象（不做 Schema 校验）。
 * 依次尝试：Markdown 围栏、整段 JSON、解释文字中的 JSON、双层字符串解码。
 * 失败返回 null。
 */
export function parseJSONCandidate<T>(value: string): T | null {
  const raw = value.replace(/^\uFEFF/, '').trim();
  const candidates: string[] = [];
  const fenced = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(raw);

  const extracted = extractJSONObject(raw);
  if (extracted) candidates.push(extracted);

  for (const candidate of candidates) {
    let parsed = tryParseJSON(candidate);
    // 某些接口会把 JSON 作为带引号的字符串返回，再尝试解码一层。
    if (typeof parsed === 'string') parsed = tryParseJSON(parsed);
    if (parsed !== null) {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const wrapper = parsed as Record<string, unknown>;
        for (const key of WRAPPER_KEYS) {
          if (wrapper[key] && typeof wrapper[key] === 'object') {
            return wrapper[key] as T;
          }
        }
      }
      return parsed as T;
    }
  }
  return null;
}

export interface CompleteJSONOptions {
  /** 出错信息中的结果标签，如“产品分析”。 */
  label?: string;
  /** 是否在 JSON 无法解析或 Schema 不匹配时让模型修复一次（额外一次模型调用）。 */
  repair?: boolean;
  /** 修复请求的 prompt（默认内置 JSON 修复器）。 */
  repairPrompt?: string;
}

const DEFAULT_REPAIR_PROMPT =
  '你是JSON修复器。只输出合法JSON对象，不要Markdown、解释或代码围栏。保留原内容，不要补充不存在的事实。';

function formatSchemaIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('；');
}

async function repairJSONResponse(
  client: TextCompletionClient,
  request: TextCompletionRequest,
  content: string,
  label: string,
  options: CompleteJSONOptions,
  schemaIssues?: string
): Promise<{ content: string; parsed: unknown } | null> {
  try {
    const repairedContent = await client.complete({
      messages: [
        { role: 'system', content: options.repairPrompt ?? DEFAULT_REPAIR_PROMPT },
        {
          role: 'user',
          content:
            `请修复下面${label}模型响应，使其成为符合要求的JSON对象。` +
            (schemaIssues ? `\n当前结构问题：${schemaIssues}` : '') +
            '\n可以去除包装层、将同义字段改为要求的字段名，或将已有内容重组到必填字段。不得添加原响应中没有的事实。' +
            `\n<response>\n${content.slice(0, 16000)}\n</response>`,
        },
      ],
      responseFormat: request.responseFormat,
      signal: request.signal,
    });
    const parsed = parseJSONCandidate<unknown>(repairedContent);
    return parsed === null ? null : { content: repairedContent, parsed };
  } catch (error) {
    if (!(error instanceof TextCompletionError)) throw error;
    return null;
  }
}

/**
 * 调用模型并返回通过 Schema 校验的对象。
 *
 * 失败分类：
 * - 响应无法解析为 JSON -> invalid_json（不可重试）
 * - JSON 可解析但 Schema 不匹配 -> schema_mismatch（不可重试，映射 OUTPUT_INVALID）
 * - 上游错误由客户端抛出
 */
export async function completeJSON<T>(
  client: TextCompletionClient,
  request: TextCompletionRequest,
  schema: z.ZodType<T>,
  options: CompleteJSONOptions = {}
): Promise<T> {
  const label = options.label ?? '模型响应';

  let content = await client.complete(request);
  let parsed = parseJSONCandidate<unknown>(content);
  let repairAttempted = false;

  if (parsed === null && options.repair) {
    repairAttempted = true;
    const repaired = await repairJSONResponse(client, request, content, label, options);
    if (repaired) {
      content = repaired.content;
      parsed = repaired.parsed;
    }
  }

  if (parsed === null) {
    throw new TextCompletionError(`${label}无法解析为JSON，请重试或更换支持结构化输出的模型`, 'invalid_json', {
      retryable: false,
    });
  }

  let result = schema.safeParse(parsed);
  if (!result.success && options.repair && !repairAttempted) {
    repairAttempted = true;
    const repaired = await repairJSONResponse(
      client,
      request,
      content,
      label,
      options,
      formatSchemaIssues(result.error)
    );
    if (repaired) {
      result = schema.safeParse(repaired.parsed);
    }
  }

  if (!result.success) {
    const issues = formatSchemaIssues(result.error);
    throw new TextCompletionError(`${label}结构不符合预期：${issues}`, 'schema_mismatch', {
      retryable: false,
    });
  }
  return result.data;
}
