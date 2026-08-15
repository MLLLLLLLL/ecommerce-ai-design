'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import type { RunDetail } from '@/components/marketing2/hooks/use-marketing2-run';
import { getPromptSlotDefinitions, promptSlotKey, type PromptSlotDefinition } from '@/lib/marketing2/prompt-planning';

// ============================================
// 阶段三：视觉策划与提示词（交互 6.3）
// 产品视觉识别结果展示 + 外观锁定描述/规划编辑。
// 编辑只提交受 Schema 约束的字段，由服务端审批时校验。
// ============================================

export interface PlanItemEdit {
  kind: 'main_image' | 'detail_page';
  index: number;
  title?: string;
  keyword: string;
  responsibility: string;
  sellPoint: string;
  placeholderParams: string[];
  prompt: string;
  negativePrompt?: string;
  textModules: string[];
}

export interface StepEdits {
  appearanceLock?: string;
  plans?: PlanItemEdit[];
}

export function PromptPlanningStep({
  detail,
  editableAnalysis,
  editablePlans,
  edits,
  onEditsChange,
  onRetryItem,
}: {
  detail: RunDetail;
  editableAnalysis: boolean;
  editablePlans: boolean;
  edits: StepEdits | null;
  onEditsChange: (edits: StepEdits | null) => void;
  onRetryItem?: (itemId: string) => void;
}) {
  const [clockNow, setClockNow] = useState(() => Date.now());
  const analysis = (detail.task.stepResults?.visual_analysis?.result ??
    detail.items.find((item) => item.kind === 'visual_analysis' && item.status === 'completed')?.result ??
    null) as {
    appearanceLock?: string;
    visibleTexts?: string[];
    materials?: string[];
    structure?: string;
    risks?: string[];
    pendingFacts?: string[];
  } | null;

  const planningResult = (detail.task.stepResults?.prompt_planning?.result ??
    detail.items.find((item) => item.kind === 'prompt_planning' && item.status === 'completed')?.result ??
    null) as { plans?: PlanItemEdit[] } | null;

  const expectedSlots = useMemo(() => {
    const planningStarted = detail.task.currentStep === 'prompt_planning' ||
      detail.task.stepResults?.prompt_planning !== undefined ||
      detail.items.some((item) => item.kind === 'prompt_outline' || item.kind.startsWith('prompt_plan:'));
    if (!planningStarted && !planningResult?.plans?.length) return [];
    const input = (detail.task.input ?? {}) as Record<string, unknown>;
    return getPromptSlotDefinitions(input.mainImageCount, input.detailPageCount);
  }, [detail.items, detail.task.currentStep, detail.task.input, detail.task.stepResults, planningResult?.plans?.length]);

  const planItems = useMemo(
    () => detail.items.filter((item) => item.kind.startsWith('prompt_plan:')),
    [detail.items]
  );
  const outlineItem = detail.items.find((item) => item.kind === 'prompt_outline');

  const displayedPlans = useMemo(() => {
    if (planItems.length === 0 && planningResult?.plans?.length) {
      return planningResult.plans.map((plan) => ({ plan, status: 'completed', itemId: '', error: null, startedAt: null }));
    }
    const outlineSlots = (detail.items.find((item) => item.kind === 'prompt_outline')?.result as { slots?: PromptSlotDefinition[] } | null)?.slots ?? [];
    return expectedSlots.map((slot) => {
      const item = planItems.find((candidate) => candidate.kind === `prompt_plan:${slot.kind}:${slot.index}`);
      const result = item?.result as PlanItemEdit | null;
      const outline = outlineSlots.find((candidate) => promptSlotKey(candidate.kind, candidate.index) === promptSlotKey(slot.kind, slot.index));
      return {
        plan: result ? { ...slot, ...outline, ...result } : { ...slot, ...outline, keyword: '', prompt: '', placeholderParams: [], negativePrompt: '', textModules: [] },
        status: item?.status ?? 'pending',
        itemId: item?.id ?? '',
        error: item?.error ?? null,
        startedAt: item?.startedAt ?? null,
      };
    });
  }, [detail.items, expectedSlots, planItems, planningResult]);

  const hasRunningPlan = displayedPlans.some((item) => item.status === 'running' || item.status === 'pending');

  useEffect(() => {
    if (!hasRunningPlan) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningPlan]);

  // 从最新结果初始化本地编辑副本
  useEffect(() => {
    if (editablePlans && planningResult?.plans && !edits?.plans) {
      onEditsChange({ ...edits, plans: planningResult.plans.map((plan) => ({ ...plan })) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editablePlans, Boolean(planningResult?.plans)]);

  const plans = edits?.plans ?? displayedPlans.map((item) => item.plan);
  const completedPlanCount = displayedPlans.filter((item) => item.status === 'completed').length;
  const appearanceLock = edits?.appearanceLock ?? analysis?.appearanceLock ?? '';

  const updatePlan = (index: number, patch: Partial<PlanItemEdit>) => {
    if (!edits?.plans) return;
    const next = edits.plans.map((plan, i) => (i === index ? { ...plan, ...patch } : plan));
    onEditsChange({ ...edits, plans: next });
  };

  return (
    <div className="space-y-6">
      {analysis && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">产品视觉识别</h3>
            {editableAnalysis && <Badge variant="secondary">外观锁定可编辑，确认时保存</Badge>}
          </div>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {editableAnalysis ? (
              <Textarea
                rows={4}
                value={appearanceLock}
                onChange={(e) => onEditsChange({ ...edits, appearanceLock: e.target.value })}
              />
            ) : (
              <p className="whitespace-pre-wrap">{appearanceLock}</p>
            )}
            {analysis.visibleTexts && analysis.visibleTexts.length > 0 && (
              <p className="text-xs text-muted-foreground">可见文字：{analysis.visibleTexts.join('、')}</p>
            )}
            {analysis.materials && analysis.materials.length > 0 && (
              <p className="text-xs text-muted-foreground">材质：{analysis.materials.join('、')}</p>
            )}
            {analysis.risks && analysis.risks.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.risks.map((risk, index) => (
                  <Badge key={index} variant="secondary" className="bg-amber-100 text-amber-800">
                    {risk}
                  </Badge>
                ))}
              </div>
            )}
            {analysis.pendingFacts && analysis.pendingFacts.length > 0 && (
              <p className="text-xs text-amber-600">待确认事实：{analysis.pendingFacts.join('、')}（不会补造数值）</p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">主图与详情页规划（{displayedPlans.length > 0 ? `${completedPlanCount}/${displayedPlans.length} 已完成` : `${plans.length} 条`}）</h3>
          {editablePlans && <Badge variant="secondary">编辑中，确认时保存</Badge>}
        </div>
        {outlineItem?.status === 'failed' && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span>{outlineItem.error ?? '方案框架生成失败'}</span>
            {onRetryItem && <Button type="button" variant="outline" size="sm" onClick={() => onRetryItem(outlineItem.id)}><RotateCcw className="mr-1 h-3 w-3" />重试框架</Button>}
          </div>
        )}
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未生成规划。请先执行本步骤。</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan, index) => {
              const itemState = displayedPlans[index];
              const elapsed = itemState?.startedAt ? Math.max(0, Math.floor((clockNow - Date.parse(itemState.startedAt)) / 1000)) : 0;
              const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
              return <div key={`${plan.kind}-${plan.index}`} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{plan.kind === 'main_image' ? '主图' : '详情页'} {plan.index}</Badge>
                  {plan.title && <span className="font-medium text-foreground">{plan.title}</span>}
                  {itemState?.status === 'pending' && <Badge variant="secondary">等待生成</Badge>}
                  {itemState?.status === 'running' && <Badge variant="secondary" className="text-blue-700"><Loader2 className="mr-1 h-3 w-3 animate-spin" />生成中 {elapsedLabel}</Badge>}
                  {itemState?.status === 'failed' && <Badge variant="destructive">生成失败</Badge>}
                  {itemState?.status === 'completed' && <Badge variant="secondary" className="text-emerald-700">已完成</Badge>}
                  {editablePlans ? (
                    <Input
                      className="h-7 w-36"
                      placeholder="关键词"
                      value={plan.keyword}
                      onChange={(e) => updatePlan(index, { keyword: e.target.value })}
                    />
                  ) : (
                    plan.keyword && <span className="text-muted-foreground">{plan.keyword}</span>
                  )}
                  {plan.placeholderParams.length > 0 && (
                    <span className="text-amber-600">待补充参数：{plan.placeholderParams.join('、')}</span>
                  )}
                </div>
                {itemState?.status === 'failed' && (
                  <div className="flex items-center justify-between gap-3 text-xs text-destructive">
                    <span>{itemState.error ?? '该方案生成失败'}</span>
                    {onRetryItem && itemState.itemId && <Button type="button" variant="outline" size="sm" onClick={() => onRetryItem(itemState.itemId)}><RotateCcw className="mr-1 h-3 w-3" />重试</Button>}
                  </div>
                )}
                {itemState?.status === 'pending' && <p className="text-sm text-muted-foreground">已创建方案位，等待 Worker 处理。</p>}
                {itemState?.status === 'running' && <p className="text-sm text-blue-700">正在生成当前方案，请稍等。</p>}
                {itemState?.status === 'completed' && (editablePlans ? (
                  <>
                    <Input
                      placeholder="页面职责"
                      value={plan.responsibility}
                      onChange={(e) => updatePlan(index, { responsibility: e.target.value })}
                    />
                    <Textarea
                      rows={3}
                      placeholder="生图提示词"
                      value={plan.prompt}
                      onChange={(e) => updatePlan(index, { prompt: e.target.value })}
                    />
                    <Input
                      placeholder="禁止内容（可选）"
                      value={plan.negativePrompt ?? ''}
                      onChange={(e) => updatePlan(index, { negativePrompt: e.target.value })}
                    />
                  </>
                ) : (
                  <>
                    {plan.responsibility && <p className="text-xs text-muted-foreground">职责：{plan.responsibility}</p>}
                    <p className="whitespace-pre-wrap text-sm">{plan.prompt}</p>
                    {plan.negativePrompt && (
                      <p className="text-xs text-muted-foreground">禁止：{plan.negativePrompt}</p>
                    )}
                  </>
                ))}
              </div>
            })}
          </div>
        )}
      </section>
    </div>
  );
}
