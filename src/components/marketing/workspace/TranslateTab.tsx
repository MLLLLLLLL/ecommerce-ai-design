'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Check, Copy, Languages, Loader2 } from 'lucide-react';
import { LanguagePicker } from './LanguagePicker';
import { useAsyncGeneration } from './use-async-generation';
import { TaskDetail } from './use-task-polling';
import { useSessionDraft, writeSessionDraft } from './use-session-draft';
import { MARKETING_LANGUAGES, groupLanguagesByGroup } from '@/lib/marketing/languages';
import { TRANSLATE_SOURCE_MAX_CHARS, TRANSLATE_TARGET_MAX } from '@/lib/marketing/schemas';
import type { ModelConfigSummary } from '@/types/model-config';
import type {
  GenerateTaskData,
  TranslateLanguageResult,
  TranslateTaskResultSnapshot,
} from '@/types/marketing-contract';

// ============================================
// 多语言翻译 Tab（V3 Phase 3）
// 源文本 + 源语言 + 目标语言（1-10 种）+ 内容模型。
// 结果按语言分组展示，部分失败保留成功结果。
// ============================================

const DRAFT_KEY = 'marketing.translate.draft';

interface TranslateTabProps {
  models: ModelConfigSummary[];
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
  onResult: (data: GenerateTaskData) => void;
}

export function TranslateTab({ models, generating, onGeneratingChange, onProgress, onResult }: TranslateTabProps) {
  const savedDraft = useSessionDraft<{
    sourceText?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
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

  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  const [targetLanguages, setTargetLanguages] = useState<string[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [translations, setTranslations] = useState<TranslateTaskResultSnapshot | null>(null);

  const handleResult = useCallback(
    (data: GenerateTaskData) => {
      setTranslations(data.result as TranslateTaskResultSnapshot);
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const effectiveSourceText = sourceText ?? (savedDraft.sourceText as string | undefined) ?? '';
  const effectiveSourceLanguage =
    sourceLanguage ?? (savedDraft.sourceLanguage as string | undefined) ?? 'auto';
  const effectiveTargetLanguages =
    targetLanguages ?? (savedDraft.targetLanguages as string[] | undefined) ?? [];
  const effectiveModelId = modelId ?? (savedDraft.modelId as string | undefined) ?? defaultContentModel?.id ?? '';

  const persistDraft = (patch: Record<string, unknown>) => {
    const current = {
      sourceText: effectiveSourceText,
      sourceLanguage: effectiveSourceLanguage,
      targetLanguages: effectiveTargetLanguages,
      modelId: effectiveModelId,
      ...patch,
    };
    writeSessionDraft(DRAFT_KEY, current);
  };

  const handleGenerate = async () => {
    if (!effectiveSourceText.trim()) {
      toast.error('请输入待翻译内容');
      return;
    }
    if (effectiveTargetLanguages.length === 0) {
      toast.error('请至少选择 1 种目标语言');
      return;
    }
    if (!effectiveModelId) {
      toast.error('请选择内容模型');
      return;
    }

    await submit({
      module: 'translate',
      schemaVersion: 1,
      input: {
        sourceText: effectiveSourceText.trim(),
        sourceLanguage: effectiveSourceLanguage,
        targetLanguages: effectiveTargetLanguages,
        modelId: effectiveModelId,
      },
    });
  };

  const handleCopy = async (code: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  const languageLabel = (code: string): string => {
    return MARKETING_LANGUAGES.find((option) => option.code === code)?.label ?? code;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">待翻译内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tr-source-text">
              源文本 <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveSourceText.length}/{TRANSLATE_SOURCE_MAX_CHARS} 字
              </span>
            </Label>
            <Textarea
              id="tr-source-text"
              value={effectiveSourceText}
              maxLength={TRANSLATE_SOURCE_MAX_CHARS}
              onChange={(event) => {
                setSourceText(event.target.value);
                persistDraft({ sourceText: event.target.value });
              }}
              placeholder={'输入商品标题、卖点或详情页内容…\n- 列表结构会被保留\n- 换行结构会被保留'}
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-source-language">源语言</Label>
            <Select
              value={effectiveSourceLanguage}
              onValueChange={(value) => {
                setSourceLanguage(value);
                persistDraft({ sourceLanguage: value });
              }}
            >
              <SelectTrigger id="tr-source-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="auto">自动识别</SelectItem>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            目标语言 <span className="text-red-500">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LanguagePicker
            value={effectiveTargetLanguages}
            max={TRANSLATE_TARGET_MAX}
            onChange={(languages) => {
              setTargetLanguages(languages);
              persistDraft({ targetLanguages: languages });
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
            <Label htmlFor="tr-model">
              内容模型 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={effectiveModelId}
              onValueChange={(value) => {
                setModelId(value);
                persistDraft({ modelId: value });
              }}
            >
              <SelectTrigger id="tr-model">
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

          <Button
            className="w-full"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在翻译（并发 3 种语言）…
              </>
            ) : (
              <>
                <Languages className="mr-2 h-4 w-4" />
                开始翻译
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {translations && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">翻译结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(translations.translations).map(([code, entry]: [string, TranslateLanguageResult]) => (
              <div key={code} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{languageLabel(code)}</span>
                    {entry.status === 'completed' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <Check className="mr-1 h-3 w-3" />
                        完成
                      </Badge>
                    ) : (
                      <Badge variant="destructive">失败</Badge>
                    )}
                  </div>
                  {entry.status === 'completed' && entry.translation && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCopy(code, entry.translation ?? '')}
                    >
                      {copiedCode === code ? (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1 h-3.5 w-3.5" />
                      )}
                      {copiedCode === code ? '已复制' : '复制'}
                    </Button>
                  )}
                </div>
                {entry.status === 'completed' && entry.translation ? (
                  <p className="whitespace-pre-wrap text-sm">{entry.translation}</p>
                ) : (
                  <p className="text-sm text-red-600 dark:text-red-400">{entry.error || '翻译失败'}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
