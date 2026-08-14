import { describe, expect, it } from 'vitest';
import { aggregateTaskStatus, isTaskInProgress } from '@/lib/marketing/task-status';
import type { ExecutionStepMap } from '@/types/marketing-contract';

function step(status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped') {
  return { status };
}

describe('aggregateTaskStatus（任务状态聚合，V3 7.2）', () => {
  it('全部成功 -> completed', () => {
    const steps: ExecutionStepMap = {
      analysis: step('completed'),
      copywriting: step('completed'),
      mainPrompts: step('completed'),
      detailPrompts: step('completed'),
    };
    expect(aggregateTaskStatus(steps)).toBe('completed');
  });

  it('一个失败其余成功 -> partial_failed', () => {
    const steps: ExecutionStepMap = {
      analysis: step('completed'),
      copywriting: step('failed'),
      mainPrompts: step('completed'),
      detailPrompts: step('completed'),
    };
    expect(aggregateTaskStatus(steps)).toBe('partial_failed');
  });

  it('全部失败 -> failed', () => {
    const steps: ExecutionStepMap = {
      analysis: step('failed'),
      copywriting: step('failed'),
      mainPrompts: step('failed'),
      detailPrompts: step('failed'),
    };
    expect(aggregateTaskStatus(steps)).toBe('failed');
  });

  it('skipped 步骤不参与聚合', () => {
    const steps: ExecutionStepMap = {
      analysis: step('completed'),
      copywriting: step('completed'),
      mainPrompts: step('skipped'),
      detailPrompts: step('skipped'),
    };
    expect(aggregateTaskStatus(steps)).toBe('completed');
  });

  it('全部 skipped -> failed（无任何产出）', () => {
    const steps: ExecutionStepMap = {
      analysis: step('skipped'),
      copywriting: step('skipped'),
      mainPrompts: step('skipped'),
      detailPrompts: step('skipped'),
    };
    expect(aggregateTaskStatus(steps)).toBe('failed');
  });

  it('空步骤 -> failed', () => {
    expect(aggregateTaskStatus({})).toBe('failed');
  });

  it('中间状态（running/pending）按未成功处理', () => {
    const steps: ExecutionStepMap = {
      analysis: step('completed'),
      copywriting: step('running'),
      mainPrompts: step('pending'),
      detailPrompts: step('completed'),
    };
    expect(aggregateTaskStatus(steps)).toBe('partial_failed');
  });
});

describe('isTaskInProgress', () => {
  it.each(['draft', 'analyzing', 'generating'] as const)('%s 为进行中', (status) => {
    expect(isTaskInProgress(status)).toBe(true);
  });

  it.each(['completed', 'partial_failed', 'failed'] as const)('%s 为终态', (status) => {
    expect(isTaskInProgress(status)).toBe(false);
  });
});
