import { AIServiceConfig } from '@/types/ai';
import {
  MultimodalAnalysisParams,
  ProductAnalysis,
  Category,
} from '@/types/marketing';
import { MultimodalAdapter } from './adapters/MultimodalAdapter';
import { inferCategory, CATEGORY_CONFIGS } from './sop/categories';

/**
 * 产品分析引擎
 * 负责识别产品图并生成分析报告
 */
export class ProductAnalyzer {
  private adapter: MultimodalAdapter;

  constructor(aiConfig: AIServiceConfig) {
    this.adapter = new MultimodalAdapter(aiConfig);
  }

  /**
   * 分析产品
   */
  async analyze(params: MultimodalAnalysisParams): Promise<ProductAnalysis> {
    try {
      // 调用AI进行多模态分析
      const analysis = await this.adapter.analyzeProduct(params);

      // 验证和增强分析结果
      const enhancedAnalysis = this.enhanceAnalysis(analysis, params);

      return enhancedAnalysis;
    } catch (error) {
      console.error('[ProductAnalyzer] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * 增强分析结果
   */
  private enhanceAnalysis(
    analysis: ProductAnalysis,
    params: MultimodalAnalysisParams
  ): ProductAnalysis {
    // 如果AI没有正确识别品类，尝试自动推断
    if (!analysis.category || !CATEGORY_CONFIGS[analysis.category]) {
      analysis.category = inferCategory(
        params.productName || analysis.productName,
        analysis.confirmed.appearance
      );
    }

    // 应用品类配置的合规规则
    const categoryConfig = CATEGORY_CONFIGS[analysis.category];
    if (categoryConfig) {
      analysis.compliance = {
        forbiddenClaims: categoryConfig.forbiddenClaims,
        complianceRedline: categoryConfig.complianceRedline,
      };
      analysis.recommendedSOP = categoryConfig.sopReference;
    }

    // 合并用户提供的信息
    if (params.userHints) {
      if (params.userHints.sellPoints && params.userHints.sellPoints.length > 0) {
        analysis.inferred.sellPoints = [
          ...new Set([
            ...analysis.inferred.sellPoints,
            ...params.userHints.sellPoints,
          ]),
        ];
      }

      if (params.userHints.parameters) {
        // 将用户提供的参数从占位符中移除
        const userParamKeys = Object.keys(params.userHints.parameters);
        analysis.placeholders.parameters = analysis.placeholders.parameters.filter(
          (placeholder) => {
            return !userParamKeys.some((key) =>
              placeholder.includes(key)
            );
          }
        );
      }
    }

    return analysis;
  }

  /**
   * 验证产品图片
   */
  validateImages(images: string[]): { valid: boolean; error?: string } {
    if (!images || images.length === 0) {
      return { valid: false, error: '至少需要上传1张产品图片' };
    }

    if (images.length > 5) {
      return { valid: false, error: '最多支持5张产品图片' };
    }

    // 验证URL格式
    for (const image of images) {
      if (!this.isValidImageUrl(image)) {
        return { valid: false, error: '图片URL格式不正确' };
      }
    }

    return { valid: true };
  }

  /**
   * 验证图片URL
   */
  private isValidImageUrl(url: string): boolean {
    try {
      // 支持http/https URL和data URL
      if (url.startsWith('data:image/')) {
        return true;
      }

      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
