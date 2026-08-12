'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MarketingWorkspace } from '@/components/marketing/MarketingWorkspace';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { ModelConfigSummary } from '@/types/model-config';

export default function MarketingPage() {
  const [models, setModels] = useState<ModelConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('/api/model-configs');
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || '读取模型配置失败');
        }
        setModels(data.models);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '读取模型配置失败');
      } finally {
        setLoading(false);
      }
    };
    void loadModels();
  }, []);

  const hasVisionModel = models.some((model) => model.isActive && model.capabilities.vision && model.capabilities.jsonMode && !model.capabilities.imageGeneration);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载模型配置
      </div>
    );
  }

  if (error || !hasVisionModel) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant={error ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || '请先在设置的“文本模型”中保存并启用支持视觉输入的模型，例如 ToAPI 的 gpt-5.6-terra、gpt-5.6-sol 或 claude-sonnet-4-6。'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MarketingWorkspace models={models} onError={setError} />
    </div>
  );
}
