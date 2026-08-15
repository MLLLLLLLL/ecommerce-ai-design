'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAssetUrl } from '@/lib/utils';
import type { RunDetail } from '@/components/marketing2/hooks/use-marketing2-run';

// ============================================
// 阶段五：质检与返修（交互 6.5）
// 十项结构化质检展示；failed 项必须返修或人工豁免；
// 返修创建新资产版本，原图只读保留。
// ============================================

const CHECK_LABELS: Record<string, string> = {
  appearance_consistency: '外观一致性',
  subject_recognition: '主体辨识度',
  fact_truthfulness: '信息真实性',
  layout_and_text: '版式与文字',
  detail_decision_chain: '详情页决策链',
  visual_unity: '视觉统一性',
  prop_subordination: '道具从属性',
  safe_margin: '安全边距',
  click_conversion: '点击转化力',
  splice_fit: '拼接适配度',
};

const REPAIR_ACTIONS: { value: string; label: string }[] = [
  { value: 'appearance_distortion', label: '外观变形' },
  { value: 'text_garbled', label: '文字乱码' },
  { value: 'fabricated_params', label: '虚构参数' },
  { value: 'low_design_quality', label: '设计质感不足' },
];

const CHECK_STATUS_META: Record<string, { label: string; className: string }> = {
  passed: { label: '通过', className: 'bg-emerald-100 text-emerald-700' },
  warning: { label: '警告', className: 'bg-amber-100 text-amber-700' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700' },
  manual_override: { label: '人工豁免', className: 'bg-gray-200 text-gray-700' },
};

export interface QualityOverride {
  assetId: string;
  reason: string;
}

export function QualityRepairStep({
  detail,
  onRepair,
  onRetryItem,
  overrides,
  onOverridesChange,
  busy,
}: {
  detail: RunDetail;
  onRepair: (repairs: { assetId: string; issueType: string }[]) => void;
  onRetryItem: (itemId: string) => void;
  overrides: QualityOverride[];
  onOverridesChange: (overrides: QualityOverride[]) => void;
  busy: boolean;
}) {
  const [selectedRepairs, setSelectedRepairs] = useState<Record<string, string>>({});

  const checkItems = detail.items.filter((item) => item.kind.startsWith('quality_check:'));
  const repairItems = detail.items.filter((item) => item.kind.startsWith('repair:'));
  const assetById = new Map(detail.assets.map((asset) => [asset.id, asset]));
  const qualityResult = detail.task.stepResults?.quality_repair?.result as
    | { reports?: { assetId: string; report: { items: { key: string; status: string; evidence?: string }[]; overallStatus: string } }[] }
    | undefined;

  return (
    <div className="space-y-6">
      {checkItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未执行质检。执行后输出十项结构化检查结果。</p>
      ) : (
        <div className="space-y-4">
          {checkItems.map((item) => {
            const assetId = item.kind.slice('quality_check:'.length);
            const asset = assetById.get(assetId);
            const report =
              qualityResult?.reports?.find((entry) => entry.assetId === assetId)?.report ??
              (item.result as { items?: { key: string; status: string; evidence?: string }[]; overallStatus?: string } | null);
            const override = overrides.find((entry) => entry.assetId === assetId);
            const repaired = repairItems.some(
              (repair) => repair.kind.startsWith(`repair:${assetId}:`) && repair.status === 'completed'
            );

            return (
              <div key={item.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  {asset && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getAssetUrl(asset.filepath)}
                      alt={asset.filename}
                      className="h-16 w-16 rounded border object-cover"
                    />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{asset?.filename ?? assetId.slice(0, 8)}</p>
                    <div className="flex flex-wrap gap-1">
                      {item.status !== 'completed' && (
                        <Badge variant="secondary">
                          {item.status === 'failed' ? '质检失败' : '质检中...'}
                        </Badge>
                      )}
                      {report?.overallStatus && (
                        <Badge
                          variant="secondary"
                          className={
                            report.overallStatus === 'passed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }
                        >
                          {report.overallStatus === 'passed' ? '质检通过' : report.overallStatus === 'needs_repair' ? '需要返修' : '需要确认'}
                        </Badge>
                      )}
                      {repaired && <Badge variant="secondary">已返修</Badge>}
                      {override && <Badge variant="secondary">已豁免</Badge>}
                    </div>
                  </div>
                  {item.status === 'failed' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetryItem(item.id)}>
                      重试质检
                    </Button>
                  )}
                </div>

                {report?.items && (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {report.items.map((check) => {
                      const meta = CHECK_STATUS_META[check.status] ?? CHECK_STATUS_META.passed;
                      return (
                        <div key={check.key} className="flex items-start justify-between gap-2 text-xs">
                          <span>{CHECK_LABELS[check.key] ?? check.key}</span>
                          <span className="flex items-center gap-1">
                            {check.evidence && (
                              <span className="max-w-40 truncate text-muted-foreground" title={check.evidence}>
                                {check.evidence}
                              </span>
                            )}
                            <Badge variant="secondary" className={meta.className}>
                              {meta.label}
                            </Badge>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 返修与豁免操作 */}
                {item.status === 'completed' &&
                  report?.items?.some((check) => check.status === 'failed') &&
                  !repaired &&
                  !override && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                      <Select
                        value={selectedRepairs[assetId] ?? REPAIR_ACTIONS[0].value}
                        onValueChange={(value) => setSelectedRepairs({ ...selectedRepairs, [assetId]: value })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="返修动作" />
                        </SelectTrigger>
                        <SelectContent>
                          {REPAIR_ACTIONS.map((action) => (
                            <SelectItem key={action.value} value={action.value}>
                              {action.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          onRepair([
                            { assetId, issueType: selectedRepairs[assetId] ?? REPAIR_ACTIONS[0].value },
                          ])
                        }
                      >
                        返修
                      </Button>
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-48"
                          placeholder="豁免原因（确认后随审批提交）"
                          value={overrides.find((entry) => entry.assetId === assetId)?.reason ?? ''}
                          onChange={(e) => {
                            const others = overrides.filter((entry) => entry.assetId !== assetId);
                            if (e.target.value.trim()) {
                              onOverridesChange([...others, { assetId, reason: e.target.value }]);
                            } else {
                              onOverridesChange(others);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}

      {repairItems.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">返修记录</h3>
          <div className="flex flex-wrap gap-3">
            {repairItems.map((item) => {
              const result = item.result as { url?: string } | null;
              return (
                <div key={item.id} className="space-y-1">
                  {item.status === 'completed' && result?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.url} alt="返修结果" className="h-24 w-24 rounded border object-cover" />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded border text-xs text-muted-foreground">
                      {item.status === 'failed' ? '返修失败' : '返修中...'}
                    </div>
                  )}
                  {item.status === 'failed' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetryItem(item.id)}>
                      重试
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
