'use client';

import { useState } from 'react';
import { Loader2, Play, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generatePlanImage } from '@/lib/canvas/nodes/engine';
import { splitPrompt, fetchDefaultTextModelId } from '@/lib/canvas/nodes/split-prompt';
import { useAIServices } from '@/hooks/useAIService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CanvasNodeData,
  CanvasNodeMetadata,
  CanvasPlanSlot,
} from '@/lib/canvas/nodes/types';

interface MultiImagePlanBodyProps {
  node: CanvasNodeData;
  onPatchMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
  onUpdateSlot: (nodeId: string, slotId: string, patch: Partial<CanvasPlanSlot>) => void;
  // 槽位结果落画布（世界坐标；多图节点右侧按槽位序号摆放）
  onResultImage: (url: string, position: { x: number; y: number }) => void;
}

/**
 * 多图规划节点（借鉴 st-image MultiImagePlan）：
 * 总提示词 → AI 拆分 N 条子提示词填充槽位 → 逐槽批量生成（部分失败可单槽重试）
 */
export function MultiImagePlanBody({
  node,
  onPatchMetadata,
  onUpdateSlot,
  onResultImage,
}: MultiImagePlanBodyProps) {
  const [splitting, setSplitting] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const meta = node.metadata;
  const slots = meta.slots || [];
  const { services, activeServiceId } = useAIServices();

  const patch = (patch: Partial<CanvasNodeMetadata>) =>
    onPatchMetadata(node.id, patch);

  const patchSlots = (next: CanvasPlanSlot[]) => patch({ slots: next });

  const updateSlot = (slotId: string, patchSlot: Partial<CanvasPlanSlot>) =>
    onUpdateSlot(node.id, slotId, patchSlot);

  // 单槽生成（全部生成/单槽重试共用）
  const runSlot = async (slot: CanvasPlanSlot, index: number) => {
    if (!slot.prompt.trim()) {
      updateSlot(slot.id, { status: 'error', error: '提示词为空' });
      return;
    }
    updateSlot(slot.id, { status: 'running', error: undefined });
    try {
      const url = await generatePlanImage({
        prompt: slot.prompt,
        referenceUrl: slot.referenceUrl || undefined,
        serviceId: meta.serviceId,
        genWidth: meta.genWidth,
        genHeight: meta.genHeight,
        steps: meta.steps,
        cfgScale: meta.cfgScale,
        seed: meta.seed,
        negativePrompt: meta.negativePrompt,
        strength: meta.strength,
      });
      updateSlot(slot.id, { status: 'success', resultImage: url });
      // 结果自动落画布：多图节点右侧按槽位序号摆放
      onResultImage(url, {
        x: node.position.x + node.width + 80 + index * 400,
        y: node.position.y,
      });
    } catch (e) {
      updateSlot(slot.id, {
        status: 'error',
        error: e instanceof Error ? e.message : '生成失败',
      });
    }
  };

  // 全部槽位批量生成（部分失败不影响其他槽位）
  const runAll = async () => {
    if (slots.length === 0) return;
    setRunningAll(true);
    await Promise.allSettled(slots.map((s, i) => runSlot(s, i)));
    setRunningAll(false);
  };

  // AI 拆分总提示词 → 填充槽位
  const handleSplit = async () => {
    const prompt = meta.planPrompt?.trim();
    if (!prompt) {
      toast.error('请先填写总提示词');
      return;
    }
    setSplitting(true);
    try {
      const modelId = await fetchDefaultTextModelId();
      if (!modelId) {
        throw new Error('请先在设置页「文本模型」中配置并激活模型');
      }
      const prompts = await splitPrompt(modelId, prompt, meta.planCount || 4);
      const newSlots: CanvasPlanSlot[] = prompts.map((p, i) => ({
        id: `slot_${Date.now().toString(36)}_${i}`,
        prompt: p,
        status: 'idle',
      }));
      patchSlots(newSlots);
      toast.success(`已拆分为 ${newSlots.length} 条子提示词，可逐槽调整后生成`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拆分失败');
    } finally {
      setSplitting(false);
    }
  };

  const addSlot = () => {
    patchSlots([
      ...slots,
      {
        id: `slot_${Date.now().toString(36)}_${slots.length}`,
        prompt: '',
        status: 'idle',
      },
    ]);
  };

  const removeSlot = (slotId: string) =>
    patchSlots(slots.filter((s) => s.id !== slotId));

  return (
    <div data-canvas-scroll className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain text-xs">
      {/* 总提示词 + 数量 + 拆分 */}
      <div className="flex flex-col gap-1">
        <span className="font-medium text-slate-600">总提示词</span>
        <Textarea
          className="min-h-14 text-xs"
          value={meta.planPrompt || ''}
          placeholder="输入总提示词，AI 将拆分为多条子提示词"
          onChange={(e) => patch({ planPrompt: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            className="h-7 w-14 text-xs"
            value={meta.planCount ?? 4}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (!Number.isNaN(num)) {
                patch({ planCount: Math.max(1, Math.min(8, Math.round(num))) });
              }
            }}
            title="拆分数量（1-8）"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 flex-1"
            disabled={splitting}
            onClick={handleSplit}
            title="调用文本模型拆分提示词"
          >
            {splitting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            AI 拆分
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={addSlot}
            title="添加空槽位"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* AI 服务 */}
      <div className="flex flex-col gap-1">
        <span className="font-medium text-slate-600">AI 服务</span>
        <Select
          value={meta.serviceId || activeServiceId || ''}
          onValueChange={(v) => patch({ serviceId: v })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="选择 AI 服务" />
          </SelectTrigger>
          <SelectContent>
            {services.length === 0 && (
              <div className="p-2 text-xs text-slate-400">
                尚未配置 AI 服务，请到「设置」添加
              </div>
            )}
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.id === activeServiceId ? '（激活）' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 槽位列表 */}
      {slots.length > 0 && (
        <div className="flex flex-col gap-2">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className={`rounded border p-1.5 ${
                slot.status === 'running'
                  ? 'border-blue-300 bg-blue-50/40'
                  : slot.status === 'success'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : slot.status === 'error'
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-slate-200'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-600">槽位 {index + 1}</span>
                <div className="flex items-center gap-1">
                  {slot.status === 'running' && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  )}
                  {slot.status === 'success' && (
                    <span className="text-emerald-500">✓</span>
                  )}
                  {slot.status === 'error' && (
                    <span className="text-red-500">✗</span>
                  )}
                  <button
                    type="button"
                    className="text-slate-300 hover:text-slate-500"
                    onClick={() => removeSlot(slot.id)}
                    title="删除槽位"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <Textarea
                className="min-h-12 text-xs"
                value={slot.prompt}
                placeholder="子提示词"
                onChange={(e) => updateSlot(slot.id, { prompt: e.target.value })}
              />

              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  type="text"
                  className="h-6 flex-1 text-[10px]"
                  placeholder="参考图 URL（可选，走图生图）"
                  value={slot.referenceUrl || ''}
                  onChange={(e) =>
                    updateSlot(slot.id, { referenceUrl: e.target.value })
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2"
                  disabled={slot.status === 'running' || runningAll}
                  onClick={() => runSlot(slot, index)}
                  title={slot.status === 'error' ? '重试' : '生成'}
                >
                  {slot.status === 'error' ? (
                    <RefreshCw className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </Button>
              </div>

              {slot.error && (
                <p className="mt-1 break-all text-[10px] text-red-500">
                  {slot.error}
                </p>
              )}
              {slot.resultImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.resultImage}
                  alt="槽位结果"
                  className="mt-1 h-16 w-full rounded border object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 全部生成 */}
      {slots.length > 0 && (
        <div className="sticky bottom-0 border-t border-slate-100 pt-2">
          <Button
            type="button"
            size="sm"
            className="h-7 w-full"
            disabled={runningAll}
            onClick={runAll}
          >
            {runningAll ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 h-3.5 w-3.5" />
            )}
            {runningAll ? '批量生成中…' : `全部生成（${slots.length} 槽）`}
          </Button>
        </div>
      )}
    </div>
  );
}
