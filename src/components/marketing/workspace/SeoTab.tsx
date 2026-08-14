'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2, Search } from 'lucide-react';
import { FactInput, FactDraftItem } from './FactInput';
import { useAsyncGeneration } from './use-async-generation';
import { TaskDetail } from './use-task-polling';
import { useSessionDraft, writeSessionDraft } from './use-session-draft';
import { groupLanguagesByGroup } from '@/lib/marketing/languages';
import { SEO_KEYWORDS_MAX, SEO_SOURCE_CONTENT_MAX_CHARS } from '@/lib/marketing/schemas';
import type { ModelConfigSummary } from '@/types/model-config';
import type { GenerateTaskData, MarketingFact, SeoResult } from '@/types/marketing-contract';

// ============================================
// SEO 优化 Tab（V3 9.2 / Phase 4）
// 输入：商品/页面主题、已有内容、关键词、品类、语言、已确认事实、内容模型。
// 输出为内容优化建议，明确不包含实时搜索量、排名与竞品数据。
// ============================================

const DRAFT_KEY = 'marketing.seo.draft';
const CATEGORIES = ['3C数码', '美妆日化', '百货杯壶', '美食', '服饰', '老檀木文玩', '家具详情页', '家具主图', '海产品'];

interface SeoTabProps {
  models: ModelConfigSummary[];
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
  onResult: (data: GenerateTaskData) => void;
}

export function SeoTab({ models, generating, onGeneratingChange, onProgress, onResult }: SeoTabProps) {
  const savedDraft = useSessionDraft<{
    productName?: string;
    sourceContent?: string;
    keywordsText?: string;
    category?: string;
    language?: string;
    facts?: FactDraftItem[];
    modelId?: string;
  }>(DRAFT_KEY);

  const contentModels = useMemo(
    () => models.filter((item) => item.isActive && item.capabilities.jsonMode && !item.capabilities.imageGeneration),
    [models]
  );
  const defaultContentModel = useMemo(
    () => contentModels.find((item) => item.isDefault) ?? contentModels[0],
    [contentModels]
  );
  const languageGroups = useMemo(() => groupLanguagesByGroup(), []);

  const [productName, setProductName] = useState<string | null>(null);
  const [sourceContent, setSourceContent] = useState<string | null>(null);
  const [keywordsText, setKeywordsText] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [facts, setFacts] = useState<FactDraftItem[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [result, setResult] = useState<SeoResult | null>(null);

  const handleResult = useCallback(
    (data: GenerateTaskData) => {
      setResult(data.result as SeoResult);
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

  const effectiveProductName = productName ?? (savedDraft.productName as string | undefined) ?? '';
  const effectiveSourceContent = sourceContent ?? (savedDraft.sourceContent as string | undefined) ?? '';
  const effectiveKeywordsText = keywordsText ?? (savedDraft.keywordsText as string | undefined) ?? '';
  const effectiveCategory = category ?? (savedDraft.category as string | undefined) ?? 'auto';
  const effectiveLanguage = language ?? (savedDraft.language as string | undefined) ?? 'zh-CN';
  const effectiveFacts = facts ?? (savedDraft.facts as FactDraftItem[] | undefined) ?? [];
  const effectiveModelId = modelId ?? (savedDraft.modelId as string | undefined) ?? defaultContentModel?.id ?? '';

  const persistDraft = (patch: Record<string, unknown>) => {
    writeSessionDraft(DRAFT_KEY, {
      productName: effectiveProductName,
      sourceContent: effectiveSourceContent,
      keywordsText: effectiveKeywordsText,
      category: effectiveCategory,
      language: effectiveLanguage,
      facts: effectiveFacts,
      modelId: effectiveModelId,
      ...patch,
    });
  };

  const handleGenerate = async () => {
    if (!effectiveProductName.trim()) {
      toast.error('请输入商品名称或页面主题');
      return;
    }
    const keywords = effectiveKeywordsText
      .split(/[、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, SEO_KEYWORDS_MAX);
    if (keywords.length === 0) {
      toast.error('请至少输入 1 个目标关键词');
      return;
    }
    if (!effectiveModelId) {
      toast.error('请选择内容模型');
      return;
    }

    const confirmedFacts: MarketingFact[] = effectiveFacts.map((fact) => ({
      key: fact.key,
      value: fact.value,
      status: 'confirmed',
      sourceType: 'user',
    }));

    await submit({
      module: 'seo',
      schemaVersion: 1,
      input: {
        productName: effectiveProductName.trim(),
        sourceContent: effectiveSourceContent.trim() || undefined,
        keywords,
        category: effectiveCategory === 'auto' ? undefined : effectiveCategory,
        language: effectiveLanguage,
        facts: confirmedFacts.length > 0 ? confirmedFacts : undefined,
        modelId: effectiveModelId,
      },
    });
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          本工具输出为内容优化建议，不提供实时搜索量、排名或竞品数据。未经证实的声明不会进入可发布正文，并会单独列入「待确认事实」。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">页面信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seo-product-name">
              商品名称/页面主题 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="seo-product-name"
              value={effectiveProductName}
              maxLength={300}
              onChange={(event) => {
                setProductName(event.target.value);
                persistDraft({ productName: event.target.value });
              }}
              placeholder="例如：316 不锈钢智能保温杯 500ml"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seo-source-content">
              已有内容（可选）
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveSourceContent.length}/{SEO_SOURCE_CONTENT_MAX_CHARS} 字
              </span>
            </Label>
            <Textarea
              id="seo-source-content"
              value={effectiveSourceContent}
              maxLength={SEO_SOURCE_CONTENT_MAX_CHARS}
              onChange={(event) => {
                setSourceContent(event.target.value);
                persistDraft({ sourceContent: event.target.value });
              }}
              placeholder="粘贴现有商品描述或详情页内容，将基于此优化…"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seo-keywords">
              目标关键词 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">顿号或逗号分隔，最多 {SEO_KEYWORDS_MAX} 个</span>
            </Label>
            <Input
              id="seo-keywords"
              value={effectiveKeywordsText}
              onChange={(event) => {
                setKeywordsText(event.target.value);
                persistDraft({ keywordsText: event.target.value });
              }}
              placeholder="保温杯、不锈钢水杯、便携水杯"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="seo-category">品类（可选）</Label>
              <Select
                value={effectiveCategory}
                onValueChange={(value) => {
                  setCategory(value);
                  persistDraft({ category: value });
                }}
              >
                <SelectTrigger id="seo-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">不指定</SelectItem>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seo-language">
                输出语言 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={effectiveLanguage}
                onValueChange={(value) => {
                  setLanguage(value);
                  persistDraft({ language: value });
                }}
              >
                <SelectTrigger id="seo-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {[...languageGroups.entries()].map(([group, options]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {options.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">已确认事实（可选）</CardTitle>
        </CardHeader>
        <CardContent>
          <FactInput
            facts={effectiveFacts}
            labelPrefix="SEO "
            onChange={(next) => {
              setFacts(next);
              persistDraft({ facts: next });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">模型与执行</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seo-model">
              内容模型 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveModelId}
              onValueChange={(value) => {
                setModelId(value);
                persistDraft({ modelId: value });
              }}
            >
              <SelectTrigger id="seo-model">
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

          <Button className="w-full" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在生成 SEO 建议…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                生成 SEO 优化建议
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && <SeoResultView result={result} />}
    </div>
  );
}

function SeoResultView({ result }: { result: SeoResult }) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">页面标题与 Meta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">标题：</span>
            {result.pageTitle.title}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Meta 描述：</span>
            {result.pageTitle.metaDescription}
          </p>
          <p className="text-xs text-muted-foreground">Slug：{result.pageTitle.slug}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">关键词意图</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {result.keywordIntent.map((item, index) => (
            <p key={index}>
              <span className="font-medium">{item.keyword}</span>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{item.intent}</span>
              <span className="ml-2 text-muted-foreground">{item.explanation}</span>
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">标题结构</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p className="font-medium">H1：{result.headingStructure.h1}</p>
          {result.headingStructure.h2.map((h2, index) => (
            <p key={index} className="text-muted-foreground">
              H2：{h2}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">正文</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="whitespace-pre-wrap">{result.bodyContent}</p>
        </CardContent>
      </Card>

      {result.faq.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">FAQ（{result.faq.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {result.faq.map((item, index) => (
              <div key={index}>
                <p className="font-medium">Q：{item.question}</p>
                <p className="text-muted-foreground">A：{item.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.imageAlt.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">图片 Alt 建议</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {result.imageAlt.map((item, index) => (
              <p key={index}>
                <span className="font-medium">{item.image}：</span>
                <span className="text-muted-foreground">{item.alt}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {result.internalLinks.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">内链建议</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {result.internalLinks.map((item, index) => (
              <p key={index}>
                <span className="font-medium">[{item.anchorText}]</span>
                <span className="ml-2 text-muted-foreground">
                  → {item.target}（{item.reason}）
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {Object.keys(result.jsonLd).length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">JSON-LD 结构化数据</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(result.jsonLd, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {result.pendingFacts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-amber-700 dark:text-amber-300">
              待确认事实（{result.pendingFacts.length}，未进入可发布正文）
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-700 dark:text-amber-300">
            <ul className="list-inside list-disc">
              {result.pendingFacts.map((fact, index) => (
                <li key={index}>
                  {fact.key}：{fact.value}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
