'use client';

import { Platform, Language, Category } from '@/types/marketing';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PlatformSelectorProps {
  platform: Platform;
  language: Language;
  category?: Category;
  onPlatformChange: (platform: Platform) => void;
  onLanguageChange: (language: Language) => void;
  onCategoryChange: (category: Category | undefined) => void;
}

const PLATFORMS: { value: Platform; label: string; region: string }[] = [
  { value: 'taobao', label: '淘宝/天猫', region: '国内' },
  { value: 'jd', label: '京东', region: '国内' },
  { value: 'pdd', label: '拼多多', region: '国内' },
  { value: 'douyin', label: '抖音小店', region: '国内' },
  { value: 'kuaishou', label: '快手小店', region: '国内' },
  { value: 'xiaohongshu', label: '小红书', region: '国内' },
  { value: '1688', label: '1688', region: '国内' },
  { value: 'temu', label: 'Temu', region: '跨境' },
  { value: 'shein', label: 'SHEIN', region: '跨境' },
  { value: 'aliexpress', label: '速卖通', region: '跨境' },
  { value: 'wish', label: 'Wish', region: '跨境' },
  { value: 'amazon', label: 'Amazon', region: '跨境' },
  { value: 'ozon', label: 'OZON', region: '跨境' },
  { value: 'ebay', label: 'eBay', region: '跨境' },
  { value: 'walmart', label: 'Walmart', region: '跨境' },
  { value: 'shopee', label: 'Shopee', region: '跨境' },
  { value: 'lazada', label: 'Lazada', region: '跨境' },
  { value: 'tiktok', label: 'TikTok Shop', region: '跨境' },
  { value: 'shopify', label: 'Shopify', region: '跨境' },
  { value: 'independent', label: '独立站', region: '跨境' },
];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: '3C数码', label: '3C数码' },
  { value: '美妆日化', label: '美妆日化' },
  { value: '百货杯壶', label: '百货杯壶' },
  { value: '美食', label: '美食' },
  { value: '服饰', label: '服饰' },
  { value: '老檀木文玩', label: '老檀木文玩' },
  { value: '家具详情页', label: '家具详情页' },
  { value: '家具主图', label: '家具主图' },
  { value: '海产品', label: '海产品' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'ru-RU', label: 'Русский' },
];

export function PlatformSelector({
  platform,
  language,
  category,
  onPlatformChange,
  onLanguageChange,
  onCategoryChange,
}: PlatformSelectorProps) {
  const domesticPlatforms = PLATFORMS.filter((p) => p.region === '国内');
  const crossBorderPlatforms = PLATFORMS.filter((p) => p.region === '跨境');

  return (
    <div className="space-y-6">
      {/* 目标平台 */}
      <div className="space-y-4">
        <Label>
          目标平台 <span className="text-red-500">*</span>
        </Label>

        {/* 国内平台 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600">国内电商</p>
          <div className="grid grid-cols-4 gap-2">
            {domesticPlatforms.map((p) => (
              <Button
                key={p.value}
                variant={platform === p.value ? 'default' : 'outline'}
                onClick={() => onPlatformChange(p.value)}
                className="justify-start"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 跨境平台 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600">跨境电商</p>
          <div className="grid grid-cols-4 gap-2">
            {crossBorderPlatforms.map((p) => (
              <Button
                key={p.value}
                variant={platform === p.value ? 'default' : 'outline'}
                onClick={() => onPlatformChange(p.value)}
                className="justify-start"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* 输出语言 */}
      <div className="space-y-2">
        <Label htmlFor="language">
          输出语言 <span className="text-red-500">*</span>
        </Label>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger id="language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 品类（可选） */}
      <div className="space-y-2">
        <Label htmlFor="category">
          品类
          <span className="text-sm text-muted-foreground ml-2">
            （可选，AI会自动识别）
          </span>
        </Label>
        <Select
          value={category || 'auto'}
          onValueChange={(value) =>
            onCategoryChange(value === 'auto' ? undefined : (value as Category))
          }
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动识别</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 平台规则提示 */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm font-medium text-blue-900 mb-2">
          平台规则提示
        </p>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• {getPlatformRule(platform)}</li>
          <li>• 生成的内容将自动适配平台合规要求</li>
          <li>• 跨境平台将自动过滤敏感词（如Best/No.1等）</li>
        </ul>
      </Card>
    </div>
  );
}

function getPlatformRule(platform: Platform): string {
  const rules: Record<Platform, string> = {
    taobao: '淘宝/天猫：首图白底、无文字、无道具',
    jd: '京东：白底、产品占比85%以上',
    pdd: '拼多多：白底或浅色底，简洁清晰',
    douyin: '抖音小店：生活化场景优先，吸引眼球',
    kuaishou: '快手小店：真实场景，接地气',
    xiaohongshu: '小红书：美学优先，生活方式',
    '1688': '1688：B2B规格图，参数清晰',
    temu: 'Temu：白底或简洁背景，英文简短',
    shein: 'SHEIN：时尚大片风格',
    aliexpress: '速卖通：白底或场景图，国际化表达',
    wish: 'Wish：产品清晰，吸引眼球',
    amazon: 'Amazon：纯白底、产品占85%以上、无文字无水印',
    ozon: 'OZON：白底清晰',
    ebay: 'eBay：清晰产品图',
    walmart: 'Walmart：白底或浅色底',
    shopee: 'Shopee：吸引眼球，促销感',
    lazada: 'Lazada：清晰产品图',
    tiktok: 'TikTok Shop：视频首帧吸引眼球',
    shopify: 'Shopify：品牌化、高质感',
    independent: '独立站：品牌定制，高级感',
  };
  return rules[platform] || '请遵循平台规则';
}
