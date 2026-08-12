'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MarketingTaskInput,
  MarketingTaskResult,
  Platform,
  Language,
  Category,
} from '@/types/marketing';
import { ProductInput } from './ProductInput';
import { PlatformSelector } from './PlatformSelector';
import { OutputOptions } from './OutputOptions';
import { ResultViewer } from './ResultViewer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ModelConfigSummary } from '@/types/model-config';

interface MarketingWorkspaceProps {
  models: ModelConfigSummary[];
  onError: (error: string | null) => void;
}

type Step = 'input' | 'config' | 'generate' | 'result';

export function MarketingWorkspace({ models, onError }: MarketingWorkspaceProps) {
  const [step, setStep] = useState<Step>('input');
  const [generating, setGenerating] = useState(false);

  // 产品信息
  const [productName, setProductName] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [sellPoints, setSellPoints] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);

  // 平台配置
  const [platform, setPlatform] = useState<Platform>('taobao');
  const [language, setLanguage] = useState<Language>('zh-CN');
  const [category, setCategory] = useState<Category | undefined>();
  const [visionModelId, setVisionModelId] = useState('');
  const [contentModelId, setContentModelId] = useState('');
  const [followVisionModel, setFollowVisionModel] = useState(true);

  // 输出选项
  const [outputs, setOutputs] = useState({
    analysis: true,
    copywriting: true,
    mainPrompts: true,
    detailPrompts: true,
  });

  // 结果
  const [result, setResult] = useState<MarketingTaskResult | null>(null);

  const visionModels = useMemo(
    () => models.filter((item) => item.isActive && item.capabilities.vision && item.capabilities.jsonMode && !item.capabilities.imageGeneration),
    [models]
  );
  const contentModels = useMemo(
    () => models.filter((item) => item.isActive && item.capabilities.jsonMode && !item.capabilities.imageGeneration),
    [models]
  );

  useEffect(() => {
    const defaultVision = visionModels.find((item) => item.isDefault) || visionModels[0];
    if (!visionModelId && defaultVision) setVisionModelId(defaultVision.id);
  }, [visionModelId, visionModels]);

  useEffect(() => {
    if (followVisionModel && visionModelId) {
      setContentModelId(visionModelId);
      return;
    }
    if (!contentModelId) {
      const defaultContent = contentModels.find((item) => item.isDefault) || contentModels[0];
      if (defaultContent) setContentModelId(defaultContent.id);
    }
  }, [contentModelId, contentModels, followVisionModel, visionModelId]);

  const handleGenerate = async () => {
    if (!productName.trim()) {
      toast.error('请输入商品名称');
      return;
    }

    if (productImages.length === 0) {
      toast.error('请至少上传1张产品图片');
      return;
    }

    if (!visionModelId || !contentModelId) {
      toast.error('请选择图片识别模型和内容生成模型');
      return;
    }

    setGenerating(true);
    onError(null);

    try {
      const taskInput: MarketingTaskInput = {
        productName: productName.trim(),
        productImages,
        category,
        platform,
        language,
        sellPoints: sellPoints.filter((p) => p.trim()),
        keywords: keywords.filter((k) => k.trim()),
        outputs,
        modelSelection: { visionModelId, contentModelId },
      };

      const response = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskInput }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '生成失败');
      }

      setResult({
        taskId: data.taskId,
        status: 'completed',
        ...data.result,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setStep('result');
      toast.success('营销素材生成完成');
    } catch (error: any) {
      console.error('Generate error:', error);
      onError(error.message || '生成失败，请重试');
      toast.error(error.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'input':
        return (
          <div className="space-y-6">
            <Card className="border-dashed p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vision-model">图片识别模型</Label>
                  <Select value={visionModelId} onValueChange={setVisionModelId}>
                    <SelectTrigger id="vision-model"><SelectValue placeholder="选择视觉文本模型" /></SelectTrigger>
                    <SelectContent>
                      {visionModels.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name} · {item.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">用于产品分析、图片可见文字识别和风险判断。</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="content-model">内容生成模型</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={followVisionModel}
                        onCheckedChange={(checked) => setFollowVisionModel(checked === true)}
                      />
                      跟随图片识别模型
                    </label>
                  </div>
                  <Select value={contentModelId} onValueChange={setContentModelId} disabled={followVisionModel}>
                    <SelectTrigger id="content-model"><SelectValue placeholder="选择内容生成模型" /></SelectTrigger>
                    <SelectContent>
                      {contentModels.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name} · {item.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">用于文案、SEO 与主图、详情页提示词。</p>
                </div>
              </div>
            </Card>
            <ProductInput
              productName={productName}
              productImages={productImages}
              sellPoints={sellPoints}
              keywords={keywords}
              onProductNameChange={setProductName}
              onProductImagesChange={setProductImages}
              onSellPointsChange={setSellPoints}
              onKeywordsChange={setKeywords}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep('config')} size="lg">
                下一步：平台配置
              </Button>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="space-y-6">
            <PlatformSelector
              platform={platform}
              language={language}
              category={category}
              onPlatformChange={setPlatform}
              onLanguageChange={setLanguage}
              onCategoryChange={setCategory}
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('input')}>
                上一步
              </Button>
              <Button onClick={() => setStep('generate')} size="lg">
                下一步：选择输出
              </Button>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-6">
            <OutputOptions outputs={outputs} onOutputsChange={setOutputs} />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('config')}>
                上一步
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    开始生成
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case 'result':
        return (
          <div className="space-y-6">
            {result && <ResultViewer result={result} />}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('input');
                  setResult(null);
                }}
              >
                新建任务
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 标题 */}
      <div className="border-b bg-white p-6">
        <div className="container mx-auto">
          <h1 className="text-3xl font-bold">电商营销助手</h1>
          <p className="text-muted-foreground mt-2">
            文案创作
          </p>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="border-b bg-gray-50 p-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {[
              { key: 'input', label: '① 商品信息' },
              { key: 'config', label: '② 平台配置' },
              { key: 'generate', label: '③ 选择输出' },
              { key: 'result', label: '④ 查看结果' },
            ].map((s, index) => (
              <div
                key={s.key}
                className={`flex items-center ${
                  step === s.key
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-400'
                }`}
              >
                <span>{s.label}</span>
                {index < 3 && (
                  <span className="mx-4 text-gray-300">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 scroll-smooth">
        <div className="container mx-auto max-w-5xl">
          <Card className="p-6">{renderStep()}</Card>
        </div>
      </div>
    </div>
  );
}
