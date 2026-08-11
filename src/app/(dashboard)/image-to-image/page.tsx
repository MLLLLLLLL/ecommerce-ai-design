'use client';

import { useState } from 'react';
import { useAIService } from '@/hooks/useAIService';
import { ImageUploader } from '@/components/image-to-image/ImageUploader';
import { PromptInput } from '@/components/text-to-image/PromptInput';
import {
  ImageToImageParamsPanel,
  ImageToImageParams,
} from '@/components/image-to-image/ImageToImageParamsPanel';
import { ResultGallery } from '@/components/text-to-image/ResultGallery';
import { GenerationStatus } from '@/components/ai/GenerationStatus';
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

export default function ImageToImagePage() {
  const { config, isReady } = useAIService();
  const [sourceImage, setSourceImage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [params, setParams] = useState<ImageToImageParams>({
    width: 1024,
    height: 1024,
    samples: 1,
    strength: 0.75,
    steps: 20,
    cfgScale: 7,
  });
  const [results, setResults] = useState<Asset[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!isReady || !config) {
      toast.error('请先配置 AI 服务');
      return;
    }

    if (!sourceImage) {
      toast.error('请先上传图片');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/image-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          params: {
            image: sourceImage,
            prompt: prompt.trim() || undefined,
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
    } catch (error: any) {
      console.error('Generation error:', error);
      setError(error.message || '生成失败，请重试');
      toast.error(error.message || '生成失败');
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
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || '删除失败');
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">图生图</h1>
        <p className="text-muted-foreground">
          基于原图生成新的变体或进行图像编辑
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
          {/* 图片上传 */}
          <div className="space-y-2">
            <h3 className="font-semibold">上传原图</h3>
            <ImageUploader
              value={sourceImage}
              onChange={setSourceImage}
              disabled={generating}
            />
          </div>

          {/* 提示词输入 */}
          <div className="space-y-2">
            <h3 className="font-semibold">提示词（可选）</h3>
            <PromptInput
              prompt={prompt}
              negativePrompt={negativePrompt}
              onPromptChange={setPrompt}
              onNegativePromptChange={setNegativePrompt}
              disabled={generating}
            />
            <p className="text-sm text-muted-foreground">
              描述你想要的变化方向，留空则生成相似变体
            </p>
          </div>

          {/* 参数配置 */}
          <ImageToImageParamsPanel
            params={params}
            onChange={setParams}
            disabled={generating}
          />

          {/* 生成按钮 */}
          <Button
            onClick={handleGenerate}
            disabled={!isReady || generating || !sourceImage}
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
            onView={(asset) => {
              console.log('View asset:', asset);
            }}
          />
        </div>

        {/* 侧边栏 - 状态面板 */}
        <div className="lg:col-span-1">
          <GenerationStatus />
        </div>
      </div>
    </div>
  );
}
