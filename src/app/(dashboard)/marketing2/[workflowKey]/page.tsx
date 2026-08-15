'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkflowRunner } from '@/components/marketing2/WorkflowRunner';
import { WorkflowWizardV3 } from '@/components/marketing2-v3/WorkflowWizard';

// ============================================
// /marketing2/[workflowKey] 工作流运行页
// runId 存在时恢复任务；否则进入新建草稿流程。
// ============================================

function RunnerWithSearch({ workflowKey }: { workflowKey: string }) {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  return (
    workflowKey === 'marketing2-image-detail-full' ? (
      <WorkflowWizardV3 key={`${workflowKey}:${runId ?? 'new'}`} initialRunId={runId} />
    ) : <WorkflowRunner key={`${workflowKey}:${runId ?? 'new'}`} workflowKey={workflowKey} initialRunId={runId} />
  );
}

export default function Marketing2WorkflowPage({
  params,
}: {
  params: Promise<{ workflowKey: string }>;
}) {
  const { workflowKey } = use(params);
  return (
    <Suspense
      fallback={<p className="p-8 text-center text-sm text-muted-foreground">正在加载工作流...</p>}
    >
      <RunnerWithSearch workflowKey={workflowKey} />
    </Suspense>
  );
}
