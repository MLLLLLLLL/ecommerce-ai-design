'use client';

import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PromptOptimizeDialog } from '@/components/shared/PromptOptimizeDialog';
import { usePromptOptimize } from '@/hooks/usePromptOptimize';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ModelConfigSummary } from '@/types/model-config';

interface PromptInputProps {
  prompt: string;
  negativePrompt?: string;
  onPromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  disabled?: boolean;
  /** 图生图模式传入参考图（URL或dataUrl），优化时一并发给文本模型 */
  referenceImage?: string;
}

export function PromptInput({
  prompt,
  negativePrompt = '',
  onPromptChange,
  onNegativePromptChange,
  disabled = false,
  referenceImage,
}: PromptInputProps) {
  const [modelId, setModelId] = useState<string | null>(null);
  const {
    dialogOpen,
    setDialogOpen,
    optimizing,
    optimizedText,
    originalPrompt,
    error: optimizeError,
    optimize,
    accept,
    cancel,
  } = usePromptOptimize();

  /**
   * 点击优化提示词按钮
   * 未配置文本模型时提示去设置页配置
   */
  const handleOptimize = () => {
    if (!prompt.trim()) return;

    if (!modelId) {
      toast.error('请先在设置页的「文本模型」标签中配置提示词优化模型');
      return;
    }

    void optimize(
      modelId,
      prompt.trim(),
      referenceImage ? 'image-to-image' : 'text-to-image',
      referenceImage || undefined
    );
  };

  useEffect(() => {
    const loadDefaultModel = async () => {
      try {
        const response = await fetch('/api/model-configs');
        const data = await response.json();
        const models = data.models as ModelConfigSummary[] | undefined;
        const model = models?.find((item) => item.isActive && item.isDefault && item.capabilities.jsonMode)
          || models?.find((item) => item.isActive && item.capabilities.jsonMode);
        setModelId(model?.id || null);
      } catch {
        setModelId(null);
      }
    };
    void loadDefaultModel();
  }, []);

  /**
   * 接受优化结果，回填到提示词输入框
   */
  const handleAccept = () => {
    const text = accept();
    if (text) {
      onPromptChange(text);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt">提示词</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={handleOptimize}
            disabled={disabled || !prompt.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            优化提示词
          </Button>
        </div>
        <Textarea
          id="prompt"
          placeholder="描述你想要生成的图片，例如：一只可爱的橘猫坐在窗台上，阳光洒进来..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={disabled}
          className="min-h-[120px] resize-none"
        />
        <p className="text-sm text-muted-foreground">
          {prompt.length} 字符
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="negative-prompt">负向提示词（可选）</Label>
        <Textarea
          id="negative-prompt"
          placeholder="描述你不想要的元素，例如：模糊，低质量，变形..."
          value={negativePrompt}
          onChange={(e) => onNegativePromptChange(e.target.value)}
          disabled={disabled}
          className="min-h-[80px] resize-none"
        />
        <p className="text-sm text-muted-foreground">
          {negativePrompt.length} 字符
        </p>
      </div>

      {/* 提示词优化对比弹窗 */}
      <PromptOptimizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        originalPrompt={originalPrompt}
        optimizedPrompt={optimizedText}
        loading={optimizing}
        error={optimizeError}
        onAccept={handleAccept}
        onCancel={cancel}
      />
    </div>
  );
}
