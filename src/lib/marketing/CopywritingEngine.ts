import { AIServiceConfig } from '@/types/ai';
import {
  ProductAnalysis,
  CopywritingParams,
  CopywritingResult,
  Platform,
  Language,
} from '@/types/marketing';
import { MultimodalAdapter } from './adapters/MultimodalAdapter';
import { PLATFORM_CONFIGS } from './sop/platforms';

/**
 * 文案生成引擎
 * 负责根据产品分析生成电商文案
 */
export class CopywritingEngine {
  private adapter: MultimodalAdapter;

  constructor(aiConfig: AIServiceConfig) {
    this.adapter = new MultimodalAdapter(aiConfig);
  }

  /**
   * 生成文案
   */
  async generate(
    analysis: ProductAnalysis,
    platform: Platform,
    language: Language,
    keywords?: string[]
  ): Promise<CopywritingResult> {
    try {
      const params: CopywritingParams = {
        analysis,
        platform,
        language,
        keywords,
      };

      const copywriting = await this.adapter.generateCopywriting(params);

      // 验证和增强文案
      return this.enhanceCopywriting(copywriting, analysis, platform);
    } catch (error) {
      console.error('[CopywritingEngine] Copywriting generation failed:', error);
      throw error;
    }
  }

  /**
   * 增强文案结果
   */
  private enhanceCopywriting(
    copywriting: CopywritingResult,
    analysis: ProductAnalysis,
    platform: Platform
  ): CopywritingResult {
    const platformConfig = PLATFORM_CONFIGS[platform];

    // 添加平台合规的禁用词
    const platformForbiddenWords = this.getPlatformForbiddenWords(platform);
    copywriting.seo.forbidden = [
      ...new Set([...copywriting.seo.forbidden, ...platformForbiddenWords]),
    ];

    // 验证标题长度
    if (copywriting.title.main.length > 60) {
      console.warn(
        `[CopywritingEngine] Title too long: ${copywriting.title.main.length} chars`
      );
      copywriting.title.main = copywriting.title.main.substring(0, 60);
    }

    // 过滤卖点中的禁用词
    copywriting.corePoints = copywriting.corePoints.map((point) => {
      let text = point.text;
      platformForbiddenWords.forEach((word) => {
        const regex = new RegExp(word, 'gi');
        if (regex.test(text)) {
          console.warn(`[CopywritingEngine] Forbidden word found: ${word}`);
          text = text.replace(regex, '优秀');
        }
      });
      return { ...point, text };
    });

    return copywriting;
  }

  /**
   * 获取平台禁用词
   */
  private getPlatformForbiddenWords(platform: Platform): string[] {
    const commonForbidden = [
      '最强',
      '第一',
      '最佳',
      '最好',
      '100%',
      '绝对',
      '永久',
      '完美',
      '顶级',
      '极致',
      '国家级',
      '世界级',
    ];

    // 跨境电商额外禁用词
    const crossBorderForbidden = [
      'Best',
      'No.1',
      'First',
      '#1',
      'FDA approved',
      'Cure',
      'Treat',
      'Prevent disease',
    ];

    const platformConfig = PLATFORM_CONFIGS[platform];
    if (platformConfig.region === 'cross-border') {
      return [...commonForbidden, ...crossBorderForbidden];
    }

    return commonForbidden;
  }

  /**
   * 验证文案质量
   */
  validateCopywriting(copywriting: CopywritingResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查核心卖点
    if (!copywriting.corePoints || copywriting.corePoints.length < 3) {
      issues.push('核心卖点少于3条');
    } else if (copywriting.corePoints.length > 5) {
      issues.push('核心卖点超过5条');
    }

    // 检查标题
    if (!copywriting.title.main) {
      issues.push('缺少主标题');
    } else if (copywriting.title.main.length > 60) {
      issues.push('主标题超过60字');
    }

    if (!copywriting.title.variations || copywriting.title.variations.length < 3) {
      issues.push('标题变体少于3个');
    }

    // 检查描述
    if (!copywriting.description.short) {
      issues.push('缺少简短描述');
    } else if (copywriting.description.short.length < 50) {
      issues.push('简短描述过短（少于50字）');
    } else if (copywriting.description.short.length > 200) {
      issues.push('简短描述过长（超过200字）');
    }

    if (!copywriting.description.long) {
      issues.push('缺少详细描述');
    } else if (copywriting.description.long.length < 200) {
      issues.push('详细描述过短（少于200字）');
    }

    // 检查SEO关键词
    if (!copywriting.seo.primary || copywriting.seo.primary.length === 0) {
      issues.push('缺少主关键词');
    }

    // 检查是否包含禁用词
    const allText = [
      copywriting.title.main,
      ...copywriting.title.variations,
      ...copywriting.corePoints.map((p) => p.text),
      copywriting.description.short,
      copywriting.description.long,
    ].join(' ');

    copywriting.seo.forbidden.forEach((word) => {
      if (allText.includes(word)) {
        issues.push(`文案中包含禁用词：${word}`);
      }
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 优化文案（去除禁用词、调整长度等）
   */
  optimizeCopywriting(copywriting: CopywritingResult): CopywritingResult {
    const optimized = { ...copywriting };

    // 优化标题长度
    if (optimized.title.main.length > 60) {
      optimized.title.main = this.truncateTitle(optimized.title.main, 60);
    }

    optimized.title.variations = optimized.title.variations.map((title) =>
      this.truncateTitle(title, 60)
    );

    // 移除禁用词
    const forbidden = optimized.seo.forbidden;
    optimized.title.main = this.removeForbiddenWords(optimized.title.main, forbidden);
    optimized.title.variations = optimized.title.variations.map((title) =>
      this.removeForbiddenWords(title, forbidden)
    );
    optimized.corePoints = optimized.corePoints.map((point) => ({
      ...point,
      text: this.removeForbiddenWords(point.text, forbidden),
    }));

    return optimized;
  }

  /**
   * 截断标题
   */
  private truncateTitle(title: string, maxLength: number): string {
    if (title.length <= maxLength) {
      return title;
    }

    // 尽量在词语边界截断
    let truncated = title.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated;
  }

  /**
   * 移除禁用词
   */
  private removeForbiddenWords(text: string, forbidden: string[]): string {
    let result = text;
    forbidden.forEach((word) => {
      const regex = new RegExp(word, 'gi');
      result = result.replace(regex, '');
    });
    return result.trim();
  }
}
