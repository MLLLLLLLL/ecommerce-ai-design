'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { TaskDetail, TERMINAL_TASK_STATUSES, useTaskPolling } from './use-task-polling';
import type {
  ExecutionStep,
  GenerateTaskData,
  GenerateTaskDataResult,
} from '@/types/marketing-contract';

// ============================================
// 异步生成提交 hook（V3 Phase 6）
// Tab 提交 -> POST 创建任务 -> 轮询详情 -> 终态后回调结果。
// 轮询期间通过 onProgress 上报进度（items 状态）。
// ============================================

interface UseAsyncGenerationProps {
  onResult: (data: GenerateTaskData) => void;
  onGeneratingChange: (generating: boolean) => void;
  onProgress?: (detail: TaskDetail | null) => void;
}

function itemsToSteps(items: TaskDetail['items']): Record<string, ExecutionStep> {
  const steps: Record<string, ExecutionStep> = {};
  for (const item of items) {
    steps[item.kind] = {
      status:
        item.status === 'pending'
          ? 'pending'
          : item.status === 'running'
            ? 'running'
            : item.status === 'completed'
              ? 'completed'
              : item.status === 'failed'
                ? 'failed'
                : 'skipped',
      ...(item.error ? { error: item.error } : {}),
    };
  }
  return steps;
}

function recordTaskId(taskId: string): void {
  try {
    const raw = sessionStorage.getItem('marketing.taskIds');
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [taskId, ...ids.filter((id) => id !== taskId)].slice(0, 50);
    sessionStorage.setItem('marketing.taskIds', JSON.stringify(next));
  } catch {
    // 忽略
  }
}

export function useAsyncGeneration({
  onResult,
  onGeneratingChange,
  onProgress,
}: UseAsyncGenerationProps) {
  const { detail, poll } = useTaskPolling();
  const handledTaskRef = useRef<string | null>(null);
  const activeTaskRef = useRef<string | null>(null);

  useEffect(() => {
    if (!detail || activeTaskRef.current !== detail.id) return;
    if (TERMINAL_TASK_STATUSES.has(detail.status)) {
      if (handledTaskRef.current === detail.id) return;
      handledTaskRef.current = detail.id;
      onGeneratingChange(false);
      onProgress?.(null);

      const result = (detail.result ?? {}) as GenerateTaskDataResult;
      const data: GenerateTaskData = {
        taskId: detail.id,
        status: detail.status as GenerateTaskData['status'],
        result,
        steps: itemsToSteps(detail.items),
        ...(detail.error ? { error: detail.error } : {}),
      };
      onResult(data);

      if (detail.status === 'completed') {
        toast.success('生成完成');
      } else if (detail.status === 'partial_failed') {
        toast.warning('部分内容生成失败，成功内容已保留');
      } else if (detail.status === 'cancelled') {
        toast.warning('任务已取消');
      } else {
        toast.error(detail.error || '生成失败');
      }
    } else {
      onProgress?.(detail);
    }
  }, [detail, onGeneratingChange, onProgress, onResult]);

  const submit = useCallback(
    async (payload: unknown): Promise<void> => {
      onGeneratingChange(true);
      handledTaskRef.current = null;
      try {
        const response = await fetch('/api/marketing/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || '提交失败');
        }
        const taskId = data.data.taskId as string;
        activeTaskRef.current = taskId;
        recordTaskId(taskId);
        await poll(taskId);
      } catch (error) {
        onGeneratingChange(false);
        toast.error(error instanceof Error ? error.message : '提交失败');
      }
    },
    [onGeneratingChange, poll]
  );

  return { submit, detail };
}
