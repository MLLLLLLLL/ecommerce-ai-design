import { z } from 'zod';
import { MARKETING_LANGUAGES } from '@/lib/marketing/languages';

// ============================================
// 语言代码集中校验（V3 4.4）
// 翻译目标语言必须来自 MARKETING_LANGUAGES，防止任意字符串
// 进入模型 prompt 造成提示注入或无效请求。
// ============================================

export const MARKETING_LANGUAGE_CODES: readonly string[] = MARKETING_LANGUAGES.map(
  (option) => option.code
);

export const marketingLanguageCodeSchema = z.enum(
  MARKETING_LANGUAGE_CODES as [string, ...string[]]
);
