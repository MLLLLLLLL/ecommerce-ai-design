import { Category, CategoryConfig } from '@/types/marketing';

/**
 * 品类配置库
 * 基于31份SOP文档提取的品类规则
 */
export const CATEGORY_CONFIGS: Record<Category, CategoryConfig> = {
  '3C数码': {
    name: '3C数码',
    sopReference: '05-1',
    visualLanguage: [
      '科技感',
      '参数网格',
      '界面元素',
      '设备联动',
      '能量流',
      '信号线',
      '芯片式信息卡',
      '波纹光束',
    ],
    forbiddenClaims: [
      '蓝牙版本',
      '续航时长',
      '功率',
      '容量',
      '协议标准',
      '认证信息',
    ],
    complianceRedline: '禁止编造技术参数、认证标准',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '美妆日化': {
    name: '美妆日化',
    sopReference: '05-2',
    visualLanguage: [
      '高定静物',
      '柔光',
      '玻璃/金属/丝绒质感',
      '水波/花瓣/缎面',
      '质地演示',
      '雾面/水润效果',
    ],
    forbiddenClaims: [
      '成分含量',
      '香调配方',
      '功效数据',
      '容量规格',
      '色号',
      '认证标准',
    ],
    complianceRedline: '禁止把普通产品写成医疗功效型产品，禁止过度医疗化表达',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '百货杯壶': {
    name: '百货杯壶',
    sopReference: '05-3',
    visualLanguage: [
      '生活方式',
      '桌面场景',
      '通勤/居家温暖感',
      '容量感',
      '材质质感',
      '收纳关系',
    ],
    forbiddenClaims: [
      '容量规格',
      '保温时长',
      '密封性能',
      '食品级标准',
    ],
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '美食': {
    name: '美食',
    sopReference: '05-4',
    visualLanguage: [
      '食欲感',
      '酥脆感/流动感',
      '分享场景',
      '陪体食材',
      '热气/饱腹感',
      '杯中状态',
    ],
    forbiddenClaims: [
      '具体口味',
      '食材成分',
      '果肉/谷物/肉类含量',
      '保健功效',
      '营养数据',
    ],
    complianceRedline: '禁止把普通食品写成功能性保健产品；包装不透明时不能擅自具象化内容物',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '服饰': {
    name: '服饰',
    sopReference: '05-5',
    visualLanguage: [
      '版型展示',
      '面料垂坠感',
      '上身氛围',
      '鞋型/包型',
      '五金细节',
      '极简高级/通勤都市/潮流街头',
    ],
    forbiddenClaims: [
      '面料成分',
      '克重',
      '尺码规格',
      '真皮真丝羊毛比例',
    ],
    complianceRedline: '版型锁定是最大难点——宽松不能做修身、直筒不能做紧身',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '老檀木文玩': {
    name: '老檀木文玩',
    sopReference: '05-6',
    visualLanguage: [
      '东方禅意',
      '新中式',
      '宣纸/原木/亚麻',
      '石材/茶席',
      '克制配色',
      '深木色/棕褐/暖米白',
    ],
    forbiddenClaims: [
      '材质等级',
      '老料年份',
      '产地',
      '稀缺性',
      '颗数/珠径',
      '燃烧时长',
    ],
    complianceRedline: '禁止写成疗愈、宗教开光、收藏升值或功效型产品；弱化寺庙、法器、宗教图腾',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 8,
    },
  },

  '家具详情页': {
    name: '家具详情页',
    sopReference: '05-7',
    visualLanguage: [
      '空间感',
      '尺度感',
      '材质样板',
      '尺寸标注线',
      '结构拆解',
      '搭配建议',
    ],
    forbiddenClaims: [
      '尺寸规格',
      '承重数据',
      '环保等级',
      '木材种类',
      '皮革等级',
      '五金品牌',
    ],
    complianceRedline: '禁止"全网最低""销量第一""0甲醛""100%环保""永久不坏"等广告法敏感词',
    mainImageCount: {
      standard: 0, // 家具详情页不做主图
      optional: 0,
    },
    detailPageCount: {
      min: 8,
      max: 10,
    },
  },

  '家具主图': {
    name: '家具主图',
    sopReference: '05-8',
    visualLanguage: [
      '纯视觉',
      '无文字',
      '高级场景',
      '完整空间',
      '材质质感',
      '尺度关系',
    ],
    forbiddenClaims: [],
    complianceRedline: '禁止任何中文/英文/数字/Logo/价格/促销词/标题/卖点标签/参数卡',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 0,
      max: 0,
    },
  },

  '海产品': {
    name: '海产品',
    sopReference: '05-9',
    visualLanguage: [
      '鲜活：清澈水感/浅海蓝绿',
      '冷冻：冰面冷雾/低温蓝白光',
      '干货：米白木色/干燥纹理',
      '熟制：餐桌/开袋即食',
      '礼盒：外盒内托/节日餐桌',
    ],
    forbiddenClaims: [
      '产地',
      '野生/养殖',
      '进口信息',
      '捕捞方式',
      '等级',
      '净含量',
      '检测认证',
      '冷链时效',
      '保质期',
      '价格',
      '销量',
      '售后承诺',
    ],
    complianceRedline: '合规最严——禁止"最鲜""第一""顶级""100%无添加""医学滋补""永久保鲜"',
    mainImageCount: {
      standard: 6,
      optional: 2,
    },
    detailPageCount: {
      min: 6,
      max: 10,
    },
  },
};

/**
 * 根据产品描述自动推断品类
 */
export function inferCategory(productName: string, appearance: string): Category {
  const text = `${productName} ${appearance}`.toLowerCase();

  // 品类关键词匹配
  const categoryKeywords: Record<Category, string[]> = {
    '3C数码': ['耳机', '音箱', '充电', '数据线', '充电宝', '鼠标', '键盘', 'u盘', '硬盘', '蓝牙', '电子'],
    '美妆日化': ['口红', '粉底', '香水', '精华', '面霜', '面膜', '洗发', '沐浴', '护肤', '化妆'],
    '百货杯壶': ['保温杯', '水杯', '水壶', '饭盒', '餐盒', '杯子', '壶'],
    '美食': ['零食', '饮料', '冲调', '咖啡', '茶', '速食', '熟食', '烘焙', '食品', '吃'],
    '服饰': ['衣服', '裤子', '裙子', '外套', '鞋', '包', '帽子', '围巾', '服装', '穿'],
    '老檀木文玩': ['手串', '串珠', '佛珠', '念珠', '线香', '卧香', '香插', '檀木', '文玩'],
    '家具详情页': ['沙发', '床', '床垫', '餐桌', '茶几', '电视柜', '书桌', '椅子', '衣柜', '鞋柜', '家具'],
    '家具主图': [], // 需要结合上下文判断
    '海产品': ['虾', '蟹', '贝', '鱼', '海参', '鲍鱼', '干贝', '海鲜', '海产', '水产'],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category as Category;
    }
  }

  // 默认返回百货杯壶
  return '百货杯壶';
}
