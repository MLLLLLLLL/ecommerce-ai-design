'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Check,
  Copy,
  Download,
  History,
  Inbox,
  Loader2,
  Star,
  StarOff,
} from 'lucide-react';
import type {
  GenerateTaskData,
  GeoResult,
  InsightResult,
  MarketingTaskListItem,
  MarketingTaskResultSnapshot,
  MarketingTaskStatus,
  SeoResult,
  TranslateTaskResultSnapshot,
} from '@/types/marketing-contract';
import { TaskDetail } from './use-task-polling';

// ============================================
// 结果三级视图（V3 4.5）
// 本轮作品 / 当前窗口历史 / 全部作品
// ============================================

const STATUS_LABEL: Record<MarketingTaskStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground' },
  analyzing: { label: '分析中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  generating: { label: '生成中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partial_failed: { label: '部分失败', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

interface ResultsPanelProps {
  currentResult: GenerateTaskData | null;
  generating: boolean;
  progress?: TaskDetail | null;
  refreshNonce: number;
}

export function ResultsPanel({ currentResult, generating, progress, refreshNonce }: ResultsPanelProps) {
  return (
    <Tabs defaultValue="current" className="flex h-full min-h-0 flex-col">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="current">本轮作品</TabsTrigger>
        <TabsTrigger value="window">
          <History className="mr-1 h-3.5 w-3.5" />
          窗口历史
        </TabsTrigger>
        <TabsTrigger value="all">
          <Inbox className="mr-1 h-3.5 w-3.5" />
          全部作品
        </TabsTrigger>
      </TabsList>

      <TabsContent value="current" className="min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
        {generating ? (
          progress ? (
            <ProgressView detail={progress} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              正在生成，请稍候…
            </div>
          )
        ) : currentResult ? (
          <CurrentResultView result={currentResult} />
        ) : (
          <EmptyHint text="完成生成后，本轮结果将显示在这里" />
        )}
      </TabsContent>

      <TabsContent value="window" className="min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
        <WindowHistoryView />
      </TabsContent>

      <TabsContent value="all" className="min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
        <AllTasksView refreshNonce={refreshNonce} />
      </TabsContent>
    </Tabs>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
      <Inbox className="h-8 w-8" />
      <p>{text}</p>
    </div>
  );
}

// ---------------- 执行进度（V3 Phase 6） ----------------

const ITEM_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '排队中', className: 'bg-muted text-muted-foreground' },
  running: { label: '执行中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  completed: { label: '完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: '已取消', className: 'bg-muted text-muted-foreground' },
  skipped: { label: '跳过', className: 'bg-muted text-muted-foreground' },
};

function ProgressView({ detail }: { detail: TaskDetail }) {
  const [cancelling, setCancelling] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const response = await fetch(`/api/marketing/tasks/${detail.id}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || '取消失败');
      toast.success('已请求取消');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async (itemId: string) => {
    setRetryingId(itemId);
    try {
      const response = await fetch(`/api/marketing/tasks/${detail.id}/items/${itemId}/retry`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || '重试失败');
      toast.success('已重新排队该子任务');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重试失败');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">后台执行中，可关闭页面稍后查看</span>
        </div>
        <Button variant="outline" size="sm" disabled={cancelling} onClick={() => void handleCancel()}>
          {cancelling ? '取消中…' : '取消任务'}
        </Button>
      </div>
      <div className="space-y-1.5">
        {detail.items.map((item) => {
          const meta = ITEM_STATUS_LABEL[item.status] ?? ITEM_STATUS_LABEL.pending;
          return (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{item.kind}</span>
                {item.attempts > 0 && item.status === 'pending' && (
                  <span className="ml-2 text-xs text-muted-foreground">第 {item.attempts + 1} 次尝试</span>
                )}
                {item.error && item.status !== 'failed' && (
                  <p className="truncate text-xs text-amber-600 dark:text-amber-400">{item.error}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className={meta.className}>{meta.label}</Badge>
                {item.status === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retryingId === item.id}
                    onClick={() => void handleRetry(item.id)}
                  >
                    {retryingId === item.id ? '重试中…' : '重试'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MarketingTaskStatus }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.failed;
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

// ---------------- 本轮作品 ----------------

function CurrentResultView({ result }: { result: GenerateTaskData }) {
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    setExporting(true);
    try {
      const response = await fetch(`/api/marketing/tasks/${result.taskId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '导出失败');
      }
      toast.success('已导出，可在素材库查看');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={result.status} />
          <span className="text-xs text-muted-foreground">任务 {result.taskId.slice(0, 8)}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copied ? '已复制' : '复制 JSON'}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void handleExport('markdown')}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {exporting ? '导出中' : '导出 Markdown'}
          </Button>
        </div>
      </div>

      {result.status === 'failed' && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            {result.error || '生成失败'}
          </CardContent>
        </Card>
      )}
      {result.status === 'partial_failed' && result.error && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">{result.error}</CardContent>
        </Card>
      )}

      <ResultContent result={result.result} />
    </div>
  );
}

function ResultContent({ result }: { result: MarketingTaskResultSnapshot | TranslateTaskResultSnapshot | SeoResult | GeoResult | InsightResult }) {
  const translateResult = result as Partial<TranslateTaskResultSnapshot>;
  if (translateResult.translations && Object.keys(translateResult.translations).length > 0) {
    return <TranslateResultContent result={translateResult as TranslateTaskResultSnapshot} />;
  }

  const seoResult = result as Partial<SeoResult>;
  if (seoResult.pageTitle && seoResult.bodyContent) {
    return <SeoResultContent result={seoResult as SeoResult} />;
  }

  const geoResult = result as Partial<GeoResult>;
  if (geoResult.question && geoResult.directAnswer) {
    return <GeoResultContent result={geoResult as GeoResult} />;
  }

  const insightResult = result as Partial<InsightResult>;
  if (insightResult.type && insightResult.summary) {
    return <InsightResultContent result={insightResult as InsightResult} />;
  }

  const marketingResult = result as MarketingTaskResultSnapshot;  const copywriting = marketingResult.copywriting as
    | {
        title?: { main?: string; variations?: string[]; seoOptimized?: string };
        corePoints?: { text: string; emphasis?: string }[];
        description?: { short?: string; long?: string; structured?: Record<string, string | string[]> };
        seo?: { primary?: string[]; secondary?: string[]; forbidden?: string[] };
      }
    | undefined;
  const analysis = marketingResult.analysis as
    | {
        productAnchor?: string;
        category?: string;
        confirmed?: Record<string, unknown>;
        inferred?: Record<string, unknown>;
        placeholders?: Record<string, string[]>;
        risks?: string[];
      }
    | undefined;
  const mainPrompts = marketingResult.mainPrompts as
    | { prompts?: { index?: number; title?: string; chinesePrompt?: string; renderParams?: string }[] }
    | undefined;
  const detailPrompts = marketingResult.detailPrompts as
    | { prompts?: { index?: number; keyword?: string; chinesePrompt?: string; renderParams?: string }[] }
    | undefined;
  const pendingFacts = Array.isArray(marketingResult.pendingFacts) ? marketingResult.pendingFacts : [];

  return (
    <div className="space-y-3">
      {analysis && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">产品分析报告</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {analysis.productAnchor && <p>{analysis.productAnchor}</p>}
            {analysis.confirmed && (
              <KeyValueSection title="可确认信息" data={analysis.confirmed} />
            )}
            {analysis.inferred && <KeyValueSection title="可推断信息" data={analysis.inferred} />}
            {analysis.placeholders && Object.keys(analysis.placeholders).length > 0 && (
              <div>
                <p className="font-medium">待确认占位</p>
                <p className="text-muted-foreground">
                  {Object.values(analysis.placeholders).flat().join('、') || '无'}
                </p>
              </div>
            )}
            {analysis.risks && analysis.risks.length > 0 && (
              <div>
                <p className="font-medium">风险提示</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {analysis.risks.map((risk, index) => (
                    <li key={index}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {copywriting && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">电商文案</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {copywriting.title?.main && (
              <div>
                <p className="font-medium">主标题</p>
                <p>{copywriting.title.main}</p>
              </div>
            )}
            {copywriting.title?.variations && copywriting.title.variations.length > 0 && (
              <div>
                <p className="font-medium">标题变体</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {copywriting.title.variations.map((variation, index) => (
                    <li key={index}>{variation}</li>
                  ))}
                </ul>
              </div>
            )}
            {copywriting.corePoints && copywriting.corePoints.length > 0 && (
              <div>
                <p className="font-medium">核心卖点</p>
                <ul className="list-inside list-disc">
                  {copywriting.corePoints.map((point, index) => (
                    <li key={index}>{point.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {copywriting.description?.short && (
              <div>
                <p className="font-medium">简短描述</p>
                <p className="text-muted-foreground">{copywriting.description.short}</p>
              </div>
            )}
            {copywriting.description?.long && (
              <div>
                <p className="font-medium">详情页描述</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{copywriting.description.long}</p>
              </div>
            )}
            {copywriting.seo?.primary && copywriting.seo.primary.length > 0 && (
              <div>
                <p className="font-medium">SEO 关键词</p>
                <p className="text-muted-foreground">{copywriting.seo.primary.join('、')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mainPrompts?.prompts && mainPrompts.prompts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">主图提示词（{mainPrompts.prompts.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {mainPrompts.prompts.map((prompt, index) => (
              <div key={prompt.index ?? index}>
                <p className="font-medium">{prompt.title ?? `主图 ${index + 1}`}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{prompt.chinesePrompt}</p>
                {prompt.renderParams && (
                  <p className="mt-1 text-xs text-muted-foreground">渲染参数：{prompt.renderParams}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {detailPrompts?.prompts && detailPrompts.prompts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">详情页提示词（{detailPrompts.prompts.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detailPrompts.prompts.map((prompt, index) => (
              <div key={prompt.index ?? index}>
                <p className="font-medium">{prompt.keyword ?? `第 ${index + 1} 页`}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{prompt.chinesePrompt}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingFacts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-amber-700 dark:text-amber-300">
              待确认事实（{pendingFacts.length}）
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-700 dark:text-amber-300">
            <p className="mb-1 text-xs">以下内容未经证实，未进入可发布正文：</p>
            <ul className="list-inside list-disc">
              {(pendingFacts as { key?: string; value?: string }[]).map((fact, index) => (
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

function TranslateResultContent({ result }: { result: TranslateTaskResultSnapshot }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = async (code: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">
          翻译结果（{Object.values(result.translations).filter((entry) => entry.status === 'completed').length}/
          {Object.keys(result.translations).length} 成功）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(result.translations).map(([code, entry]) => (
          <div key={code} className="rounded-md border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">{code}</span>
              {entry.status === 'completed' && entry.translation && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(code, entry.translation ?? '')}
                >
                  {copiedCode === code ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
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
  );
}

function SeoResultContent({ result }: { result: SeoResult }) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">页面标题与 Meta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p>{result.pageTitle.title}</p>
          <p className="text-muted-foreground">{result.pageTitle.metaDescription}</p>
          <p className="text-xs text-muted-foreground">Slug：{result.pageTitle.slug}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">关键词意图</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {result.keywordIntent.map((item, index) => (
            <p key={index}>
              <span className="font-medium">{item.keyword}</span>
              <span className="ml-2 text-muted-foreground">
                {item.intent} · {item.explanation}
              </span>
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">标题结构</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
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
          <CardContent className="space-y-1 text-sm">
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
          <CardContent className="space-y-1 text-sm">
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
            <CardTitle className="text-sm">JSON-LD</CardTitle>
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

function GeoResultContent({ result }: { result: GeoResult }) {
  return (
    <div className="space-y-3">
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">
          本结果未联网核实，仅基于用户提供的已确认事实与内容生成。
        </CardContent>
      </Card>

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

function InsightResultContent({ result }: { result: InsightResult }) {
  return (
    <div className="space-y-3">
      {result.degraded && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">
            未能获取完整联网信息（部分查询失败或配额用尽），以下内容可能不完整。
          </CardContent>
        </Card>
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

      {result.recommendations.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">行动建议</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="list-inside list-disc">
              {result.recommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.sources.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">来源（{result.sources.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {result.sources.map((source, index) => (
              <p key={index} className="truncate">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
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

function KeyValueSection({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <p key={key} className="text-muted-foreground">
            {key}：{Array.isArray(value) ? value.join('、') : String(value)}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------- 窗口历史 ----------------

interface TaskSummary {
  id: string;
  status: MarketingTaskStatus;
  productName: string;
  platform: string;
  createdAt: string;
}

function WindowHistoryView() {
  const [items, setItems] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const raw = sessionStorage.getItem('marketing.taskIds');
        const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        if (ids.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        const summaries: TaskSummary[] = [];
        for (const id of ids) {
          const response = await fetch(`/api/marketing/tasks/${id}`);
          const data = await response.json();
          if (response.ok && data.success) {
            summaries.push({
              id,
              status: data.data.status,
              productName: data.data.productName,
              platform: data.data.platform,
              createdAt: data.data.createdAt,
            });
          }
        }
        if (!cancelled) setItems(summaries);
      } catch {
        // 忽略历史回查错误
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) return <EmptyHint text="本窗口暂无历史任务" />;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.productName}</p>
            <p className="text-xs text-muted-foreground">
              {item.platform} · {new Date(item.createdAt).toLocaleString()} · {item.id.slice(0, 8)}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </Card>
      ))}
    </div>
  );
}

// ---------------- 全部作品 ----------------

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'partial_failed', label: '部分失败' },
  { value: 'failed', label: '失败' },
];

const MODULE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'copywriting', label: '文案' },
  { value: 'translate', label: '翻译' },
  { value: 'seo', label: 'SEO' },
  { value: 'geo', label: 'GEO' },
  { value: 'insight', label: '洞察' },
];

const TIME_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
];

function AllTasksView({ refreshNonce }: { refreshNonce: number }) {
  const [items, setItems] = useState<MarketingTaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (replace: boolean, cursor?: string | null) => {
      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (moduleFilter !== 'all') params.set('module', moduleFilter);
        if (favoriteOnly) params.set('isFavorite', 'true');
        if (search.trim()) params.set('q', search.trim());
        if (timeFilter === '7d') {
          params.set('from', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        } else if (timeFilter === '30d') {
          params.set('from', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        }
        const response = await fetch(`/api/marketing/tasks?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error('加载失败');
        const list = data.data.items as MarketingTaskListItem[];
        setItems((current) => (replace ? list : [...current, ...list]));
        setNextCursor(data.data.nextCursor as string | null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '加载全部作品失败');
      }
    },
    [statusFilter, moduleFilter, timeFilter, favoriteOnly, search]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await load(true);
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load, refreshNonce]);

  const toggleFavorite = async (id: string, current: boolean) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/marketing/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !current }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || '操作失败');
      setItems((list) =>
        list.map((item) => (item.id === id ? { ...item, isFavorite: data.data.isFavorite } : item))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '收藏操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = async (id: string) => {
    try {
      const response = await fetch(`/api/marketing/tasks/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'markdown' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || '导出失败');
      toast.success('已导出到素材库');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleCancelTask = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/marketing/tasks/${id}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || '取消失败');
      toast.success('已取消任务');
      void load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={moduleFilter}
          onChange={(event) => setModuleFilter(event.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label="类型筛选"
        >
          {MODULE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label="状态筛选"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <select
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label="时间筛选"
        >
          {TIME_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <Button
          variant={favoriteOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFavoriteOnly((current) => !current)}
        >
          <Star className="mr-1 h-3.5 w-3.5" />
          仅看收藏
        </Button>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索商品名或关键词"
          className="h-8 min-w-32 flex-1 rounded-md border bg-background px-2 text-sm"
          aria-label="搜索"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyHint text="暂无作品，完成一次生成后会自动出现在这里" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{item.productName}</p>
                    {item.module !== 'copywriting' && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {MODULE_FILTERS.find((filter) => filter.value === item.module)?.label ?? item.module}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.module === 'copywriting' ? item.platform : MODULE_FILTERS.find((filter) => filter.value === item.module)?.label ?? item.module} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={item.status} />
                  {(item.status === 'analyzing' || item.status === 'generating' || item.status === 'draft') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={busyId === item.id}
                      onClick={() => void handleCancelTask(item.id)}
                    >
                      取消
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={busyId === item.id}
                    aria-label={item.isFavorite ? '取消收藏' : '收藏'}
                    onClick={() => void toggleFavorite(item.id, item.isFavorite)}
                  >
                    {item.isFavorite ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4" />}
                  </Button>
                  {item.status !== 'failed' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="导出"
                      onClick={() => void handleExport(item.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {nextCursor && (
            <Button
              variant="ghost"
              className="w-full"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void load(false, nextCursor).finally(() => setLoadingMore(false));
              }}
            >
              {loadingMore ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              加载更多
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
