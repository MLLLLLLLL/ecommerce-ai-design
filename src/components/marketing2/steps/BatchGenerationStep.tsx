'use client';

import { useEffect, useState } from 'react';
import { Loader2, Maximize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ImagePreviewDialog, type PreviewImage } from '@/components/marketing2/ImagePreviewDialog';
import type { RunDetail, RunItemApi } from '@/components/marketing2/hooks/use-marketing2-run';

// ============================================
// 阶段四：分批生图（交互 6.4）
// 每个生图 Item 显示状态；支持单张重试、暂停后继续。
// ============================================

const ITEM_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '等待中', className: 'bg-gray-100 text-gray-600' },
  running: { label: '生成中', className: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700' },
  skipped: { label: '已跳过', className: 'bg-gray-100 text-gray-500' },
  cancelled: { label: '已取消', className: 'bg-gray-100 text-gray-500' },
};

function kindLabel(kind: string): string {
  if (kind.startsWith('main_image:')) return `主图 ${kind.slice('main_image:'.length)}`;
  if (kind.startsWith('detail_page:')) return `详情页 ${kind.slice('detail_page:'.length)}`;
  return kind;
}

function formatElapsed(startedAt: string | null, createdAt: string, now: number): string {
  const started = Date.parse(startedAt ?? createdAt);
  if (!Number.isFinite(started)) return '0秒';
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export function BatchGenerationStep({
  detail,
  onRetryItem,
  onRetryAllFailed,
  onPauseToggle,
  onBatchSubmitChange,
  busy,
}: {
  detail: RunDetail;
  onRetryItem: (itemId: string) => void;
  onRetryAllFailed: () => void;
  onPauseToggle: () => void;
  onBatchSubmitChange: (value: boolean) => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const input = (detail.task.input ?? {}) as Record<string, unknown>;
  const batchSubmit = input.batchSubmit !== false;
  const items = detail.items.filter(
    (item) => item.stepKey === 'batch_generation' && (item.kind.startsWith('main_image:') || item.kind.startsWith('detail_page:'))
  );
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const failedCount = items.filter((item) => item.status === 'failed' || item.status === 'cancelled').length;
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const isPaused = Boolean(detail.task.pausedAt);
  const hasRunningItem = items.some((item) => item.status === 'running');

  useEffect(() => {
    if (!hasRunningItem) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningItem]);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={batchSubmit}
          disabled={items.length > 0 || busy}
          onCheckedChange={(checked) => onBatchSubmitChange(checked === true)}
        />
        批量提交（服务端仍按并发上限拆分执行）
      </label>

      {items.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              进度：{completedCount}/{items.length}
              {failedCount > 0 ? `，失败 ${failedCount}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {isPaused && <Badge variant="secondary">已暂停</Badge>}
              {failedCount > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onRetryAllFailed}>
                  重试失败项（{failedCount}）
                </Button>
              )}
              {detail.task.status === 'running_step' && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onPauseToggle}>
                  {isPaused ? '继续' : '暂停'}
                </Button>
              )}
            </div>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未创建生图子项。执行本步骤后按提示词顺序生成。</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item: RunItemApi) => {
            const meta = ITEM_STATUS_META[item.status] ?? ITEM_STATUS_META.pending;
            const result = item.result as { url?: string; filename?: string } | null;
            return (
              <div key={item.id} className="space-y-1.5 rounded-md border p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-medium">{kindLabel(item.kind)}</span>
                  <Badge variant="secondary" className={meta.className}>
                    {meta.label}
                  </Badge>
                </div>
                {item.status === 'completed' && result?.url ? (
                  <button
                    type="button"
                    className="group relative block aspect-square w-full overflow-hidden rounded focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    aria-label={`查看${kindLabel(item.kind)}原图`}
                    title="查看原图"
                    onClick={() => setPreviewImage({ src: result.url!, title: result.filename ?? kindLabel(item.kind) })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result.url} alt={kindLabel(item.kind)} className="h-full w-full object-cover" />
                    <span className="absolute right-2 top-2 rounded bg-black/65 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                    {item.status === 'running' ? (
                      <span className="flex flex-col items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="tabular-nums">生成中 {formatElapsed(item.startedAt, item.createdAt, now)}</span>
                      </span>
                    ) : item.status === 'pending' ? '等待中' : '无图片'}
                  </div>
                )}
                {item.status === 'failed' && (
                  <p className="line-clamp-2 break-all text-xs text-destructive">{item.error}</p>
                )}
                {(item.status === 'failed' || item.status === 'cancelled') && (
                  <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => onRetryItem(item.id)}>
                    重试
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ImagePreviewDialog image={previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }} />
    </div>
  );
}
