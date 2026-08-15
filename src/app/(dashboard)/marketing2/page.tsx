'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkflowCardGrid } from '@/components/marketing2/WorkflowCardGrid';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketing2Api,
  type RunSummary,
  type WorkflowCardApi,
} from '@/components/marketing2/hooks/use-marketing2-run';

// ============================================
// /marketing2 工作流卡片中心（交互 4）
// 顶部：标题、最近任务、返回旧版入口；主区域：响应式卡片网格。
// ============================================

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  running_step: '执行中',
  awaiting_review: '待确认',
  partial_failed: '部分失败',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
};

const DRAFT_STATUS_FILTER = 'draft,awaiting_review,running_step,partial_failed';

async function loadAllDraftRuns(): Promise<RunSummary[]> {
  const allRuns: RunSummary[] = [];
  let cursor: string | undefined;

  do {
    const page = await marketing2Api.runs({
      workflowKey: 'marketing2-image-detail-full',
      status: DRAFT_STATUS_FILTER,
      cursor,
      limit: 50,
    });
    allRuns.push(...page.runs);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return allRuns;
}

export default function Marketing2Page() {
  const [workflows, setWorkflows] = useState<WorkflowCardApi[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteDraft = async (run: RunSummary) => {
    if (!window.confirm(`确定删除草稿“${run.title}”吗？删除后不可恢复。`)) return;

    try {
      await marketing2Api.deleteRun(run.id);
      setRecentRuns((current) => current.filter((item) => item.id !== run.id));
      setWorkflows(await marketing2Api.workflows());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除草稿失败');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [workflowList, runs] = await Promise.all([
          marketing2Api.workflows(),
          loadAllDraftRuns(),
        ]);
        if (cancelled) return;
        setWorkflows(workflowList);
        setRecentRuns(runs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">营销助手2</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按步骤完成产品图准备、视觉策划、生图和质量验收
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/marketing">返回旧版营销助手</Link>
        </Button>
      </div>

      {recentRuns.length > 0 && (
        <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">最近任务</h2>
          <div className="flex flex-wrap gap-2">
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent">
                <Link href={`/marketing2/${run.workflowKey}?runId=${run.id}`} className="flex min-w-0 items-center gap-2">
                  <span className="max-w-40 truncate">{run.title}</span>
                  <Badge variant="secondary">{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="删除草稿"
                  aria-label={`删除草稿 ${run.title}`}
                  onClick={() => void handleDeleteDraft(run)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">正在加载工作流...</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-destructive">{error}</p>
      ) : (
        <WorkflowCardGrid workflows={workflows} />
      )}
    </div>
  );
}
