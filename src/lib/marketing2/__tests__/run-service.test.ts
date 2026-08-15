import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
}));
vi.mock('@/lib/marketing/async/aggregation', () => ({
  appendTaskEvent: vi.fn(),
}));

import { computeStepStates } from '@/lib/marketing2/run-service';
import type { MarketingTask, MarketingTaskItem } from '@prisma/client';

// ============================================
// 步骤状态推导测试（V2 5.2 / 8.1）
// idle -> running -> awaiting_review -> approved；失败分支
// ============================================

function makeTask(stepResults: Record<string, unknown> = {}): MarketingTask {
  return {
    workflowKey: 'marketing2-image-detail-full',
    stepResults,
  } as unknown as MarketingTask;
}

function makeItem(stepKey: string, status: string): MarketingTaskItem {
  return { stepKey, status } as unknown as MarketingTaskItem;
}

describe('computeStepStates', () => {
  it('审批与跳过记录优先于 item 状态', () => {
    const states = computeStepStates(
      makeTask({
        material_validate: { approved: true },
        background_cleanup: { skipped: true, reason: '背景干净' },
      }),
      []
    );
    expect(states.material_validate).toBe('approved');
    expect(states.background_cleanup).toBe('skipped');
    expect(states.visual_analysis).toBe('idle');
  });

  it('存在 pending/running item 时为 running', () => {
    const states = computeStepStates(makeTask(), [
      makeItem('batch_generation', 'completed'),
      makeItem('batch_generation', 'running'),
    ]);
    expect(states.batch_generation).toBe('running');
  });

  it('全部完成未审批时为 awaiting_review', () => {
    const states = computeStepStates(makeTask(), [
      makeItem('visual_analysis', 'completed'),
    ]);
    expect(states.visual_analysis).toBe('awaiting_review');
  });

  it('存在失败项时为 failed（已确认上游不受影响）', () => {
    const states = computeStepStates(
      makeTask({ visual_analysis: { approved: true } }),
      [makeItem('batch_generation', 'completed'), makeItem('batch_generation', 'failed')]
    );
    expect(states.visual_analysis).toBe('approved');
    expect(states.batch_generation).toBe('failed');
  });
});
