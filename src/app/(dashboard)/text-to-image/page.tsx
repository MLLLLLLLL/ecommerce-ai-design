'use client';

import { useState } from 'react';
import { useAIServices } from '@/hooks/useAIService';
import { PromptInput } from '@/components/text-to-image/PromptInput';
import {
  ParameterPanel,
  GenerationParams,
} from '@/components/text-to-image/ParameterPanel';
import { ResultGallery } from '@/components/text-to-image/ResultGallery';
import { GenerationStatus } from '@/components/ai/GenerationStatus';
import { ImageModelSelector } from '@/components/ai/ImageModelSelector';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Asset {
  id: string;
  filename: string;
  filepath: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  prompt?: string;
  aiProvider?: string;
  createdAt: string;
}

export default function TextToImagePage() {
  const { services, activeServiceId } = useAIServices();
  const [modelId, setModelId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [params, setParams] = useState<GenerationParams>({
    width: 1024,
    height: 1024,
    samples: 1,
    steps: 20,
    cfgScale: 7,
  });
  const [results, setResults] = useState<Asset[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultModelId =
    services.find((service) => service.id === activeServiceId)?.id ?? services[0]?.id ?? null;
  const selectedModelId =
    modelId && services.some((service) => service.id === modelId)
      ? modelId
      : defaultModelId;
  const config = services.find((service) => service.id === selectedModelId) ?? null;
  const isReady = Boolean(config);

  const handleGenerate = async () => {
    if (!isReady || !config) {
      toast.error('请先配置 AI 服务');
      return;
    }

    if (!prompt.trim()) {
      toast.error('请输入提示词');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/text-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          params: {
            prompt: prompt.trim(),
            negativePrompt: negativePrompt.trim() || undefined,
            ...params,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '生成失败');
      }

      setResults((prev) => [...data.assets, ...prev]);
      toast.success(`成功生成 ${data.count} 张图片`);
    } catch (error: unknown) {
      console.error('Generation error:', error);
      const message = error instanceof Error ? error.message : '生成失败，请重试';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '删除失败');
      }

      setResults((prev) => prev.filter((asset) => asset.id !== id));
      toast.success('删除成功');
    } catch (error: unknown) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">文生图</h1>
        <p className="text-muted-foreground">
          使用 AI 从文字描述生成图片
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 提示词输入 */}
          <PromptInput
            prompt={prompt}
            negativePrompt={negativePrompt}
            onPromptChange={setPrompt}
            onNegativePromptChange={setNegativePrompt}
            disabled={generating}
          />

          <ImageModelSelector
            services={services}
            value={selectedModelId}
            onValueChange={setModelId}
            disabled={generating}
          />

          {/* 参数配置 */}
          <ParameterPanel
            params={params}
            onChange={setParams}
            disabled={generating}
          />

          {/* 生成按钮 */}
          <Button
            onClick={handleGenerate}
            disabled={!isReady || generating || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              '开始生成'
            )}
          </Button>

          {/* 结果展示 */}
          <ResultGallery
            results={results}
            onDelete={handleDelete}
          />
        </div>

        {/* 侧边栏 - 状态面板 */}
        <div className="lg:col-span-1">
          <GenerationStatus config={config} />
        </div>
      </div>
    </div>
  );
}
