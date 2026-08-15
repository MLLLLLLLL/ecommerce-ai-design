'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkflowCardApi } from '@/components/marketing2/hooks/use-marketing2-run';
import { CAPABILITY_LABELS } from '@/lib/marketing2/workflow-registry';
import type { ModelCapabilityKey } from '@/types/model-config';

// ============================================
// 工作流卡片（交互 4）
// 五态：可开始 / 需要配置模型 / 继续任务 / 有历史结果 / 不可用。
// 卡片整体可点击，不嵌套第二层卡片。
// ============================================

const STATUS_META: Record<
  WorkflowCardApi['cardStatus'],
  { label: string; className: string }
> = {
  ready: { label: '可开始', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  needs_models: { label: '部分能力缺失', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  resumable: { label: '继续任务', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  has_history: { label: '有历史结果', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  unavailable: { label: '不可用', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

export function WorkflowCard({ workflow }: { workflow: WorkflowCardApi }) {
  const status = STATUS_META[workflow.cardStatus] ?? STATUS_META.unavailable;
  const disabled = workflow.cardStatus === 'unavailable';
  const needsModels = workflow.cardStatus === 'needs_models';
  const isV3MainFlow = workflow.key === 'marketing2-image-detail-full' && workflow.version >= 3;

  return (
    <Card
      className={`flex h-full flex-col transition-shadow ${disabled ? 'opacity-60' : 'hover:shadow-md'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{workflow.title}</CardTitle>
          <Badge variant="secondary" className={status.className}>
            {status.label}
            {workflow.cardStatus === 'resumable' && workflow.resumableCount > 0
              ? `（${workflow.resumableCount}）`
              : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{workflow.description}</p>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">输入：</span>
            {workflow.requiredInputs.join('；')}
          </p>
          <p>
            <span className="font-medium text-foreground">输出：</span>
            {workflow.outputTypes.join('、')}
          </p>
          <p>
            <span className="font-medium text-foreground">步骤：</span>
            {isV3MainFlow
              ? '准备产品图 → 可选底图精修 → 提示词策划 → 逐张生图 → 质检返修'
              : workflow.steps.map((step) => step.title).join(' → ')}
          </p>
        </div>

        {needsModels && workflow.missingCapabilities.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            缺少能力：
            {workflow.missingCapabilities
              .map((key) => CAPABILITY_LABELS[key as ModelCapabilityKey] ?? key)
              .join('、')}
            <Link href={workflow.settingsUrl} className="ml-1 underline">
              去设置
            </Link>
          </div>
        )}

        <div className="mt-auto flex gap-2 pt-1">
          {!disabled && (
            <Button size="sm" className="flex-1" asChild>
              <Link href={`/marketing2/${workflow.key}`}>
                {workflow.cardStatus === 'resumable' ? '继续任务' : '开始新任务'}
              </Link>
            </Button>
          )}
          {needsModels && (
            <Button size="sm" variant="outline" asChild>
              <Link href={workflow.settingsUrl}>配置模型</Link>
            </Button>
          )}
          {workflow.completedCount > 0 && (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/marketing2/${workflow.key}`}>历史（{workflow.completedCount}）</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
