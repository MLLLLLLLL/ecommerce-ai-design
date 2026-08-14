import type {
  ExecutionStepMap,
  ExecutionStepName,
  ExecutionStepStatus,
  MarketingTaskStatus,
} from '@/types/marketing-contract';

const STEP_NAMES: ExecutionStepName[] = ['analysis', 'copywriting', 'mainPrompts', 'detailPrompts'];

/**
 * 通用终态聚合（V3 7.2 语义，适用于任意步骤集合，如翻译的各目标语言）：
 * - 任一非 completed 的参与步骤（failed/running/pending）视为未成功。
 * - 有失败且有成功 -> partial_failed；全部失败 -> failed；全部成功 -> completed。
 * - 全部 skipped 或空步骤视为 failed（没有任何产出）。
 */
export function aggregateOutcomeStatus(
  entries: Array<{ status: ExecutionStepStatus }>
): MarketingTaskStatus {
  const considered = entries.filter((entry) => entry.status !== 'skipped');
  if (considered.length === 0) return 'failed';

  let completedCount = 0;
  let failedCount = 0;
  for (const entry of considered) {
    if (entry.status === 'completed') {
      completedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  if (failedCount > 0) {
    return completedCount > 0 ? 'partial_failed' : 'failed';
  }
  return 'completed';
}

/**
 * 根据四个执行步骤聚合任务最终状态（V3 7.2）。
 *
 * 规则：
 * - 聚合只在全部步骤到达终态后调用（内存完成后一次写回，避免丢失更新）。
 * - 任一非 completed 的参与步骤（failed/running/pending）视为未成功。
 * - 有失败且有成功 -> partial_failed；全部失败 -> failed；全部成功 -> completed。
 * - 全部 skipped 或空步骤视为 failed（没有任何产出）。
 */
export function aggregateTaskStatus(steps: ExecutionStepMap): MarketingTaskStatus {
  const considered = STEP_NAMES.map((name) => steps[name]).filter(
    (step): step is NonNullable<(typeof steps)[ExecutionStepName]> => Boolean(step)
  );
  return aggregateOutcomeStatus(considered);
}

/**
 * 判断任务是否处于执行中的中间状态。
 */
export function isTaskInProgress(status: MarketingTaskStatus): boolean {
  return status === 'draft' || status === 'analyzing' || status === 'generating';
}
