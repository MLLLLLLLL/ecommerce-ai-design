'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { PLATFORM_LIST } from './platform-list';
import { useAsyncGeneration } from './use-async-generation';
import { TaskDetail } from './use-task-polling';
import { groupLanguagesByGroup } from '@/lib/marketing/languages';
import { getPlatformLanguage } from '@/lib/marketing/sop/platforms';
import type { ModelConfigSummary } from '@/types/model-config';
import type { GenerateTaskData } from '@/types/marketing-contract';

// ============================================
// 文案创作 Tab（V3 4.2）
// 字段：目标平台、输出语言、商品名称、商品图片、核心卖点、
// 目标关键词、品类、视觉模型、内容模型、输出类型。
// 图片 1-5 张、单张 10MB，先上传至 /api/marketing/upload 再提交 URL。
// Phase 6：提交后异步执行，轮询进度。
// ============================================

const DRAFT_KEY = 'marketing.copywriting.draft';
const CATEGORIES = ['3C数码', '美妆日化', '百货杯壶', '美食', '服饰', '老檀木文玩', '家具详情页', '家具主图', '海产品'];

interface CopywritingTabProps {
  models: ModelConfigSummary[];
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
  onResult: (data: GenerateTaskData) => void;
}

interface DraftShape {
  productName: string;
  sellPointsText: string;
  keywordsText: string;
  platform: string;
  language: string;
  languageOverridden: boolean;
  category: string;
  visionModelId: string;
  contentModelId: string;
  outputs: Record<string, boolean>;
}

function loadDraft(): Partial<DraftShape> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<DraftShape>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// sessionStorage 草稿的外部存储同步（useSyncExternalStore）
let draftSnapshot: Partial<DraftShape> = {};
const draftListeners = new Set<() => void>();

function subscribeDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

function getDraftSnapshot(): Partial<DraftShape> {
  return draftSnapshot;
}

function getServerDraftSnapshot(): Partial<DraftShape> {
  return {};
}

function refreshDraft(): void {
  draftSnapshot = loadDraft();
  for (const listener of draftListeners) listener();
}

export function CopywritingTab({ models, generating, onGeneratingChange, onProgress, onResult }: CopywritingTabProps) {
  const handleResult = useCallback(
    (data: GenerateTaskData) => {
      onResult(data);
    },
    [onResult]
  );
  const handleProgress = useCallback(
    (detail: TaskDetail | null) => {
      onProgress?.(detail);
    },
    [onProgress]
  );
  const { submit } = useAsyncGeneration({
    onResult: handleResult,
    onGeneratingChange,
    onProgress: handleProgress,
  });
  const savedDraft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getServerDraftSnapshot);

  const visionModels = useMemo(
    () =>
      models.filter(
        (item) => item.isActive && item.capabilities.vision && item.capabilities.jsonMode && !item.capabilities.imageGeneration
      ),
    [models]
  );
  const contentModels = useMemo(
    () => models.filter((item) => item.isActive && item.capabilities.jsonMode && !item.capabilities.imageGeneration),
    [models]
  );
  const defaultVisionModel = useMemo(
    () => visionModels.find((item) => item.isDefault) ?? visionModels[0],
    [visionModels]
  );
  const defaultContentModel = useMemo(
    () => contentModels.find((item) => item.isDefault) ?? contentModels[0],
    [contentModels]
  );

  // 用户编辑值优先；未编辑时回落到 sessionStorage 草稿。
  const [productName, setProductName] = useState<string | null>(null);
  const [sellPointsText, setSellPointsText] = useState<string | null>(null);
  const [keywordsText, setKeywordsText] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [languageOverridden, setLanguageOverridden] = useState<boolean | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [visionModelId, setVisionModelId] = useState<string | null>(null);
  const [contentModelId, setContentModelId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, boolean> | null>(null);

  const effectiveProductName = productName ?? savedDraft.productName ?? '';
  const effectiveSellPointsText = sellPointsText ?? savedDraft.sellPointsText ?? '';
  const effectiveKeywordsText = keywordsText ?? savedDraft.keywordsText ?? '';
  const effectivePlatform = platform ?? savedDraft.platform ?? 'taobao';
  const effectiveLanguage = language ?? savedDraft.language ?? getPlatformLanguage('taobao');
  const effectiveLanguageOverridden = languageOverridden ?? savedDraft.languageOverridden ?? false;
  const effectiveCategory = category ?? savedDraft.category ?? 'auto';
  const effectiveOutputs = useMemo(
    () =>
      outputs ??
      savedDraft.outputs ??
      ({ analysis: true, copywriting: true, mainPrompts: true, detailPrompts: true } as Record<string, boolean>),
    [outputs, savedDraft.outputs]
  );

  const [productImages, setProductImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const languageGroups = useMemo(() => groupLanguagesByGroup(), []);

  const effectiveVisionModelId =
    visionModelId ?? savedDraft.visionModelId ?? defaultVisionModel?.id ?? '';
  const effectiveContentModelId =
    contentModelId ?? savedDraft.contentModelId ?? defaultContentModel?.id ?? '';

  // 挂载后从 sessionStorage 读取草稿（更新外部 store，不直接 setState）
  useEffect(() => {
    refreshDraft();
  }, []);

  // 草稿持久化（sessionStorage，非敏感；图片 URL 不落草稿）
  useEffect(() => {
    try {
      const draftValue: DraftShape = {
        productName: effectiveProductName,
        sellPointsText: effectiveSellPointsText,
        keywordsText: effectiveKeywordsText,
        platform: effectivePlatform,
        language: effectiveLanguage,
        languageOverridden: effectiveLanguageOverridden,
        category: effectiveCategory,
        visionModelId: effectiveVisionModelId,
        contentModelId: effectiveContentModelId,
        outputs: effectiveOutputs,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftValue));
    } catch {
      // 忽略配额错误
    }
  }, [
    savedDraft,
    effectiveProductName,
    effectiveSellPointsText,
    effectiveKeywordsText,
    effectivePlatform,
    effectiveLanguage,
    effectiveLanguageOverridden,
    effectiveCategory,
    effectiveVisionModelId,
    effectiveContentModelId,
    effectiveOutputs,
  ]);

  const handlePlatformChange = useCallback(
    (value: string) => {
      setPlatform(value);
      if (!effectiveLanguageOverridden) {
        try {
          setLanguage(getPlatformLanguage(value as never));
        } catch {
          // 平台无默认语言时保持现状
        }
      }
    },
    [effectiveLanguageOverridden]
  );

  const handleLanguageChange = useCallback((value: string) => {
    setLanguage(value);
    setLanguageOverridden(true);
  }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    if (productImages.length + list.length > 5) {
      toast.error('最多上传 5 张产品图片');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) {
        form.append('files', file);
      }
      const response = await fetch('/api/marketing/upload', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '图片上传失败');
      }
      const urls: string[] = data.data.files.map((file: { url: string }) => file.url);
      setProductImages((current) => [...current, ...urls].slice(0, 5));
      toast.success(`已上传 ${urls.length} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!effectiveProductName.trim()) {
      toast.error('请输入商品名称');
      return;
    }
    if (productImages.length === 0) {
      toast.error('请至少上传 1 张产品图片');
      return;
    }
    if (!effectiveVisionModelId || !effectiveContentModelId) {
      toast.error('请选择视觉模型和内容模型');
      return;
    }
    const hasOutput = Object.values(effectiveOutputs).some(Boolean);
    if (!hasOutput) {
      toast.error('请至少选择一项输出内容');
      return;
    }

    const sellPoints = effectiveSellPointsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20);
    const keywords = effectiveKeywordsText
      .split(/[、,\n]/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 30);

    await submit({
      module: 'copywriting',
      schemaVersion: 1,
      input: {
        productName: effectiveProductName.trim(),
        productImages,
        category: effectiveCategory === 'auto' ? undefined : effectiveCategory,
        platform: effectivePlatform,
        language: effectiveLanguage,
        sellPoints,
        keywords,
        outputs: effectiveOutputs,
        modelSelection: {
          visionModelId: effectiveVisionModelId,
          contentModelId: effectiveContentModelId,
        },
      },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cw-product-name">
              商品名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cw-product-name"
              value={effectiveProductName}
              maxLength={300}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="例如：316 不锈钢智能保温杯 500ml"
            />
          </div>

          <div className="space-y-2">
            <Label>
              商品图片 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {productImages.length}/5 张，单张不超过 10MB（JPEG/PNG/WebP）
              </span>
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files)}
            />
            <div className="flex flex-wrap gap-3">
              {productImages.map((url, index) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`产品图 ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`删除产品图 ${index + 1}`}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    onClick={() => setProductImages((current) => current.filter((item) => item !== url))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {productImages.length < 5 && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  {uploading ? '上传中' : '上传图片'}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cw-sell-points">核心卖点（每行一条）</Label>
            <Textarea
              id="cw-sell-points"
              value={effectiveSellPointsText}
              onChange={(event) => setSellPointsText(event.target.value)}
              placeholder={'长效保温 12 小时\n食品级 316 不锈钢\n防漏设计'}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cw-keywords">目标关键词（顿号或逗号分隔）</Label>
            <Input
              id="cw-keywords"
              value={effectiveKeywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              placeholder="保温杯、不锈钢水杯、便携"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">平台与语言</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cw-platform">
              目标平台 <span className="text-red-500">*</span>
            </Label>
            <Select value={effectivePlatform} onValueChange={handlePlatformChange}>
              <SelectTrigger id="cw-platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>国内电商</SelectLabel>
                  {PLATFORM_LIST.filter((item) => item.region === 'domestic').map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>跨境电商</SelectLabel>
                  {PLATFORM_LIST.filter((item) => item.region === 'cross-border').map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cw-language">
              输出语言 <span className="text-red-500">*</span>
              {languageOverridden && (
                <span className="ml-2 text-xs text-muted-foreground">已手动选择，切换平台不再联动</span>
              )}
            </Label>
            <Select value={effectiveLanguage} onValueChange={handleLanguageChange}>
              <SelectTrigger id="cw-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {[...languageGroups.entries()].map(([group, options]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {options.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label}（{option.nativeLabel}）
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cw-category">品类（可选，AI 会自动识别）</Label>
            <Select value={effectiveCategory} onValueChange={setCategory}>
              <SelectTrigger id="cw-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动识别</SelectItem>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">模型与输出</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cw-vision-model">
              视觉模型 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">需支持视觉输入与 JSON 输出</span>
            </Label>
            <Select value={effectiveVisionModelId} onValueChange={setVisionModelId}>
              <SelectTrigger id="cw-vision-model">
                <SelectValue placeholder="选择视觉模型" />
              </SelectTrigger>
              <SelectContent>
                {visionModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}（{model.model}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cw-content-model">
              内容模型 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">需支持 JSON 输出</span>
            </Label>
            <Select value={effectiveContentModelId} onValueChange={setContentModelId}>
              <SelectTrigger id="cw-content-model">
                <SelectValue placeholder="选择内容模型" />
              </SelectTrigger>
              <SelectContent>
                {contentModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}（{model.model}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>输出类型</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  { key: 'analysis', label: '产品分析报告' },
                  { key: 'copywriting', label: '电商文案' },
                  { key: 'mainPrompts', label: '主图提示词' },
                  { key: 'detailPrompts', label: '详情页提示词' },
                ] as const
              ).map((item) => (
                <label key={item.key} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={effectiveOutputs[item.key] === true}
                    onCheckedChange={(checked) =>
                      setOutputs({ ...effectiveOutputs, [item.key]: checked === true })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              选择文案/主图/详情页任一输出时，将自动执行产品分析作为前置步骤。
            </p>
          </div>

          <Button
            className="w-full"
            onClick={() => void handleGenerate()}
            disabled={generating || uploading}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在生成，请稍候…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                开始生成
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
