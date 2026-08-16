'use client';

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ParameterPanel,
  computeSize,
  type GenerationParams,
  type Resolution,
} from '@/components/text-to-image/ParameterPanel';

export type MarketingGenerationParams = GenerationParams;

interface GenerationParamsDialogProps {
  open: boolean;
  planLabel: string;
  defaultAspect: string;
  initialParams?: Partial<GenerationParams>;
  onOpenChange: (open: boolean) => void;
  onSave: (params: GenerationParams) => void;
}

function normalizeParams(
  initialParams: Partial<GenerationParams> | undefined,
  defaultAspect: string
): GenerationParams {
  const resolution = (initialParams?.resolution ?? '1k') as Resolution;
  const aspect = initialParams?.aspect ?? defaultAspect;
  const size = computeSize(resolution, aspect);
  return {
    width: initialParams?.width ?? size.width,
    height: initialParams?.height ?? size.height,
    samples: Math.min(4, Math.max(1, initialParams?.samples ?? 1)),
    steps: initialParams?.steps ?? 20,
    cfgScale: initialParams?.cfgScale ?? 7,
    seed: initialParams?.seed,
    resolution,
    aspect,
  };
}

export function GenerationParamsDialog({
  open,
  planLabel,
  defaultAspect,
  initialParams,
  onOpenChange,
  onSave,
}: GenerationParamsDialogProps) {
  const [draft, setDraft] = useState<GenerationParams>(() => normalizeParams(initialParams, defaultAspect));

  useEffect(() => {
    if (!open) return;
    // 参数面板打开时以当前图片的最新配置为编辑副本。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(normalizeParams(initialParams, defaultAspect));
  }, [defaultAspect, initialParams, open]);

  const handleSave = () => {
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            生成参数设置
          </DialogTitle>
          <DialogDescription>{planLabel}使用独立参数，保存后随本次提示词确认生效。</DialogDescription>
        </DialogHeader>
        <ParameterPanel params={draft} onChange={setDraft} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
