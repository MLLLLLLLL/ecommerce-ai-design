// ============================================
// 电商营销模块类型定义
// ============================================

// ============================================
// 平台与品类
// ============================================

export type Platform =
  | 'taobao' // 淘宝/天猫
  | 'jd' // 京东
  | 'pdd' // 拼多多
  | 'douyin' // 抖音小店
  | 'kuaishou' // 快手小店
  | 'xiaohongshu' // 小红书
  | '1688' // 1688
  | 'temu' // Temu
  | 'shein' // SHEIN
  | 'aliexpress' // 速卖通
  | 'wish' // Wish
  | 'amazon' // Amazon
  | 'ozon' // OZON
  | 'ebay' // eBay
  | 'walmart' // Walmart
  | 'shopee' // Shopee
  | 'lazada' // Lazada
  | 'tiktok' // TikTok Shop
  | 'shopify' // Shopify
  | 'independent'; // 独立站

export type Category =
  | '3C数码'
  | '美妆日化'
  | '百货杯壶'
  | '美食'
  | '服饰'
  | '老檀木文玩'
  | '家具详情页'
  | '家具主图'
  | '海产品';

export type Language = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR' | 'es-ES' | 'fr-FR' | 'de-DE' | 'ru-RU';

// ============================================
// 产品分析
// ============================================

export interface ProductAnalysis {
  // 产品基础信息
  productName: string;
  category: Category;
  subcategory?: string;

  // 产品外观锁定描述（用于生图）
  productAnchor: string;

  // 可确认信息
  confirmed: {
    appearance: string; // 外观描述
    material?: string; // 材质
    color?: string; // 颜色
    structure?: string[]; // 结构特征
    packaging?: string; // 包装形态
  };

  // 可推断信息
  inferred: {
    sellPoints: string[]; // 可见卖点
    usageScenario?: string; // 使用场景
    targetAudience?: string; // 目标人群
    style?: string; // 风格定位
  };

  // 不可确认信息（需占位符）
  placeholders: {
    parameters: string[]; // 如：【续航天数】【容量】
    certifications: string[]; // 如：【认证标准】
    features: string[]; // 如：【核心功能】
  };

  // 风险提示
  risks: string[];

  // 推荐SOP
  recommendedSOP: string;

  // 合规检查
  compliance: {
    forbiddenClaims: string[]; // 禁止编造的内容
    complianceRedline?: string; // 合规红线
  };
}

// ============================================
// 文案生成
// ============================================

export interface CopywritingResult {
  // 核心卖点（3-5条）
  corePoints: {
    text: string;
    emphasis: 'high' | 'medium' | 'low';
  }[];

  // 商品标题
  title: {
    main: string; // 主标题（60字内）
    variations: string[]; // 3个变体
    seoOptimized: string; // SEO优化版
  };

  // 商品描述
  description: {
    short: string; // 简短版（200字）
    long: string; // 详情页版（500-1000字）
    structured: {
      intro: string; // 开场白
      features: string[]; // 核心特性
      usage: string; // 使用说明
      specifications: string; // 规格参数
    };
  };

  // SEO关键词
  seo: {
    primary: string[]; // 主关键词
    secondary: string[]; // 长尾词
    forbidden: string[]; // 禁用词
  };
}

// ============================================
// 提示词生成
// ============================================

export interface MainImagePrompts {
  // 产品外观锁定描述
  productAnchor: string;

  // 主图规划表
  plan: {
    imageIndex: number;
    responsibility: string; // 图片职责
    reasoning: string; // 为什么需要
    ratio: '1:1' | '3:4';
    hasModel: boolean;
    faceRule: 'forbidden' | 'allowed' | 'auto';
    textRule: string;
    coreInfo: string[];
  }[];

  // 逐张提示词（6+2）
  prompts: {
    index: number;
    title: string; // 关键词标题
    chinesePrompt: string; // 完整中文提示词
    renderParams: string; // 英文渲染参数
  }[];

  // 平台合规约束
  platformConstraints: string[];
}

export interface DetailPagePrompts {
  // 产品外观锁定描述
  productAnchor: string;

  // 详情页规划总表
  plan: {
    pageIndex: number;
    keyword: string; // 页面关键词（4-10字）
    responsibility: string;
    ratio: '3:4';
    hasModel: boolean;
    modelType?: string; // 手部/无脸半身等
    coreInfo: string[];
  }[];

  // 逐页提示词（6-10页）
  prompts: {
    index: number;
    keyword: string;
    chinesePrompt: string; // 含构图/设计/文字排版/信息密度
    renderParams: string;
  }[];

  // 品类特殊规则
  categoryRules: string[];
}

// ============================================
// 营销任务
// ============================================

export interface MarketingTaskInput {
  // 产品信息
  productName: string;
  productImages: string[]; // 产品图URL数组
  category?: Category; // 可选，不填则自动识别
  platform: Platform;
  language: Language;

  // 用户补充信息
  sellPoints?: string[]; // 核心卖点
  keywords?: string[]; // 目标关键词
  parameters?: Record<string, string>; // 产品参数

  // 输出选项
  outputs: {
    analysis: boolean; // 产品分析报告
    copywriting: boolean; // 文案生成
    mainPrompts: boolean; // 主图提示词
    detailPrompts: boolean; // 详情页提示词
  };

  modelSelection: MarketingModelSelection;
}

export interface MarketingModelSelection {
  visionModelId: string;
  contentModelId: string;
}

export interface MarketingTaskResult {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  
  // 分析结果
  analysis?: ProductAnalysis;
  
  // 生成结果
  copywriting?: CopywritingResult;
  mainPrompts?: MainImagePrompts;
  detailPrompts?: DetailPagePrompts;
  
  // 错误信息
  error?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================
// 配置与规则
// ============================================

export interface CategoryConfig {
  name: string;
  sopReference: string; // 对应的SOP文档编号
  visualLanguage: string[]; // 视觉语言
  forbiddenClaims: string[]; // 禁止编造的内容
  complianceRedline?: string; // 合规红线
  mainImageCount: {
    standard: number;
    optional: number;
  };
  detailPageCount: {
    min: number;
    max: number;
  };
}

export interface PlatformConfig {
  code: string;
  name: string;
  coverImageRule: string; // 首图规则
  textConstraints: string[]; // 文字约束
  language: Language;
  region: 'domestic' | 'cross-border';
}

// ============================================
// AI适配器
// ============================================

export interface MultimodalAnalysisParams {
  images: string[];
  productName?: string;
  userHints?: {
    category?: Category;
    sellPoints?: string[];
    parameters?: Record<string, string>;
  };
}

export interface PromptGenerationParams {
  analysis: ProductAnalysis;
  platform: Platform;
  language: Language;
  type: 'main' | 'detail';
  userSellPoints?: string[];
}

export interface CopywritingParams {
  analysis: ProductAnalysis;
  platform: Platform;
  language: Language;
  keywords?: string[];
}
