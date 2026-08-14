'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { CloudOff, Loader2, Sparkles } from 'lucide-react';
import { FactInput, FactDraftItem } from './FactInput';
import { useAsyncGeneration } from './use-async-generation';
import { TaskDetail } from './use-task-polling';
import { useSessionDraft, writeSessionDraft } from './use-session-draft';
import { groupLanguagesByGroup } from '@/lib/marketing/languages';
import { GEO_QUESTION_MAX_CHARS, GEO_SOURCE_CONTENT_MAX_CHARS } from '@/lib/marketing/schemas';
import type { ModelConfigSummary } from '@/types/model-config';
import type { GenerateTaskData, GeoResult, MarketingFact } from '@/types/marketing-contract';

// ============================================
// GEO 优化 Tab（V3 9.3 离线版 / Phase 5）
// 输入：用户问题、品牌/产品名、已有内容、关键词、语言、已确认事实、内容模型。
// 结果顶部固定显示"本结果未联网核实"声明；不生成来源列表、
// 引用编号、已核实标识或实时性文案。
// ============================================

const DRAFT_KEY = 'marketing.geo.draft';

interface GeoTabProps {
  models: ModelConfigSummary[];
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
  onResult: (data: GenerateTaskData) => void;
}

export function GeoTab({ models, generating, onGeneratingChange, onProgress, onResult }: GeoTabProps) {
  const savedDraft = useSessionDraft<{
    question?: string;
    brandName?: string;
    sourceContent?: string;
    keywordsText?: string;
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

  const [question, setQuestion] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [sourceContent, setSourceContent] = useState<string | null>(null);
  const [keywordsText, setKeywordsText] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [enableSearch, setEnableSearch] = useState(false);
  const [facts, setFacts] = useState<FactDraftItem[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [result, setResult] = useState<GeoResult | null>(null);

  const handleResult = useCallback(
    (data: GenerateTaskData) => {
      setResult(data.result as GeoResult);
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

  const effectiveQuestion = question ?? (savedDraft.question as string | undefined) ?? '';
  const effectiveBrandName = brandName ?? (savedDraft.brandName as string | undefined) ?? '';
  const effectiveSourceContent = sourceContent ?? (savedDraft.sourceContent as string | undefined) ?? '';
  const effectiveKeywordsText = keywordsText ?? (savedDraft.keywordsText as string | undefined) ?? '';
  const effectiveLanguage = language ?? (savedDraft.language as string | undefined) ?? 'zh-CN';
  const effectiveFacts = facts ?? (savedDraft.facts as FactDraftItem[] | undefined) ?? [];
  const effectiveModelId = modelId ?? (savedDraft.modelId as string | undefined) ?? defaultContentModel?.id ?? '';

  const persistDraft = (patch: Record<string, unknown>) => {
    writeSessionDraft(DRAFT_KEY, {
      question: effectiveQuestion,
      brandName: effectiveBrandName,
      sourceContent: effectiveSourceContent,
      keywordsText: effectiveKeywordsText,
      language: effectiveLanguage,
      facts: effectiveFacts,
      modelId: effectiveModelId,
      ...patch,
    });
  };

  const handleGenerate = async () => {
    if (!effectiveQuestion.trim()) {
      toast.error('请输入目标用户问题');
      return;
    }
    if (!effectiveBrandName.trim()) {
      toast.error('请输入品牌或产品名称');
      return;
    }
    if (!effectiveModelId) {
      toast.error('请选择内容模型');
      return;
    }

    const keywords = effectiveKeywordsText
      .split(/[、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);

    const confirmedFacts: MarketingFact[] = effectiveFacts.map((fact) => ({
      key: fact.key,
      value: fact.value,
      status: 'confirmed',
      sourceType: 'user',
    }));

    await submit({
      module: 'geo',
      schemaVersion: 1,
      input: {
        question: effectiveQuestion.trim(),
        brandName: effectiveBrandName.trim(),
        sourceContent: effectiveSourceContent.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        language: effectiveLanguage,
        facts: confirmedFacts.length > 0 ? confirmedFacts : undefined,
        modelId: effectiveModelId,
        enableSearch: enableSearch,
      },
    });
  };

  return (
    <div className="space-y-4">
      <Alert>
        <CloudOff className="h-4 w-4" />
        <AlertDescription>
          {enableSearch
            ? '联网核实已开启：将基于搜索服务返回的来源生成内容，外部结论附来源链接与检索时间；内容可能过时。'
            : '离线版 GEO：仅基于您提供的已确认事实与内容生成，不联网检索。结果不会包含来源列表、引用编号或实时性数据。'}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">目标问题与品牌</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={enableSearch} onCheckedChange={(checked) => setEnableSearch(checked === true)} />
            联网核实（需已配置并实测通过的搜索服务）
          </label>
          <div className="space-y-2">
            <Label htmlFor="geo-question">
              目标用户问题 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveQuestion.length}/{GEO_QUESTION_MAX_CHARS} 字
              </span>
            </Label>
            <Input
              id="geo-question"
              value={effectiveQuestion}
              maxLength={GEO_QUESTION_MAX_CHARS}
              onChange={(event) => {
                setQuestion(event.target.value);
                persistDraft({ question: event.target.value });
              }}
              placeholder="例如：什么保温杯保温效果好且安全？"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geo-brand">
              品牌/产品名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="geo-brand"
              value={effectiveBrandName}
              maxLength={300}
              onChange={(event) => {
                setBrandName(event.target.value);
                persistDraft({ brandName: event.target.value });
              }}
              placeholder="例如：XX 品牌 316 不锈钢智能保温杯"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geo-source-content">
              已有内容（可选）
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveSourceContent.length}/{GEO_SOURCE_CONTENT_MAX_CHARS} 字
              </span>
            </Label>
            <Textarea
              id="geo-source-content"
              value={effectiveSourceContent}
              maxLength={GEO_SOURCE_CONTENT_MAX_CHARS}
              onChange={(event) => {
                setSourceContent(event.target.value);
                persistDraft({ sourceContent: event.target.value });
              }}
              placeholder="粘贴产品说明、官网介绍等已有内容…"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geo-keywords">相关关键词（可选，顿号或逗号分隔）</Label>
            <Input
              id="geo-keywords"
              value={effectiveKeywordsText}
              onChange={(event) => {
                setKeywordsText(event.target.value);
                persistDraft({ keywordsText: event.target.value });
              }}
              placeholder="保温杯、不锈钢水杯"
            />
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
            labelPrefix="GEO "
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
            <Label htmlFor="geo-language">
              输出语言 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveLanguage}
              onValueChange={(value) => {
                setLanguage(value);
                persistDraft({ language: value });
              }}
            >
              <SelectTrigger id="geo-language">
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
            <Label htmlFor="geo-model">
              内容模型 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveModelId}
              onValueChange={(value) => {
                setModelId(value);
                persistDraft({ modelId: value });
              }}
            >
              <SelectTrigger id="geo-model">
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
                正在生成 GEO 内容…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                生成 GEO 内容
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && <GeoResultView result={result} />}
    </div>
  );
}

export function GeoResultView({ result }: { result: GeoResult }) {
  return (
    <div className="space-y-3">
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
        <CloudOff className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          本结果未联网核实，仅基于用户提供的已确认事实与内容生成。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">直接回答</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{result.directAnswer}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">支撑内容</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="whitespace-pre-wrap">{result.supportingContent}</p>
        </CardContent>
      </Card>

      {result.claims.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">事实断言（{result.claims.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {result.claims.map((claim, index) => (
              <div key={index} className="flex items-start gap-2">
                <p className="min-w-0 flex-1">{claim.text}</p>
                <Badge variant="secondary" className="shrink-0">
                  {claim.factKey}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.faq.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">相关追问</CardTitle>
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

      {result.pendingFacts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-amber-700 dark:text-amber-300">
              待确认事实（{result.pendingFacts.length}，未进入可发布内容）
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
