'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RunDetail } from '@/components/marketing2/hooks/use-marketing2-run';

// ============================================
// 阶段二：底图净化（交互 6.2）
// 展示原图、净化结果与失败原因；支持跳过（必填原因）。
// 净化结果与原图建立派生关系，不覆盖原图。
// ============================================

export function BackgroundCleanupStep({
  detail,
  onSkip,
  busy,
}: {
  detail: RunDetail;
  onSkip: (reason: string) => void;
  busy: boolean;
}) {
  const [skipReason, setSkipReason] = useState('');
  const [skipOpen, setSkipOpen] = useState(false);
  const input = (detail.task.input ?? {}) as Record<string, unknown>;
  const originals = (input.productImages as string[]) ?? [];
  const stepItems = detail.items.filter((item) => item.stepKey === 'background_cleanup');
  const stepResult = detail.task.stepResults?.background_cleanup;

  const cleanedImages =
    (stepResult?.result as { cleanedImages?: { url: string; derivedAssetId: string }[] } | undefined)
      ?.cleanedImages ??
    stepItems
      .filter((item) => item.status === 'completed')
      .map((item) => ({
        url: (item.result as { url?: string })?.url ?? '',
        derivedAssetId: (item.result as { derivedAssetId?: string })?.derivedAssetId ?? '',
      }));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">原图（只读保留）</h3>
        <div className="flex flex-wrap gap-2">
          {originals.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={`原图 ${index + 1}`} className="h-28 w-28 rounded-md border object-cover" />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">净化结果</h3>
        {stepItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未执行。执行后此处展示净化结果。</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {stepItems.map((item) => {
              const result = item.result as { url?: string } | null;
              return (
                <div key={item.id} className="space-y-1">
                  {item.status === 'completed' && result?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.url} alt="净化结果" className="h-28 w-28 rounded-md border object-cover" />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-md border text-xs text-muted-foreground">
                      {item.status === 'running' || item.status === 'pending' ? '处理中...' : '失败'}
                    </div>
                  )}
                  {item.status === 'failed' && (
                    <p className="max-w-28 break-all text-xs text-destructive">{item.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {cleanedImages.length > 0 && (
          <p className="text-xs text-muted-foreground">
            已生成 {cleanedImages.length} 张净化底图（派生资产，原图不受影响）。
          </p>
        )}
      </section>

      <section className="space-y-2">
        {!skipOpen ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || stepResult?.skipped === true}
            onClick={() => setSkipOpen(true)}
          >
            跳过此阶段
          </Button>
        ) : (
          <div className="max-w-md space-y-2 rounded-md border p-3">
            <Textarea
              rows={2}
              placeholder="跳过原因（必填），例如：原图背景已足够干净"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !skipReason.trim()}
                onClick={() => {
                  onSkip(skipReason.trim());
                  setSkipOpen(false);
                }}
              >
                确认跳过
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSkipOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        )}
        {stepResult?.skipped === true && (
          <p className="text-xs text-muted-foreground">已跳过：{stepResult.reason}</p>
        )}
      </section>
    </div>
  );
}
