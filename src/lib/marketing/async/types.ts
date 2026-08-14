// ============================================
// 营销异步任务基础设施类型（V3 Phase 6）
// ============================================

export type MarketingItemKind =
  | 'analysis'
  | 'copywriting'
  | 'mainPrompts'
  | 'detailPrompts'
  | `translate:${string}`
  | 'seo'
  | 'geo'
  | `insight:${string}`;

export type MarketingEventType =
  | 'task_created'
  | 'item_started'
  | 'item_completed'
  | 'item_failed'
  | 'item_retried'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'cancel_requested';

export type MarketingItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export const ITEM_TERMINAL_STATUSES: MarketingItemStatus[] = [
  'completed',
  'failed',
  'skipped',
  'cancelled',
];

/** 租约时长：单次模型调用上限（120s）加上缓冲。 */
export const LEASE_DURATION_MS = 5 * 60 * 1000;

/** Worker 轮询间隔。 */
export const WORKER_POLL_INTERVAL_MS = 1000;

/** 单 Worker 最大并发领取数。 */
export const WORKER_MAX_CONCURRENT = 3;
