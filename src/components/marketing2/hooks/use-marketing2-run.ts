'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelConfigSummary } from '@/types/model-config';

// ============================================
// 营销助手2前端数据层
// 统一提交 expectedVersion 与 Idempotency-Key；
// VERSION_CONFLICT 时自动重新拉取详情（V2 8.2）。
// ============================================

export interface WorkflowCardApi {
  key: string;
  version: number;
  title: string;
  description: string;
  requiredInputs: string[];
  optionalInputs: string[];
  outputTypes: string[];
  importSources: string[];
  steps: {
    key: string;
    order: number;
    title: string;
    requiredCapabilities: string[];
    allowSkip: boolean;
  }[];
  cardStatus: 'ready' | 'needs_models' | 'resumable' | 'has_history' | 'unavailable';
  missingCapabilities: string[];
  resumableCount: number;
  completedCount: number;
  settingsUrl: string;
}

export interface RunSummary {
  id: string;
  workflowKey: string | null;
  title: string;
  status: string;
  currentStep: string | null;
  taskVersion: number;
  awaitingReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RunItemApi {
  id: string;
  kind: string;
  stepKey: string | null;
  status: string;
  attempts: number;
  input: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  createdAt: string;
}

export interface RunDetail {
  task: {
    id: string;
    workflowKey: string | null;
    productName: string;
    productImages: string[];
    platform: string;
    language: string;
    status: string;
    currentStep: string | null;
    taskVersion: number;
    awaitingReview: boolean;
    pausedAt: string | null;
    cancelRequestedAt: string | null;
    error: string | null;
    input: Record<string, unknown> | null;
    workflowVersion: number;
    stepModels: Record<string, unknown> | null;
    stepResults: Record<string, { approved?: boolean; skipped?: boolean; reason?: string; result?: Record<string, unknown> }> | null;
    updatedAt: string;
  };
  items: RunItemApi[];
  assets: { id: string; filename: string; filepath: string; stepKey: string | null; parentAssetId: string | null; revision: number; createdAt: string }[];
  events: { id: string; type: string; payload: Record<string, unknown> | null; createdAt: string }[];
  stepStates: Record<string, string>;
}

export class Marketing2ApiError extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;
  constructor(code: string, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = data.error ?? {};
    throw new Marketing2ApiError(
      error.code ?? 'UPSTREAM_FAILED',
      error.message ?? '请求失败',
      error.fieldErrors
    );
  }
  return data as T;
}

const jsonInit = (method: string, body: unknown, idempotencyKey?: string): RequestInit => ({
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  },
  body: JSON.stringify(body),
});

export const marketing2Api = {
  workflows: () =>
    request<{ workflows: WorkflowCardApi[] }>('/api/marketing2/workflows').then((d) => d.workflows),
  runs: (params?: { status?: string; workflowKey?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.workflowKey) search.set('workflowKey', params.workflowKey);
    search.set('limit', String(params?.limit ?? 20));
    return request<{ runs: RunSummary[]; nextCursor: string | null }>(
      `/api/marketing2/runs?${search.toString()}`
    );
  },
  createRun: (body: {
    workflowKey: string;
    workflowVersion?: number;
    input: unknown;
    stepModels: Record<string, unknown>;
    title?: string;
  }, idempotencyKey = crypto.randomUUID()) =>
    request<{ task: { id: string } }>('/api/marketing2/runs', jsonInit('POST', body, idempotencyKey)).then(
      (d) => d.task
    ),
  detail: (runId: string) =>
    request<RunDetail>(`/api/marketing2/runs/${runId}`),
  patchRun: (
    runId: string,
    body: { expectedVersion: number; input?: unknown; stepModels?: Record<string, unknown>; title?: string }
  ) => request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}`, jsonInit('PATCH', body)),
  deleteRun: (runId: string) =>
    request<{ success: true }>(`/api/marketing2/runs/${runId}`, { method: 'DELETE' }),
  patchModelSelections: (
    runId: string,
    body: { expectedVersion: number; changes: { scopeKey: string; modelId: string }[] }
  ) => request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}/model-selections`, jsonInit('PATCH', body)),
  execute: (runId: string, stepKey: string, expectedVersion: number) =>
    request<{ task: RunDetail['task']; deduplicated: boolean }>(
      `/api/marketing2/runs/${runId}/steps/${stepKey}/execute`,
      jsonInit('POST', { expectedVersion }, crypto.randomUUID())
    ),
  approve: (
    runId: string,
    stepKey: string,
    body: { expectedVersion: number; edits?: unknown; overrides?: { assetId: string; reason: string }[] }
  ) =>
    request<{ task: RunDetail['task'] }>(
      `/api/marketing2/runs/${runId}/steps/${stepKey}/approve`,
      jsonInit('POST', body, crypto.randomUUID())
    ),
  skip: (runId: string, stepKey: string, expectedVersion: number, reason: string) =>
    request<{ task: RunDetail['task'] }>(
      `/api/marketing2/runs/${runId}/steps/${stepKey}/skip`,
      jsonInit('POST', { expectedVersion, reason }, crypto.randomUUID())
    ),
  retryItem: (runId: string, itemId: string) =>
    request<{ item: RunItemApi }>(
      `/api/marketing2/runs/${runId}/items/${itemId}/retry`,
      jsonInit('POST', {}, crypto.randomUUID())
    ),
  repair: (
    runId: string,
    body: { expectedVersion: number; repairs: { assetId: string; issueType: string }[] }
  ) =>
    request<{ items: RunItemApi[] }>(
      `/api/marketing2/runs/${runId}/steps/quality_repair/repair`,
      jsonInit('POST', body, crypto.randomUUID())
    ),
  pause: (runId: string) =>
    request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}/pause`, jsonInit('POST', {})),
  resume: (runId: string) =>
    request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}/resume`, jsonInit('POST', {})),
  cancel: (runId: string) =>
    request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}/cancel`, jsonInit('POST', {})),
  forceCancel: (runId: string) =>
    request<{ task: RunDetail['task'] }>(`/api/marketing2/runs/${runId}/force-cancel`, jsonInit('POST', {})),
  exportRun: (runId: string, format: string) =>
    request<{ assetId: string; url: string; filename: string }>(
      `/api/marketing2/runs/${runId}/export`,
      jsonInit('POST', { format })
    ),
  models: () =>
    request<{ models: ModelConfigSummary[] }>('/api/model-configs').then((d) => d.models),
  upload: async (files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    const response = await fetch('/api/marketing/upload', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Marketing2ApiError(
        data.error?.code ?? 'UPLOAD_INVALID',
        data.error?.message ?? '上传失败',
        data.error?.fieldErrors
      );
    }
    return data.data.files as { url: string; filename: string }[];
  },
};

/** 任务详情轮询：执行中 2 秒，其余 6 秒；页面隐藏时暂停。 */
export function useMarketing2Run(runId: string | null) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<Marketing2ApiError | null>(null);
  const versionRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!runId) return;
    const requestId = ++versionRef.current;
    try {
      const data = await marketing2Api.detail(runId);
      if (requestId !== versionRef.current) return;
      setDetail(data);
      setError(null);
    } catch (err) {
      if (requestId !== versionRef.current) return;
      if (err instanceof Marketing2ApiError) setError(err);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    // 轮询外部服务端状态（合法的 effect 用途：订阅外部系统）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        const status = detail?.task.status;
        const interval =
          status === 'running_step' ? 2000 : ['draft', 'awaiting_review', 'partial_failed', 'failed', 'completed', 'cancelled'].includes(status ?? '') ? 6000 : 3000;
        await new Promise((resolve) => {
          timer = setTimeout(resolve, interval);
        });
        if (stopped) break;
        if (typeof document !== 'undefined' && document.hidden) continue;
        await refresh();
      }
    };
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, detail?.task.status]);

  return { detail, error, loading: Boolean(runId) && !detail && !error, refresh };
}
