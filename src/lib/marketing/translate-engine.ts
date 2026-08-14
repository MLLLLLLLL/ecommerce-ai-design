import { z } from 'zod';
import { completeJSON } from '@/lib/ai/json-response';
import { TextCompletionClient } from '@/lib/ai/text-completion-client';
import { getLanguageOption } from '@/lib/marketing/languages';
import {
  MARKETING_LANGUAGE_CODES,
  marketingLanguageCodeSchema,
} from '@/lib/marketing/language-codes';

// ============================================
// 翻译引擎（V3 Phase 3）
// 单语言翻译；要求保留段落、列表符号与换行结构。
// 通过 language-codes 校验目标语言，防止 prompt 注入与无效代码。
// ============================================

const translationSchema = z
  .object({
    translation: z.string().min(1),
  })
  .strict();

export interface TranslateParams {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

function buildSystemPrompt(params: TranslateParams): string {
  const sourceLabel =
    params.sourceLanguage === 'auto'
      ? '自动识别源语言'
      : (getLanguageOption(params.sourceLanguage)?.label ?? params.sourceLanguage);
  const targetLabel = getLanguageOption(params.targetLanguage)?.label ?? params.targetLanguage;

  return [
    '你是专业的电商内容翻译专家。',
    `请将以下${sourceLabel}内容翻译成${targetLabel}。`,
    '',
    '翻译要求：',
    '1. 保持原文的段落结构、换行位置和列表符号（如 -、•、1. 等）不变；',
    '2. 不翻译品牌名、专有名词、网址、代码和数字单位；',
    '3. 语气和长度贴近原文，不添加原文没有的信息；',
    '4. 只输出 JSON：{"translation":"..."}，不要任何解释或 Markdown。',
  ].join('\n');
}

export class TranslateEngine {
  constructor(private client: TextCompletionClient) {}

  async translate(params: TranslateParams): Promise<string> {
    const content = await completeJSON(
      this.client,
      {
        messages: [
          { role: 'system', content: buildSystemPrompt(params) },
          { role: 'user', content: params.sourceText },
        ],
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 8000,
      },
      translationSchema,
      { label: '翻译结果', repair: false }
    );
    return content.translation.trim();
  }
}

export function isValidTargetLanguage(code: string): boolean {
  return MARKETING_LANGUAGE_CODES.includes(code);
}

export function isValidSourceLanguage(code: string): boolean {
  return code === 'auto' || isValidTargetLanguage(code);
}

export function assertValidTranslateInput(input: {
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
}): { valid: true } | { valid: false; message: string } {
  if (!marketingLanguageCodeSchema.safeParse(input.sourceLanguage).success && input.sourceLanguage !== 'auto') {
    return { valid: false, message: '源语言无效' };
  }
  const unique = [...new Set(input.targetLanguages)];
  if (unique.length !== input.targetLanguages.length) {
    return { valid: false, message: '目标语言存在重复' };
  }
  for (const code of input.targetLanguages) {
    if (!isValidTargetLanguage(code)) {
      return { valid: false, message: `目标语言无效：${code}` };
    }
  }
  return { valid: true };
}
