'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface PromptInputProps {
  prompt: string;
  negativePrompt?: string;
  onPromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  disabled?: boolean;
}

export function PromptInput({
  prompt,
  negativePrompt = '',
  onPromptChange,
  onNegativePromptChange,
  disabled = false,
}: PromptInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="prompt">提示词</Label>
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
    </div>
  );
}
