'use client';

import { WorkflowCard } from '@/components/marketing2/WorkflowCard';
import type { WorkflowCardApi } from '@/components/marketing2/hooks/use-marketing2-run';

/** 响应式卡片网格：桌面 3 列，平板 2 列，移动端 1 列（交互 4.1）。 */
export function WorkflowCardGrid({ workflows }: { workflows: WorkflowCardApi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {workflows.map((workflow) => (
        <WorkflowCard key={workflow.key} workflow={workflow} />
      ))}
    </div>
  );
}
