// 平台列表（与旧向导 PlatformSelector 保持一致）

export interface PlatformListItem {
  value: string;
  label: string;
  region: 'domestic' | 'cross-border';
}

export const PLATFORM_LIST: PlatformListItem[] = [
  { value: 'taobao', label: '淘宝/天猫', region: 'domestic' },
  { value: 'jd', label: '京东', region: 'domestic' },
  { value: 'pdd', label: '拼多多', region: 'domestic' },
  { value: 'douyin', label: '抖音小店', region: 'domestic' },
  { value: 'kuaishou', label: '快手小店', region: 'domestic' },
  { value: 'xiaohongshu', label: '小红书', region: 'domestic' },
  { value: '1688', label: '1688', region: 'domestic' },
  { value: 'temu', label: 'Temu', region: 'cross-border' },
  { value: 'shein', label: 'SHEIN', region: 'cross-border' },
  { value: 'aliexpress', label: '速卖通', region: 'cross-border' },
  { value: 'wish', label: 'Wish', region: 'cross-border' },
  { value: 'amazon', label: 'Amazon', region: 'cross-border' },
  { value: 'ozon', label: 'OZON', region: 'cross-border' },
  { value: 'ebay', label: 'eBay', region: 'cross-border' },
  { value: 'walmart', label: 'Walmart', region: 'cross-border' },
  { value: 'shopee', label: 'Shopee', region: 'cross-border' },
  { value: 'lazada', label: 'Lazada', region: 'cross-border' },
  { value: 'tiktok', label: 'TikTok Shop', region: 'cross-border' },
  { value: 'shopify', label: 'Shopify', region: 'cross-border' },
  { value: 'independent', label: '独立站', region: 'cross-border' },
];
