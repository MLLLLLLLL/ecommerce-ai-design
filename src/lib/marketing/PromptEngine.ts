import { AIServiceConfig } from '@/types/ai';
import {
  ProductAnalysis,
  PromptGenerationParams,
  MainImagePrompts,
  DetailPagePrompts,
  Platform,
  Language,
} from '@/types/marketing';
import { MultimodalAdapter } from './adapters/MultimodalAdapter';
import { CATEGORY_CONFIGS } from './sop/categories';

/**
 * 提示词生成引擎
 * 负责根据产品分析生成主图和详情页提示词
 */
export class PromptEngine {
  private adapter: MultimodalAdapter;

  constructor(aiConfig: AIServiceConfig) {
    this.adapter = new MultimodalAdapter(aiConfig);
  }

  /**
   * 生成主图提示词
   */
  async generateMainImagePrompts(
    analysis: ProductAnalysis,
    platform: Platform,
    language: Language,
    userSellPoints?: string[]
  ): Promise<MainImagePrompts> {
    try {
      const params: PromptGenerationParams = {
        analysis,
        platform,
        language,
        type: 'main',
        userSellPoints,
      };

      const prompts = await this.adapter.generateMainImagePrompts(params);

      // 验证和增强提示词
      return this.enhanceMainImagePrompts(prompts, analysis);
    } catch (error) {
      console.error('[PromptEngine] Main image prompts generation failed:', error);
      throw error;
    }
  }

  /**
   * 生成详情页提示词
   */
  async generateDetailPagePrompts(
    analysis: ProductAnalysis,
    platform: Platform,
    language: Language
  ): Promise<DetailPagePrompts> {
    try {
      const params: PromptGenerationParams = {
        analysis,
        platform,
        language,
        type: 'detail',
      };

      const prompts = await this.adapter.generateDetailPagePrompts(params);

      // 验证和增强提示词
      return this.enhanceDetailPagePrompts(prompts, analysis);
    } catch (error) {
      console.error('[PromptEngine] Detail page prompts generation failed:', error);
      throw error;
    }
  }

  /**
   * 增强主图提示词
   */
  private enhanceMainImagePrompts(
    prompts: MainImagePrompts,
    analysis: ProductAnalysis
  ): MainImagePrompts {
    const categoryConfig = CATEGORY_CONFIGS[analysis.category];

    // 验证生成的提示词数量
    const expectedTotal =
      categoryConfig.mainImageCount.standard + categoryConfig.mainImageCount.optional;

    if (prompts.prompts.length !== expectedTotal) {
      console.warn(
        `[PromptEngine] Expected ${expectedTotal} prompts, got ${prompts.prompts.length}`
      );
    }

    // 确保每个提示词都包含产品锁定约束
    prompts.prompts = prompts.prompts.map((prompt) => {
      if (!prompt.chinesePrompt.includes('以原始产品图作为唯一外观参考')) {
        prompt.chinesePrompt = `以原始产品图作为唯一外观参考，严格复刻产品原貌。${prompt.chinesePrompt}`;
      }
      return prompt;
    });

    return prompts;
  }

  /**
   * 增强详情页提示词
   */
  private enhanceDetailPagePrompts(
    prompts: DetailPagePrompts,
    analysis: ProductAnalysis
  ): DetailPagePrompts {
    const categoryConfig = CATEGORY_CONFIGS[analysis.category];

    // 验证生成的提示词数量
    if (
      prompts.prompts.length < categoryConfig.detailPageCount.min ||
      prompts.prompts.length > categoryConfig.detailPageCount.max
    ) {
      console.warn(
        `[PromptEngine] Expected ${categoryConfig.detailPageCount.min}-${categoryConfig.detailPageCount.max} pages, got ${prompts.prompts.length}`
      );
    }

    // 确保每个提示词都包含产品锁定约束
    prompts.prompts = prompts.prompts.map((prompt) => {
      if (!prompt.chinesePrompt.includes('以原图为唯一产品')) {
        prompt.chinesePrompt = `以原图为唯一产品与信息参考。${prompt.chinesePrompt}`;
      }
      return prompt;
    });

    // 添加品类特殊规则
    prompts.categoryRules = [
      ...(categoryConfig.visualLanguage || []),
      ...(categoryConfig.complianceRedline ? [categoryConfig.complianceRedline] : []),
    ];

    return prompts;
  }

  /**
   * 验证提示词质量
   */
  validatePrompts(
    prompts: MainImagePrompts | DetailPagePrompts
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查产品锁定描述
    if (!prompts.productAnchor || prompts.productAnchor.length < 20) {
      issues.push('产品外观锁定描述过短或缺失');
    }

    // 检查提示词数量
    if (!prompts.prompts || prompts.prompts.length === 0) {
      issues.push('没有生成任何提示词');
    }

    // 检查每个提示词的完整性
    prompts.prompts.forEach((prompt, index) => {
      if (!prompt.chinesePrompt || prompt.chinesePrompt.length < 50) {
        issues.push(`第${index + 1}条提示词内容过短`);
      }

      if (!prompt.renderParams) {
        issues.push(`第${index + 1}条提示词缺少渲染参数`);
      }

      // 检查是否包含占位符（可能是AI没有正确替换）
      if (prompt.chinesePrompt.includes('{{') || prompt.chinesePrompt.includes('【待补充')) {
        issues.push(`第${index + 1}条提示词包含未替换的占位符`);
      }
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
