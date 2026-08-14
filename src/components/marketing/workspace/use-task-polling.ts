'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================
// 任务详情轮询（V3 Phase 6）
// 生成 API 异步化后，前端轮询详情直至终态。
// ============================================

export const TERMINAL_TASK_STATUSES = new Set([
  'completed',
  'partial_failed',
  'failed',
  'cancelled',
]);

export interface PollingItem {
  id: string;
  kind: string;
  role: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
}

export interface TaskDetail {
  id: string;
  module: string;
  status: string;
  productName: string;
  result: unknown;
  error: string | null;
  cancelRequestedAt: string | null;
  items: PollingItem[];
  createdAt: string;
  updatedAt: string;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_COUNT = 400;

export function useTaskPolling() {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async (taskId: string) => {
    stop();
    let count = 0;
    const tick = async () => {
      try {
        const response = await fetch(`/api/marketing/tasks/${taskId}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          setError(data.error?.message || '查询任务失败');
          return;
        }
        const next = data.data as TaskDetail;
        setDetail(next);
        if (TERMINAL_TASK_STATUSES.has(next.status)) {
          return;
        }
        count += 1;
        if (count >= MAX_POLL_COUNT) {
          setError('任务执行时间过长，请在全部作品中查看结果');
          return;
        }
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : '查询任务失败');
      }
    };
    await tick();
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { detail, error, poll, stop };
}
