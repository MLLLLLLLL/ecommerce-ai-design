import { AIServiceConfig } from '@/types/ai';
import {
  MultimodalAnalysisParams,
  ProductAnalysis,
  PromptGenerationParams,
  CopywritingParams,
  MainImagePrompts,
  DetailPagePrompts,
  CopywritingResult,
} from '@/types/marketing';
import {
  PRODUCT_ANALYSIS_PROMPT,
  MAIN_IMAGE_PROMPT_TEMPLATE,
  DETAIL_PAGE_PROMPT_TEMPLATE,
  COPYWRITING_PROMPT_TEMPLATE,
  fillTemplate,
} from '../sop/templates';
import { CATEGORY_CONFIGS } from '../sop/categories';
import { PLATFORM_CONFIGS, getPlatformConstraints } from '../sop/platforms';

/**
 * 多模态AI适配器
 * 负责调用GPT-4V/Gemini Vision等多模态模型
 */
export class MultimodalAdapter {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  /**
   * 产品分析：识别产品图并生成分析报告
   */
  async analyzeProduct(params: MultimodalAnalysisParams): Promise<ProductAnalysis> {
    try {
      if (this.isImageGenerationModel()) {
        throw new Error(
          `当前模型“${this.config.model}”是图片生成模型，不能用于产品分析。请在设置的“文本模型”中激活支持视觉输入的模型。`
        );
      }
      const messages = [
        {
          role: 'system' as const,
          content: PRODUCT_ANALYSIS_PROMPT,
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: this.buildAnalysisUserPrompt(params),
            },
            ...params.images.map((imageUrl) => ({
              type: 'image_url' as const,
              image_url: { url: imageUrl },
            })),
          ],
        },
      ];

      const response = await this.callOpenAICompatible(messages);
      const analysis = await this.parseJSON<ProductAnalysis>(response, '产品分析');

      return analysis;
    } catch (error) {
      console.error('[MultimodalAdapter] Product analysis failed:', error);
      throw new Error(`产品分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成主图提示词
   */
  async generateMainImagePrompts(params: PromptGenerationParams): Promise<MainImagePrompts> {
    try {
      const categoryConfig = CATEGORY_CONFIGS[params.analysis.category];
      const platformRules = getPlatformConstraints(params.platform);

      const prompt = fillTemplate(MAIN_IMAGE_PROMPT_TEMPLATE, {
        ANALYSIS: JSON.stringify(params.analysis, null, 2),
        PLATFORM: PLATFORM_CONFIGS[params.platform].name,
        PLATFORM_RULES: platformRules.join('\n'),
        USER_SELL_POINTS: params.userSellPoints?.join('\n') || '无',
      });

      const messages = [
        {
          role: 'system' as const,
          content: prompt,
        },
        {
          role: 'user' as const,
          content: `请基于以上信息，生成${categoryConfig.mainImageCount.standard}张标准主图 + ${categoryConfig.mainImageCount.optional}张可选主图的提示词。只输出JSON，不要任何解释。`,
        },
      ];

      const response = await this.callOpenAICompatible(messages);
      const prompts = await this.parseJSON<MainImagePrompts>(response, '主图提示词');

      return prompts;
    } catch (error) {
      console.error('[MultimodalAdapter] Main image prompts generation failed:', error);
      throw new Error(`主图提示词生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成详情页提示词
   */
  async generateDetailPagePrompts(params: PromptGenerationParams): Promise<DetailPagePrompts> {
    try {
      const categoryConfig = CATEGORY_CONFIGS[params.analysis.category];

      const prompt = fillTemplate(DETAIL_PAGE_PROMPT_TEMPLATE, {
        ANALYSIS: JSON.stringify(params.analysis, null, 2),
        PLATFORM: PLATFORM_CONFIGS[params.platform].name,
        CATEGORY_RULES: JSON.stringify(categoryConfig, null, 2),
      });

      const messages = [
        {
          role: 'system' as const,
          content: prompt,
        },
        {
          role: 'user' as const,
          content: `请基于以上信息，生成${categoryConfig.detailPageCount.min}-${categoryConfig.detailPageCount.max}页详情页提示词。只输出JSON，不要任何解释。`,
        },
      ];

      const response = await this.callOpenAICompatible(messages);
      const prompts = await this.parseJSON<DetailPagePrompts>(response, '详情页提示词');

      return prompts;
    } catch (error) {
      console.error('[MultimodalAdapter] Detail page prompts generation failed:', error);
      throw new Error(`详情页提示词生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成文案
   */
  async generateCopywriting(params: CopywritingParams): Promise<CopywritingResult> {
    try {
      const prompt = fillTemplate(COPYWRITING_PROMPT_TEMPLATE, {
        ANALYSIS: JSON.stringify(params.analysis, null, 2),
        PLATFORM: PLATFORM_CONFIGS[params.platform].name,
        KEYWORDS: params.keywords?.join('、') || '无',
      });

      const messages = [
        {
          role: 'system' as const,
          content: prompt,
        },
        {
          role: 'user' as const,
          content: '请基于以上信息生成完整文案体系。只输出JSON，不要任何解释。',
        },
      ];

      const response = await this.callOpenAICompatible(messages);
      const copywriting = await this.parseJSON<CopywritingResult>(response, '文案');

      return copywriting;
    } catch (error) {
      console.error('[MultimodalAdapter] Copywriting generation failed:', error);
      throw new Error(`文案生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 调用OpenAI兼容接口
   */
  private async callOpenAICompatible(messages: any[]): Promise<string> {
    const baseURL = (this.config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${baseURL}/chat/completions`;

    // 检查是否为ToAPI等需要size参数的中转站
    const isToAPI = /toapis\.com/i.test(baseURL);
    
    const requestBody: any = {
      model: this.config.model || 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 6000,
      // OpenAI 兼容接口通常支持该参数；不支持的中转站会自动降级重试。
      response_format: { type: 'json_object' },
    };

    // ToAPI等中转站需要size参数
    if (isToAPI) {
      requestBody.size = 'auto';
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    // 部分中转站不接受 response_format，去掉后重试一次。
    if (!response.ok && [400, 404, 422].includes(response.status)) {
      const fallbackBody = { ...requestBody };
      delete fallbackBody.response_format;
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackBody),
      });
    }

    if (!response.ok) {
      let detail = '';
      try {
        const error = await response.json();
        detail = error.error?.message || error.detail || error.message || '';
      } catch {
        // 非 JSON 错误响应
      }
      throw new Error(`${detail || `API error: ${response.status}`}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      return JSON.stringify(content);
    }
    if (Array.isArray(content)) {
      return content
        .map((part: any) => typeof part === 'string' ? part : part?.text || '')
        .join('');
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('模型响应缺少文本内容');
    }
    return content;
  }

  private isImageGenerationModel(): boolean {
    const model = (this.config.model || '').toLowerCase();
    return /(?:^|[-_])(?:gpt-image|dall-e|seedream|flux|sora|veo|kling|wan)(?:[-_]|\d|$)/.test(model);
  }

  /**
   * 构建产品分析的用户提示词
   */
  private buildAnalysisUserPrompt(params: MultimodalAnalysisParams): string {
    let prompt = '请分析以下产品图片：\n\n';

    if (params.productName) {
      prompt += `产品名称：${params.productName}\n`;
    }

    if (params.userHints?.category) {
      prompt += `用户提示的品类：${params.userHints.category}\n`;
    }

    if (params.userHints?.sellPoints && params.userHints.sellPoints.length > 0) {
      prompt += `\n用户补充的卖点：\n`;
      params.userHints.sellPoints.forEach((point, index) => {
        prompt += `${index + 1}. ${point}\n`;
      });
    }

    if (params.userHints?.parameters) {
      prompt += `\n用户补充的参数：\n`;
      Object.entries(params.userHints.parameters).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
    }

    prompt += '\n请输出完整的产品分析报告JSON。';

    return prompt;
  }

  /**
   * 解析JSON响应
   */
  private async parseJSON<T>(content: string, label: string): Promise<T> {
    const raw = content.replace(/^\uFEFF/, '').trim();
    const parsed = this.parseJSONCandidate<T>(raw);
    if (parsed !== null) return parsed;

    // 有些模型会截断 JSON 或把换行、引号写坏；让模型只做一次格式修复。
    try {
      const repaired = await this.callOpenAICompatible([
        {
          role: 'system' as const,
          content: '你是JSON修复器。只输出合法JSON对象，不要Markdown、解释或代码围栏。保留原内容，不要补充不存在的事实。',
        },
        {
          role: 'user' as const,
          content: `请修复下面${label}模型响应，使其成为合法JSON。若内容不完整，尽量依据已有字段补齐为空字符串、空数组或空对象。\n<response>\n${raw.slice(0, 16000)}\n</response>`,
        },
      ]);
      const repairedParsed = this.parseJSONCandidate<T>(repaired);
      if (repairedParsed !== null) return repairedParsed;
    } catch (error) {
      console.warn(`[MultimodalAdapter] ${label} JSON repair failed:`, error);
    }

    console.error('[MultimodalAdapter] JSON parse failed. Raw response:', raw.slice(0, 4000));
    throw new Error('AI返回内容无法解析为JSON，请重试或更换支持结构化输出的模型');
  }

  private parseJSONCandidate<T>(value: string): T | null {
    const raw = value.replace(/^\uFEFF/, '').trim();
    const candidates: string[] = [];
    const fenced = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
    if (fenced?.[1]) candidates.push(fenced[1].trim());
    candidates.push(raw);

    const extracted = this.extractJSONObject(raw);
    if (extracted) candidates.push(extracted);

    for (const candidate of candidates) {
      let parsed = this.tryParseJSON(candidate);
      // 某些接口会把 JSON 作为带引号的字符串返回，再尝试解码一层。
      if (typeof parsed === 'string') parsed = this.tryParseJSON(parsed);
      if (parsed !== null) {
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const wrapper = parsed as Record<string, unknown>;
          for (const key of ['data', 'result', 'analysis']) {
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

  private tryParseJSON(value: string): unknown | null {
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
  private extractJSONObject(value: string): string | null {
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
}
