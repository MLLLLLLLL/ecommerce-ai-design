'use client';

import { Check, Circle, Clock3, Loader2, SkipForward, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// 阶段步骤栏（交互 5.1）
// 展示步骤与状态：idle -> running -> awaiting_review -> approved / failed / skipped
// ============================================

export interface StepperStep {
  key: string;
  title: string;
  order: number;
}

const STATE_META: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  idle: { label: '未开始', icon: Circle, className: 'text-muted-foreground' },
  running: { label: '执行中', icon: Loader2, className: 'text-blue-600' },
  awaiting_review: { label: '待确认', icon: Clock3, className: 'text-amber-600' },
  approved: { label: '已确认', icon: Check, className: 'text-emerald-600' },
  failed: { label: '失败', icon: X, className: 'text-red-600' },
  skipped: { label: '已跳过', icon: SkipForward, className: 'text-gray-500' },
};

export function WorkflowStepper({
  steps,
  states,
  activeKey,
  onSelect,
}: {
  steps: StepperStep[];
  states: Record<string, string>;
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav aria-label="工作流步骤" className="space-y-1">
      {steps.map((step) => {
        const state = states[step.key] ?? 'idle';
        const meta = STATE_META[state] ?? STATE_META.idle;
        const Icon = meta.icon;
        const active = step.key === activeKey;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelect(step.key)}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
              active ? 'bg-accent font-medium' : 'hover:bg-accent/50'
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs">
              {step.order}
            </span>
            <span className="flex-1 truncate">{step.title}</span>
            <span className={cn('flex items-center gap-1 text-xs', meta.className)}>
              <Icon className={cn('h-3.5 w-3.5', state === 'running' && 'animate-spin')} />
              {meta.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
