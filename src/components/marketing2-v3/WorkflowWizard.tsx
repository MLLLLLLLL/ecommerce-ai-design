'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Loader2, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MaterialStep } from '@/components/marketing2/steps/MaterialStep';
import { BackgroundCleanupStep } from '@/components/marketing2/steps/BackgroundCleanupStep';
import { PromptPlanningStep, type StepEdits } from '@/components/marketing2/steps/PromptPlanningStep';
import { BatchGenerationStep } from '@/components/marketing2/steps/BatchGenerationStep';
import { QualityRepairStep, type QualityOverride } from '@/components/marketing2/steps/QualityRepairStep';
import { marketing2Api, useMarketing2Run, type RunDetail } from '@/components/marketing2/hooks/use-marketing2-run';
import type { ModelCapabilityKey, ModelConfigSummary } from '@/types/model-config';

type V3Page = 'product_preparation' | 'prompt_generation' | 'image_generation' | 'quality_repair';
type V3Selections = {
  backgroundCleanup?: string;
  visualAnalysis?: string;
  promptGeneration?: string;
  imageGeneration: { items: Record<string, string> };
  quality: { items: Record<string, string> };
  repair: { items: Record<string, string> };
};

const EMPTY_SELECTIONS: V3Selections = {
  imageGeneration: { items: {} }, quality: { items: {} }, repair: { items: {} },
};

const PAGE_STEPS = [
  { key: 'material_validate', title: '准备产品图' },
  { key: 'background_cleanup', title: '底图精修（可选）' },
  { key: 'prompt_planning', title: '提示词策划' },
  { key: 'batch_generation', title: '逐张生图' },
  { key: 'quality_repair', title: '质检返修' },
] as const;

const RUNNING_STEP_LABELS: Record<string, string> = {
  material_validate: '正在校验产品图与参数',
  background_cleanup: '正在进行底图精修',
  visual_analysis: '正在进行产品视觉识别',
  prompt_planning: '正在生成主图与详情页提示词',
  batch_generation: '正在逐张生成营销图片',
  quality_repair: '正在进行图片质检与返修',
};

const DEFAULT_INPUT: Record<string, unknown> = {
  productImages: [], primaryImageId: '', cleanupEnabled: false, productName: '', platform: 'taobao', language: 'zh-CN',
  mainImageCount: 'auto', detailPageCount: 'auto', mainImageRatio: '1:1', detailPageRatio: '3:4', sellPoints: [],
};

function getPage(detail: RunDetail | null): V3Page {
  const step = detail?.task.currentStep;
  if (step === 'visual_analysis' || step === 'prompt_planning') return 'prompt_generation';
  if (step === 'batch_generation') return 'image_generation';
  if (step === 'quality_repair') return 'quality_repair';
  return 'product_preparation';
}

function formatElapsed(startedAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [minutes, seconds].map((value) => String(value).padStart(2, '0'));
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${parts.join(':')}` : parts.join(':');
}

function supports(model: ModelConfigSummary, capabilities: ModelCapabilityKey[]) {
  return model.isActive && model.testStatus === 'passed' && capabilities.every((key) => model.capabilities[key]);
}

function selectionFrom(detail: RunDetail | null): V3Selections {
  const raw = detail?.task.stepModels;
  if (!raw || typeof raw !== 'object') return EMPTY_SELECTIONS;
  const value = raw as Partial<V3Selections>;
  return {
    backgroundCleanup: value.backgroundCleanup,
    visualAnalysis: value.visualAnalysis,
    promptGeneration: value.promptGeneration,
    imageGeneration: { items: value.imageGeneration?.items ?? {} },
    quality: { items: value.quality?.items ?? {} },
    repair: { items: value.repair?.items ?? {} },
  };
}

function ModelSelect({ label, value, models, capabilities, onChange }: {
  label: React.ReactNode; value?: string; models: ModelConfigSummary[]; capabilities: ModelCapabilityKey[]; onChange: (modelId: string) => void;
}) {
  const candidates = models.filter((model) => supports(model, capabilities));
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {candidates.length === 0 ? (
        <p className="text-xs text-amber-700">暂无符合条件且实测通过的模型，<Link href="/settings" className="underline">前往设置</Link></p>
      ) : (
        <Select value={value ?? ''} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
          <SelectContent>{candidates.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

export function WorkflowWizardV3({ initialRunId }: { initialRunId?: string | null }) {
  const [runId, setRunId] = useState(initialRunId ?? null);
  const { detail, refresh, loading } = useMarketing2Run(runId);
  const [input, setInput] = useState<Record<string, unknown>>(DEFAULT_INPUT);
  const [models, setModels] = useState<ModelConfigSummary[]>([]);
  const [selections, setSelections] = useState<V3Selections>(EMPTY_SELECTIONS);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [localRunning, setLocalRunning] = useState<{ stepKey: string; startedAt: number } | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [edits, setEdits] = useState<StepEdits | null>(null);
  const [overrides, setOverrides] = useState<QualityOverride[]>([]);
  const [syncedTaskKey, setSyncedTaskKey] = useState<string | null>(null);

  useEffect(() => {
    const loadModels = () => marketing2Api.models().then(setModels).catch(() => undefined);
    void loadModels();
    const handleFocus = () => void loadModels();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  const taskSyncKey = detail ? `${detail.task.id}:${detail.task.taskVersion}` : null;
  if (detail && taskSyncKey !== syncedTaskKey) {
    setSyncedTaskKey(taskSyncKey);
    setInput((detail.task.input ?? DEFAULT_INPUT) as Record<string, unknown>);
    setSelections(selectionFrom(detail));
    setDirty(false);
  }

  const page = getPage(detail);
  const states = detail?.stepStates ?? {};
  const cleanupEnabled = input.cleanupEnabled === true;
  const activeStep = detail?.task.currentStep ?? 'material_validate';
  const serverRunning = detail?.task.status === 'running_step' || states[activeStep] === 'running';
  const runningItemStartedAt = useMemo(() => {
    const timestamps = (detail?.items ?? [])
      .filter((item) => item.stepKey === activeStep && ['pending', 'running'].includes(item.status))
      .map((item) => Date.parse(item.startedAt ?? item.createdAt))
      .filter(Number.isFinite);
    return timestamps.length > 0 ? Math.min(...timestamps) : null;
  }, [activeStep, detail?.items]);
  const visibleLocalRunning = localRunning && (busy || serverRunning) ? localRunning : null;
  const runningStepKey = visibleLocalRunning?.stepKey ?? (serverRunning ? activeStep : null);
  const taskUpdatedAt = Date.parse(detail?.task.updatedAt ?? '');
  const runningStartedAt = visibleLocalRunning?.startedAt ?? runningItemStartedAt ??
    (serverRunning && Number.isFinite(taskUpdatedAt) ? taskUpdatedAt : null);
  const taskRunning = runningStepKey !== null && runningStartedAt !== null;
  const plans = useMemo(() => {
    const result = detail?.task.stepResults?.prompt_planning?.result as { plans?: { kind: string; index: number; keyword?: string; prompt?: string }[] } | undefined;
    return result?.plans ?? [];
  }, [detail]);

  useEffect(() => {
    if (!taskRunning) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [taskRunning]);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : '操作失败'); } finally { busyRef.current = false; setBusy(false); }
  }, []);

  const saveDraft = useCallback(async () => {
    const images = (input.productImages as string[]) ?? [];
    const primaryImageId = typeof input.primaryImageId === 'string' && images.includes(input.primaryImageId)
      ? input.primaryImageId : images[0] ?? '';
    const nextInput = { ...input, primaryImageId };
    if (!runId) {
      const task = await marketing2Api.createRun({ workflowKey: 'marketing2-image-detail-full', workflowVersion: 3, input: nextInput, stepModels: selections });
      setRunId(task.id);
      window.history.replaceState(null, '', `/marketing2/marketing2-image-detail-full?runId=${task.id}`);
      setInput(nextInput); setDirty(false);
      return task.id;
    }
    if (dirty && detail) {
      await marketing2Api.patchRun(runId, { expectedVersion: detail.task.taskVersion, input: nextInput });
      setInput(nextInput); setDirty(false); await refresh();
    }
    return runId;
  }, [detail, dirty, input, refresh, runId, selections]);

  const saveSelection = useCallback(async (scopeKey: string, modelId: string) => {
    if (!detail || !runId) { toast.info('请先保存产品图和任务信息'); return; }
    await marketing2Api.patchModelSelections(runId, { expectedVersion: detail.task.taskVersion, changes: [{ scopeKey, modelId }] });
    await refresh();
  }, [detail, refresh, runId]);

  const execute = (stepKey: string) => {
    setLocalRunning({ stepKey, startedAt: clockNow });
    return runAction(async () => {
      try {
        const id = await saveDraft();
        if (!id) return;
        const current = await marketing2Api.detail(id);
        await marketing2Api.execute(id, stepKey, current.task.taskVersion);
        await refresh();
      } catch (error) {
        setLocalRunning(null);
        throw error;
      }
    });
  };
  const stopTask = () => {
    if (!runId || !taskRunning || detail?.task.cancelRequestedAt) return;
    if (!window.confirm('确定停止当前任务吗？已完成的结果会保留，正在执行的项目完成后停止后续处理。')) return;
    void runAction(async () => {
      await marketing2Api.cancel(runId);
      await refresh();
      toast.success('已提交停止请求');
    });
  };
  const forceStopTask = () => {
    if (!runId || !taskRunning || !detail?.task.cancelRequestedAt) return;
    if (!window.confirm('确定强制停止任务吗？当前未完成项目将立即取消，已完成结果会保留。')) return;
    void runAction(async () => {
      await marketing2Api.forceCancel(runId);
      setLocalRunning(null);
      await refresh();
      toast.success('任务已强制停止');
    });
  };
  const approve = (stepKey: string) => runAction(async () => {
    if (!detail || !runId) return;
    const body: { expectedVersion: number; edits?: unknown; overrides?: QualityOverride[] } = { expectedVersion: detail.task.taskVersion };
    if (stepKey === 'prompt_planning' && edits?.plans) body.edits = { plans: edits.plans };
    if (stepKey === 'visual_analysis' && edits?.appearanceLock) body.edits = { appearanceLock: edits.appearanceLock };
    if (stepKey === 'quality_repair' && overrides.length) body.overrides = overrides;
    await marketing2Api.approve(runId, stepKey, body); setEdits(null); setOverrides([]); await refresh();
  });
  const skipCleanup = () => runAction(async () => {
    if (!detail || !runId) return;
    await marketing2Api.skip(runId, 'background_cleanup', detail.task.taskVersion, '用户选择使用原始产品图'); await refresh();
  });

  const changeInput = (next: Record<string, unknown>) => { setInput(next); setDirty(true); };
  const stepState = (key: string) => states[key] ?? 'idle';
  const statusLabel = detail?.task.status === 'completed' ? '已完成' : detail?.task.status === 'cancelled' ? '已停止' : dirty ? '未保存' : '已保存';

  let content: React.ReactNode;
  if (page === 'product_preparation') {
    content = <div className="space-y-6">
      <MaterialStep workflowKey="marketing2-image-detail-full" value={input} onChange={changeInput} disabled={busy || stepState('material_validate') !== 'idle'} />
      {((input.productImages as string[]) ?? []).length > 1 && <div className="max-w-xs space-y-1.5">
        <Label className="text-xs text-muted-foreground">主参考图</Label>
        <Select value={(input.primaryImageId as string) || ((input.productImages as string[])[0] ?? '')} onValueChange={(primaryImageId) => changeInput({ ...input, primaryImageId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{((input.productImages as string[]) ?? []).map((image, index) => <SelectItem key={image} value={image}>产品图 {index + 1}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      <section className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-medium">精修成干净底图</h3><p className="text-xs text-muted-foreground">开启后仅精修主参考图，补充视角用于外观识别。</p></div>
          <Checkbox checked={cleanupEnabled} disabled={busy || stepState('material_validate') !== 'idle'} onCheckedChange={(checked) => changeInput({ ...input, cleanupEnabled: checked === true })} />
        </div>
        {cleanupEnabled && <ModelSelect label="底图精修图片模型" value={selections.backgroundCleanup} models={models} capabilities={['imageEditing', 'referenceImage']} onChange={(modelId) => void saveSelection('backgroundCleanup', modelId)} />}
        {detail && stepState('background_cleanup') !== 'idle' && <BackgroundCleanupStep detail={detail} onSkip={() => skipCleanup()} busy={busy} />}
      </section>
    </div>;
  } else if (page === 'prompt_generation') {
    content = <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <ModelSelect label="产品视觉识别模型" value={selections.visualAnalysis} models={models} capabilities={['vision', 'jsonMode']} onChange={(modelId) => void saveSelection('visualAnalysis', modelId)} />
        <ModelSelect label="提示词生成模型" value={selections.promptGeneration} models={models} capabilities={['jsonMode']} onChange={(modelId) => void saveSelection('promptGeneration', modelId)} />
      </div>
      {detail && <PromptPlanningStep detail={detail} editableAnalysis={activeStep === 'visual_analysis' && stepState(activeStep) === 'awaiting_review'} editablePlans={activeStep === 'prompt_planning' && stepState(activeStep) === 'awaiting_review'} edits={edits} onEditsChange={setEdits} onRetryItem={(itemId) => void runAction(async () => { if (!runId) return; await marketing2Api.retryItem(runId, itemId); await refresh(); })} />}
    </div>;
  } else if (page === 'image_generation') {
    content = <div className="space-y-5">
      {plans.length > 0 && <section className="space-y-3"><h3 className="text-sm font-medium">逐张图片模型</h3><div className="grid gap-3 md:grid-cols-2">{plans.map((plan, planIndex) => {
        const key = `${plan.kind === 'main_image' ? 'main_image' : 'detail_page'}:${plan.index}`;
        const label = `${plan.kind === 'main_image' ? '主图' : '详情页'} ${plan.index}${plan.keyword ? ` · ${plan.keyword}` : ''}`;
        return <ModelSelect key={key} label={<PromptHoverLabel label={label} prompt={plan.prompt} align={planIndex % 2 === 0 ? 'left' : 'right'} />} value={selections.imageGeneration.items[key]} models={models} capabilities={['imageGeneration', 'referenceImage']} onChange={(modelId) => void saveSelection(`imageGeneration:${key}`, modelId)} />;
      })}</div></section>}
      {detail && <BatchGenerationStep detail={detail} onRetryItem={(itemId) => void runAction(async () => { if (!runId) return; await marketing2Api.retryItem(runId, itemId); await refresh(); })} onRetryAllFailed={() => undefined} onPauseToggle={() => undefined} onBatchSubmitChange={() => undefined} busy={busy} />}
    </div>;
  } else {
    const assets = detail?.assets.filter((asset) => asset.stepKey === 'batch_generation') ?? [];
    const selectedQualityModelIds = assets
      .map((asset) => selections.quality.items[asset.id])
      .filter(Boolean);
    const bulkQualityModelId =
      selectedQualityModelIds.length === assets.length && new Set(selectedQualityModelIds).size === 1
        ? selectedQualityModelIds[0]
        : undefined;
    content = <div className="space-y-5">
      {assets.length > 0 && <section className="space-y-3"><h3 className="text-sm font-medium">逐图质检模型</h3><div className="max-w-md border-b pb-3"><ModelSelect label="一键全部使用质检模型" value={bulkQualityModelId} models={models} capabilities={['vision', 'jsonMode']} onChange={(modelId) => void runAction(async () => {
        if (!runId || !detail) return;
        await marketing2Api.patchModelSelections(runId, {
          expectedVersion: detail.task.taskVersion,
          changes: assets.map((asset) => ({ scopeKey: `quality:${asset.id}`, modelId })),
        });
        await refresh();
        const modelName = models.find((model) => model.id === modelId)?.name ?? '所选模型';
        toast.success(`已为 ${assets.length} 张图片统一使用${modelName}`);
      })} /></div><div className="grid gap-3 md:grid-cols-2">{assets.map((asset) => <ModelSelect key={asset.id} label={asset.filename} value={selections.quality.items[asset.id]} models={models} capabilities={['vision', 'jsonMode']} onChange={(modelId) => void saveSelection(`quality:${asset.id}`, modelId)} />)}</div>
        <ModelSelect label="返修图片模型" value={selections.repair.items.default} models={models} capabilities={['imageEditing', 'referenceImage']} onChange={(modelId) => void saveSelection('repair:default', modelId)} />
      </section>}
      {detail && <QualityRepairStep detail={detail} onRepair={(repairs) => void runAction(async () => { if (!runId || !detail) return; await marketing2Api.repair(runId, { expectedVersion: detail.task.taskVersion, repairs }); await refresh(); })} onRetryItem={(itemId) => void runAction(async () => { if (!runId) return; await marketing2Api.retryItem(runId, itemId); await refresh(); })} overrides={overrides} onOverridesChange={setOverrides} busy={busy} />}
    </div>;
  }

  const primaryAction = () => {
    if (!detail) return { label: '保存并继续', onClick: () => void runAction(async () => { await saveDraft(); toast.success('草稿已保存'); }) };
    if (activeStep === 'material_validate') return stepState(activeStep) === 'awaiting_review' ? { label: '确认产品图', onClick: () => void approve(activeStep) } : { label: '保存并校验产品图', onClick: () => void execute(activeStep) };
    if (activeStep === 'background_cleanup') {
      if (!cleanupEnabled) return { label: '跳过精修并继续', onClick: () => void skipCleanup() };
      return stepState(activeStep) === 'awaiting_review' ? { label: '接受底图并继续', onClick: () => void approve(activeStep) } : { label: '开始精修', onClick: () => void execute(activeStep) };
    }
    if (activeStep === 'visual_analysis') return stepState(activeStep) === 'awaiting_review' ? { label: '确认识别结果', onClick: () => void approve(activeStep) } : { label: '生成产品识别', onClick: () => void execute(activeStep) };
    if (activeStep === 'prompt_planning') return stepState(activeStep) === 'awaiting_review' ? { label: '确认提示词并进入生图', onClick: () => void approve(activeStep) } : { label: '生成整套提示词', onClick: () => void execute(activeStep) };
    if (activeStep === 'batch_generation') return stepState(activeStep) === 'awaiting_review' ? { label: '接受图片并进入质检', onClick: () => void approve(activeStep) } : { label: '开始逐张生图', onClick: () => void execute(activeStep) };
    return stepState(activeStep) === 'awaiting_review' ? { label: '完成任务', onClick: () => void approve(activeStep) } : { label: '开始质检', onClick: () => void execute(activeStep) };
  };
  const action = primaryAction();

  return <div className="container mx-auto space-y-5 p-4 pb-28 sm:p-6 sm:pb-28">
    <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" size="sm" asChild><Link href="/marketing2"><ChevronLeft />返回营销助手2</Link></Button><h1 className="text-lg font-semibold">{typeof input.productName === 'string' && input.productName ? `${input.productName} 主图详情页` : '主图详情页全自动生成'}</h1><Badge variant="secondary">{statusLabel}</Badge>{busy && <Loader2 className="h-4 w-4 animate-spin" />}</div>
    {taskRunning && runningStepKey && runningStartedAt !== null && <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"><div className="flex min-w-0 items-center gap-3"><Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-300" /><div><p className="text-sm font-semibold">{detail?.task.cancelRequestedAt ? '正在停止任务' : '任务正在进行中'}</p><p className="text-xs text-blue-700 dark:text-blue-200">{detail?.task.cancelRequestedAt ? '已提交停止请求，当前项目完成后停止后续处理' : `${RUNNING_STEP_LABELS[runningStepKey] ?? '正在处理当前步骤'}，请稍等`}</p></div></div><div className="flex items-center gap-2"><span className="mr-1 shrink-0 text-sm font-medium tabular-nums">已运行 {formatElapsed(runningStartedAt, clockNow)}</span><Button type="button" variant="destructive" size="sm" disabled={busy || Boolean(detail?.task.cancelRequestedAt)} onClick={stopTask}><Square className="mr-2 h-3.5 w-3.5" />{detail?.task.cancelRequestedAt ? '停止中...' : '停止任务'}</Button>{detail?.task.cancelRequestedAt && <Button type="button" variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={forceStopTask}><Square className="mr-2 h-3.5 w-3.5" />强制停止</Button>}</div></div>}
    <nav className="grid gap-2 sm:grid-cols-5" aria-label="工作流进度">{PAGE_STEPS.map((step, index) => { const state = stepState(step.key); const done = state === 'approved' || state === 'skipped'; const current = activeStep === step.key || (step.key === 'prompt_planning' && activeStep === 'visual_analysis'); return <div key={step.key} className={`min-w-0 border-l-2 px-3 py-2 text-xs ${current ? 'border-primary bg-accent' : done ? 'border-emerald-500' : 'border-muted'}`}><div className="flex items-center gap-1 font-medium">{done ? <Check className="h-3 w-3 text-emerald-600" /> : <span>{index + 1}.</span>}<span className="truncate">{step.title}</span></div><span className="text-muted-foreground">{state === 'skipped' ? '已跳过' : done ? '已完成' : state === 'awaiting_review' ? '待确认' : state === 'running' ? '处理中' : '未开始'}</span></div>; })}</nav>
    {loading ? <p className="py-16 text-center text-sm text-muted-foreground">正在恢复任务...</p> : <Card><CardContent className="p-4 sm:p-6">{content}</CardContent></Card>}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur"><div className="container mx-auto flex items-center justify-end gap-3 p-3 sm:px-6"><Button variant="default" disabled={busy || taskRunning || page === 'product_preparation'} onClick={() => window.history.back()}>上一步</Button><Button disabled={busy || taskRunning || detail?.task.status === 'completed'} onClick={action.onClick}>{taskRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />进行中</> : action.label}</Button></div></div>
  </div>;
}

function PromptHoverLabel({
  label,
  prompt,
  align,
}: {
  label: string;
  prompt?: string;
  align: 'left' | 'right';
}) {
  if (!prompt) return label;
  return (
    <span className="group relative inline-block max-w-full" tabIndex={0}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/70">{label}</span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-2 w-[min(36rem,calc(100vw-2rem))] whitespace-normal rounded border bg-popover p-3 text-left text-xs font-normal leading-5 text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        {prompt}
      </span>
    </span>
  );
}
