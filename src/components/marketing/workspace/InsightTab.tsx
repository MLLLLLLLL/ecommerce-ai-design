'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Globe, Loader2, Settings2 } from 'lucide-react';
import { FactInput, FactDraftItem } from './FactInput';
import { useAsyncGeneration } from './use-async-generation';
import { TaskDetail } from './use-task-polling';
import { useSessionDraft, writeSessionDraft } from './use-session-draft';
import { groupLanguagesByGroup } from '@/lib/marketing/languages';
import type { ModelConfigSummary } from '@/types/model-config';
import type {
  GenerateTaskData,
  InsightResult,
  InsightType,
  MarketingFact,
} from '@/types/marketing-contract';
import { INSIGHT_TYPE_LABELS } from '@/types/marketing-contract';

// ============================================
// 市场洞察 Tab（V3 Phase 7 / ADR-0001）
// 强制需要联网搜索服务：未配置或未实测通过时展示未配置状态，
// 生成按钮不可用（API 同样拒绝 SEARCH_NOT_CONFIGURED）。
// 四种洞察：竞品分析 / 趋势洞察 / 用户需求分析 / 价格与定位分析。
// ============================================

const DRAFT_KEY = 'marketing.insight.draft';
const CATEGORIES = ['3C数码', '美妆日化', '百货杯壶', '美食', '服饰', '老檀木文玩', '家具详情页', '家具主图', '海产品'];

interface InsightTabProps {
  models: ModelConfigSummary[];
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
  onResult: (data: GenerateTaskData) => void;
}

interface SearchServiceSummary {
  id: string;
  name: string;
  provider: string;
  testStatus: string | null;
  maxQueriesPerTask: number;
}

export function InsightTab({ models, generating, onGeneratingChange, onProgress, onResult }: InsightTabProps) {
  const router = useRouter();
  const [services, setServices] = useState<SearchServiceSummary[] | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const response = await fetch('/api/search-services');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('读取搜索服务失败');
      setServices(data.data.services as SearchServiceSummary[]);
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadServices(), 0);
    return () => clearTimeout(timer);
  }, [loadServices]);

  const activeService = useMemo(
    () => (services ?? []).find((service) => service.testStatus === 'passed') ?? null,
    [services]
  );

  const savedDraft = useSessionDraft<{
    type?: string;
    productName?: string;
    category?: string;
    market?: string;
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

  const [type, setType] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [facts, setFacts] = useState<FactDraftItem[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [result, setResult] = useState<InsightResult | null>(null);

  const effectiveType = (type ?? (savedDraft.type as string | undefined) ?? 'competitor') as InsightType;
  const effectiveProductName = productName ?? (savedDraft.productName as string | undefined) ?? '';
  const effectiveCategory = category ?? (savedDraft.category as string | undefined) ?? 'auto';
  const effectiveMarket = market ?? (savedDraft.market as string | undefined) ?? '';
  const effectiveLanguage = language ?? (savedDraft.language as string | undefined) ?? 'zh-CN';
  const effectiveFacts = facts ?? (savedDraft.facts as FactDraftItem[] | undefined) ?? [];
  const effectiveModelId = modelId ?? (savedDraft.modelId as string | undefined) ?? defaultContentModel?.id ?? '';

  const persistDraft = (patch: Record<string, unknown>) => {
    writeSessionDraft(DRAFT_KEY, {
      type: effectiveType,
      productName: effectiveProductName,
      category: effectiveCategory,
      market: effectiveMarket,
      language: effectiveLanguage,
      facts: effectiveFacts,
      modelId: effectiveModelId,
      ...patch,
    });
  };

  const handleResult = useCallback(
    (data: GenerateTaskData) => {
      setResult(data.result as InsightResult);
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

  const handleGenerate = async () => {
    if (!activeService) {
      toast.error('请先在设置中配置并实测通过搜索服务');
      return;
    }
    if (!effectiveProductName.trim()) {
      toast.error('请输入商品名称或品类');
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
      module: 'insight',
      schemaVersion: 1,
      input: {
        type: effectiveType,
        productName: effectiveProductName.trim(),
        category: effectiveCategory === 'auto' ? undefined : effectiveCategory,
        market: effectiveMarket.trim() || undefined,
        language: effectiveLanguage,
        facts: confirmedFacts.length > 0 ? confirmedFacts : undefined,
        modelId: effectiveModelId,
      },
    });
  };

  if (services !== null && !activeService) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <Settings2 className="h-4 w-4" />
          <AlertDescription>
            市场洞察需要联网搜索服务。请先在「设置 → 搜索服务」中配置搜索 API（Tavily/Serper/自定义）并通过实测，
            然后回到本页使用。未配置前生成按钮不可用。
          </AlertDescription>
        </Alert>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Globe className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">尚未配置可用的搜索服务</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
              前往设置
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertDescription>
          联网洞察：每条外部结论附带来源链接与检索时间；内容可能过时，不构成专业建议。单次任务最多 {activeService?.maxQueriesPerTask ?? 12} 次搜索查询。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">洞察类型</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(INSIGHT_TYPE_LABELS) as InsightType[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md border p-3 text-left text-sm transition-colors ${effectiveType === item ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-muted'}`}
                onClick={() => {
                  setType(item);
                  persistDraft({ type: item });
                }}
              >
                {INSIGHT_TYPE_LABELS[item]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">洞察目标</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="insight-product">
              商品/品类 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="insight-product"
              value={effectiveProductName}
              maxLength={300}
              onChange={(event) => {
                setProductName(event.target.value);
                persistDraft({ productName: event.target.value });
              }}
              placeholder="例如：智能保温杯"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="insight-category">品类（可选）</Label>
              <Select
                value={effectiveCategory}
                onValueChange={(value) => {
                  setCategory(value);
                  persistDraft({ category: value });
                }}
              >
                <SelectTrigger id="insight-category">
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
              <Label htmlFor="insight-market">目标市场（可选）</Label>
              <Input
                id="insight-market"
                value={effectiveMarket}
                maxLength={100}
                onChange={(event) => {
                  setMarket(event.target.value);
                  persistDraft({ market: event.target.value });
                }}
                placeholder="例如：中国 / 美国 / 亚马逊"
              />
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
            labelPrefix="洞察 "
            onChange={(next) => {
              setFacts(next);
              persistDraft({ facts: next });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">语言与模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="insight-language">
              输出语言 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveLanguage}
              onValueChange={(value) => {
                setLanguage(value);
                persistDraft({ language: value });
              }}
            >
              <SelectTrigger id="insight-language">
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

          <div className="space-y-2">
            <Label htmlFor="insight-model">
              内容模型 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveModelId}
              onValueChange={(value) => {
                setModelId(value);
                persistDraft({ modelId: value });
              }}
            >
              <SelectTrigger id="insight-model">
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
                正在联网检索并生成报告…
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" />
                开始洞察（联网检索）
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && <InsightResultInline result={result} />}
    </div>
  );
}

function InsightResultInline({ result }: { result: InsightResult }) {
  return (
    <div className="space-y-3">
      {result.degraded && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            未能获取完整联网信息（部分查询失败或配额用尽），报告可能不完整。
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">执行摘要</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{result.summary}</p>
        </CardContent>
      </Card>

      {result.sections.map((section, index) => (
        <Card key={index}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="whitespace-pre-wrap">{section.content}</p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">关键发现</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="list-inside list-disc">
            {result.keyFindings.map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {result.sources.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">来源（{result.sources.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {result.sources.map((source, index) => (
              <p key={index} className="truncate">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {source.title}
                </a>
              </p>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              检索时间：{new Date(result.retrievedAt).toLocaleString()}。以上信息来自联网搜索，内容可能过时；本报告不构成专业建议。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
