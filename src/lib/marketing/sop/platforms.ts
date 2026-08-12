import { Platform, PlatformConfig, Language } from '@/types/marketing';

/**
 * 平台配置库
 * 基于31份SOP文档提取的平台规则
 */
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  taobao: {
    code: 'taobao',
    name: '淘宝/天猫',
    coverImageRule: '白底、无文字、无道具、无水印',
    textConstraints: [
      '禁止绝对化夸张词（最强/第一/100%有效）',
      '参数必用"待补充参数位"占位',
      '禁止虚构销量、认证',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  jd: {
    code: 'jd',
    name: '京东',
    coverImageRule: '白底、产品占比85%以上',
    textConstraints: [
      '禁止绝对化表述',
      '信息密度偏高',
      '参数需真实可查',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  pdd: {
    code: 'pdd',
    name: '拼多多',
    coverImageRule: '白底或浅色底，简洁清晰',
    textConstraints: [
      '标题突出性价比',
      '禁止夸大功效',
      '价格敏感',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  douyin: {
    code: 'douyin',
    name: '抖音小店',
    coverImageRule: '生活化场景优先，吸引眼球',
    textConstraints: [
      '短视频风格',
      '生活方式感',
      '转化导向',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  kuaishou: {
    code: 'kuaishou',
    name: '快手小店',
    coverImageRule: '真实场景，接地气',
    textConstraints: [
      '简单直接',
      '实惠感',
      '信任感',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  xiaohongshu: {
    code: 'xiaohongshu',
    name: '小红书',
    coverImageRule: '美学优先，生活方式',
    textConstraints: [
      '种草风格',
      '真实体验感',
      '禁止硬广',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  '1688': {
    code: '1688',
    name: '1688',
    coverImageRule: 'B2B规格图，参数清晰',
    textConstraints: [
      '批发导向',
      '规格参数完整',
      '起订量/价格梯度',
    ],
    language: 'zh-CN',
    region: 'domestic',
  },

  temu: {
    code: 'temu',
    name: 'Temu',
    coverImageRule: '白底或简洁背景',
    textConstraints: [
      '英文简短',
      '禁止Best/No.1',
      '性价比突出',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  shein: {
    code: 'shein',
    name: 'SHEIN',
    coverImageRule: '时尚大片风格',
    textConstraints: [
      '英文时尚用语',
      '禁止夸张表述',
      '快时尚风格',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  aliexpress: {
    code: 'aliexpress',
    name: '速卖通/AliExpress',
    coverImageRule: '白底或场景图',
    textConstraints: [
      '英文清晰',
      '禁止Best/First/FDA approved',
      '国际化表达',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  wish: {
    code: 'wish',
    name: 'Wish',
    coverImageRule: '产品清晰，吸引眼球',
    textConstraints: [
      '英文简洁',
      '价格敏感',
      '禁止医疗/安全夸大',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  amazon: {
    code: 'amazon',
    name: 'Amazon',
    coverImageRule: '纯白底、产品占比85%以上、无文字无水印',
    textConstraints: [
      '禁止Best/No.1/FDA approved/Cure/Treat',
      '严格合规',
      '信息准确',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  ozon: {
    code: 'ozon',
    name: 'OZON',
    coverImageRule: '白底清晰',
    textConstraints: [
      '俄语表达',
      '本地化',
      '价格透明',
    ],
    language: 'ru-RU',
    region: 'cross-border',
  },

  ebay: {
    code: 'ebay',
    name: 'eBay',
    coverImageRule: '清晰产品图',
    textConstraints: [
      '英文详细描述',
      '二手/全新标注',
      '诚信导向',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  walmart: {
    code: 'walmart',
    name: 'Walmart',
    coverImageRule: '白底或浅色底',
    textConstraints: [
      '英文规范',
      '禁止医疗功效',
      '美国市场合规',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  shopee: {
    code: 'shopee',
    name: 'Shopee',
    coverImageRule: '吸引眼球，促销感',
    textConstraints: [
      '英文/当地语言',
      '东南亚风格',
      '价格优势',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  lazada: {
    code: 'lazada',
    name: 'Lazada',
    coverImageRule: '清晰产品图',
    textConstraints: [
      '英文简洁',
      '东南亚市场',
      '促销导向',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  tiktok: {
    code: 'tiktok',
    name: 'TikTok Shop',
    coverImageRule: '视频首帧吸引眼球',
    textConstraints: [
      '英文口语化',
      '短视频风格',
      '年轻化',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  shopify: {
    code: 'shopify',
    name: 'Shopify',
    coverImageRule: '品牌化、高质感',
    textConstraints: [
      '品牌叙事',
      '独立站风格',
      '用户体验优先',
    ],
    language: 'en-US',
    region: 'cross-border',
  },

  independent: {
    code: 'independent',
    name: '独立站',
    coverImageRule: '品牌定制，高级感',
    textConstraints: [
      '品牌故事',
      '用户体验',
      '转化优化',
    ],
    language: 'en-US',
    region: 'cross-border',
  },
};

/**
 * 获取平台的合规约束
 */
export function getPlatformConstraints(platform: Platform): string[] {
  const config = PLATFORM_CONFIGS[platform];
  return [config.coverImageRule, ...config.textConstraints];
}

/**
 * 检查平台是否为跨境平台
 */
export function isCrossBorder(platform: Platform): boolean {
  return PLATFORM_CONFIGS[platform].region === 'cross-border';
}

/**
 * 获取平台默认语言
 */
export function getPlatformLanguage(platform: Platform): Language {
  return PLATFORM_CONFIGS[platform].language;
}
