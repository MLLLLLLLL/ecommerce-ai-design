// ============================================
// 营销模块语言集中配置（V3 4.4）
// 第一期固定 30 种；文案/SEO/GEO 为单语言，翻译为多语言。
// ============================================

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  group: '东亚' | '东南亚' | '欧洲' | '美洲' | '中东' | '其他';
}

export const MARKETING_LANGUAGES: LanguageOption[] = [
  { code: 'zh-CN', label: '简体中文', nativeLabel: '简体中文', group: '东亚' },
  { code: 'zh-TW', label: '繁体中文', nativeLabel: '繁體中文', group: '东亚' },
  { code: 'ja-JP', label: '日语', nativeLabel: '日本語', group: '东亚' },
  { code: 'ko-KR', label: '韩语', nativeLabel: '한국어', group: '东亚' },

  { code: 'th-TH', label: '泰语', nativeLabel: 'ไทย', group: '东南亚' },
  { code: 'vi-VN', label: '越南语', nativeLabel: 'Tiếng Việt', group: '东南亚' },
  { code: 'id-ID', label: '印尼语', nativeLabel: 'Bahasa Indonesia', group: '东南亚' },
  { code: 'ms-MY', label: '马来语', nativeLabel: 'Bahasa Melayu', group: '东南亚' },
  { code: 'hi-IN', label: '印地语', nativeLabel: 'हिन्दी', group: '东南亚' },

  { code: 'en-US', label: '英语（美国）', nativeLabel: 'English (US)', group: '美洲' },
  { code: 'en-GB', label: '英语（英国）', nativeLabel: 'English (UK)', group: '欧洲' },
  { code: 'es-ES', label: '西班牙语', nativeLabel: 'Español', group: '欧洲' },
  { code: 'fr-FR', label: '法语', nativeLabel: 'Français', group: '欧洲' },
  { code: 'de-DE', label: '德语', nativeLabel: 'Deutsch', group: '欧洲' },
  { code: 'it-IT', label: '意大利语', nativeLabel: 'Italiano', group: '欧洲' },
  { code: 'pt-PT', label: '葡萄牙语', nativeLabel: 'Português', group: '欧洲' },
  { code: 'pt-BR', label: '葡萄牙语（巴西）', nativeLabel: 'Português (BR)', group: '美洲' },
  { code: 'ru-RU', label: '俄语', nativeLabel: 'Русский', group: '欧洲' },
  { code: 'nl-NL', label: '荷兰语', nativeLabel: 'Nederlands', group: '欧洲' },
  { code: 'pl-PL', label: '波兰语', nativeLabel: 'Polski', group: '欧洲' },
  { code: 'sv-SE', label: '瑞典语', nativeLabel: 'Svenska', group: '欧洲' },
  { code: 'da-DK', label: '丹麦语', nativeLabel: 'Dansk', group: '欧洲' },
  { code: 'no-NO', label: '挪威语', nativeLabel: 'Norsk', group: '欧洲' },
  { code: 'fi-FI', label: '芬兰语', nativeLabel: 'Suomi', group: '欧洲' },
  { code: 'cs-CZ', label: '捷克语', nativeLabel: 'Čeština', group: '欧洲' },
  { code: 'el-GR', label: '希腊语', nativeLabel: 'Ελληνικά', group: '欧洲' },
  { code: 'uk-UA', label: '乌克兰语', nativeLabel: 'Українська', group: '欧洲' },
  { code: 'tr-TR', label: '土耳其语', nativeLabel: 'Türkçe', group: '中东' },

  { code: 'ar-SA', label: '阿拉伯语', nativeLabel: 'العربية', group: '中东' },
  { code: 'he-IL', label: '希伯来语', nativeLabel: 'עברית', group: '中东' },
];

export function getLanguageOption(code: string): LanguageOption | undefined {
  return MARKETING_LANGUAGES.find((item) => item.code === code);
}

export function groupLanguagesByGroup(): Map<string, LanguageOption[]> {
  const map = new Map<string, LanguageOption[]>();
  for (const option of MARKETING_LANGUAGES) {
    const list = map.get(option.group) ?? [];
    list.push(option);
    map.set(option.group, list);
  }
  return map;
}
