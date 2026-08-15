'use client';

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useTextModelStore } from '@/stores/useTextModelStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SearchServiceSection } from './search-service-section';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AIServiceConfig } from '@/types/ai';
import {
  DEFAULT_MODEL_CAPABILITIES,
  inferModelCapabilities,
  ModelCapabilities,
  ModelConfigSummary,
  TextModelApiProtocol,
} from '@/types/model-config';
import { generateId } from '@/lib/utils';

const TOAPIS_DEFAULT_BASE_URL = 'https://toapis.com/v1';
const TOAPIS_DEFAULT_MODEL = 'gpt-image-2';

const IMAGE_PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  alibaba: 'https://dashscope.aliyuncs.com/api/v1',
  relay: '',
  toapis: TOAPIS_DEFAULT_BASE_URL,
} as const;

function modelTestKinds(capabilities?: ModelCapabilities): string[] {
  const kinds = ['connection'];
  if (capabilities?.jsonMode) kinds.push('jsonMode');
  if (capabilities?.vision) kinds.push('vision');
  if (capabilities?.imageGeneration) kinds.push('imageGeneration');
  if (capabilities?.imageEditing) kinds.push('imageEditing');
  if (capabilities?.referenceImage) kinds.push('referenceImage');
  return kinds;
}

function ModelTestStatus({ model }: { model?: ModelConfigSummary }) {
  if (!model) return <Badge variant="destructive">未同步到营销助手</Badge>;
  if (!model.testStatus) return <Badge variant="outline">待实测</Badge>;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {model.testStatus === 'passed' && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">实测通过</Badge>}
        {model.testStatus === 'partial' && <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">实测部分通过</Badge>}
        {model.testStatus === 'failed' && <Badge variant="destructive">实测未通过</Badge>}
        {model.lastTestedAt && <span className="text-xs text-muted-foreground">{new Date(model.lastTestedAt).toLocaleString()}</span>}
      </div>
      {model.testError && <p className="break-all text-xs text-destructive">{model.testError}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { services, addService, updateService, deleteService } =
    useConfigStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<AIServiceConfig | null>(
    null
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [imageSaving, setImageSaving] = useState(false);

  const [textModels, setTextModels] = useState<ModelConfigSummary[]>([]);
  const [textModelsLoading, setTextModelsLoading] = useState(true);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [editingTextModel, setEditingTextModel] = useState<string | null>(null);
  const [textForm, setTextForm] = useState({
    name: '',
    baseURL: '',
    apiKey: '',
    model: '',
    apiProtocol: 'chat_completions' as TextModelApiProtocol,
    capabilities: DEFAULT_MODEL_CAPABILITIES as ModelCapabilities,
    isActive: true,
    isDefault: false,
  });
  const [textTesting, setTextTesting] = useState(false);
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const loadTextModels = async () => {
    setTextModelsLoading(true);
    try {
      const response = await fetch('/api/model-configs');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '读取文本模型失败');
      setTextModels(data.models);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取文本模型失败');
    } finally {
      setTextModelsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void loadTextModels(), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveTextModel = async () => {
    if (
      !textForm.name.trim() ||
      !textForm.baseURL.trim() ||
      (!editingTextModel && !textForm.apiKey.trim()) ||
      !textForm.model.trim()
    ) {
      toast.error('请填写完整的文本模型配置（含模型名称）');
      return;
    }

    try {
      const response = await fetch(editingTextModel ? `/api/model-configs/${editingTextModel}` : '/api/model-configs', {
        method: editingTextModel ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...textForm,
          ...(editingTextModel && !textForm.apiKey.trim() ? { apiKey: undefined } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存文本模型失败');
      await loadTextModels();
      setTextDialogOpen(false);
      toast.success(editingTextModel ? '文本模型已更新' : '文本模型已添加');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存文本模型失败');
    }
  };

  const handleTestTextModel = async (modelId?: string) => {
    if (!modelId) {
      toast.error('请先保存模型后再测试连接');
      return;
    }

    // 按声明能力选择实测项：能力未知或未实测按不可用处理（V2 5.3）
    const model = textModels.find((item) => item.id === modelId);
    const kinds = modelTestKinds(model?.capabilities);

    setTextTesting(true);
    try {
      const response = await fetch(`/api/model-configs/${modelId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kinds }),
      });

      const data = await response.json();

      if (data.success) {
        const report = data.data?.report ?? {};
        const evaluated = Object.keys(report);
        const passedCount = evaluated.filter((kind) => report[kind]?.passed).length;
        if (passedCount === evaluated.length) {
          toast.success(`实测通过（${passedCount}/${evaluated.length}）`);
        } else if (passedCount === 0) {
          toast.error('实测未通过，请检查模型与 API Key');
        } else {
          toast.warning(`部分通过（${passedCount}/${evaluated.length}）：请查看卡片上的测试摘要`);
        }
        await loadTextModels();
      } else {
        toast.error(data.error || '测试失败');
      }
    } catch (error) {
      console.error('Text model test error:', error);
      toast.error('模型测试失败');
    } finally {
      setTextTesting(false);
    }
  };

  /** 旧图片服务配置迁移（V2 5.2）：预览后显式确认，密钥只在服务端加密保存。 */
  const handleMigrateImageServices = async () => {
    if (services.length === 0) {
      toast.error('没有可迁移的图片模型配置');
      return;
    }
    setMigrating(true);
    try {
      const payload: { name: string; provider: 'openai' | 'alibaba' | 'relay' | 'toapis'; relayType?: 'openai' | 'sd' | 'toapis'; baseURL?: string; model?: string; apiKey: string }[] = [];
      for (const service of services) {
        const resolved = useConfigStore.getState().getServiceById(service.id);
        if (!resolved?.apiKey) continue;
        payload.push({
          name: resolved.name,
          provider: resolved.provider,
          relayType: resolved.relayType,
          baseURL: resolved.baseURL,
          model: resolved.model || (resolved.provider === 'toapis' || resolved.relayType === 'toapis' ? TOAPIS_DEFAULT_MODEL : undefined),
          apiKey: resolved.apiKey,
        });
      }
      if (payload.length === 0) {
        toast.error('没有可迁移的有效配置');
        return;
      }
      const response = await fetch('/api/model-configs/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '迁移失败');
      const created = data.data?.created?.length ?? 0;
      const skipped = data.data?.skipped?.length ?? 0;
      toast.success(`已迁移 ${created} 个模型${skipped > 0 ? `，跳过 ${skipped} 个同名配置` : ''}。请实测后再用于营销助手2`);
      setMigrateDialogOpen(false);
      await loadTextModels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '迁移失败，旧配置未被修改');
    } finally {
      setMigrating(false);
    }
  };

  /**
   * 图片模型在保留本地工作台配置的同时，同步写入服务端模型库。
   * 营销助手2仅从服务端读取模型，避免新增模型只在当前浏览器可见。
   */
  const syncImageModelToServer = async (config: AIServiceConfig, previousName?: string) => {
    if (!config.baseURL?.trim()) {
      throw new Error('图片模型需要填写接口地址，才能同步到营销助手模型库');
    }
    const existing = textModels.find(
      (model) => model.name === previousName || model.name === config.name
    );
    const capabilities = inferModelCapabilities(config.model ?? config.name);
    capabilities.imageGeneration = true;

    const response = await fetch(
      existing ? `/api/model-configs/${existing.id}` : '/api/model-configs',
      {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          provider: config.provider,
          relayType: config.provider === 'relay' || config.provider === 'toapis' ? config.relayType : undefined,
          baseURL: config.baseURL.trim(),
          apiKey: config.apiKey,
          model: config.model || (config.provider === 'toapis' || config.relayType === 'toapis' ? TOAPIS_DEFAULT_MODEL : config.name),
          apiProtocol: 'chat_completions',
          capabilities,
          isActive: true,
          isDefault: existing?.isDefault ?? false,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || '同步图片模型到服务端失败');
    }
  };

  const handleOpenTextDialog = (id?: string) => {
    const model = id ? textModels.find((item) => item.id === id) : null;
    setEditingTextModel(id || null);
    setTextForm({
      name: model?.name || '',
      baseURL: model?.baseURL || '',
      apiKey: '',
      model: model?.model || '',
      apiProtocol: model?.apiProtocol ?? 'chat_completions',
      capabilities: { ...DEFAULT_MODEL_CAPABILITIES, ...(model?.capabilities || {}) },
      isActive: model?.isActive ?? true,
      isDefault: model?.isDefault ?? false,
    });
    setTextDialogOpen(true);
  };

  const handleDeleteTextModel = async (id: string) => {
    if (confirm('确定要删除这个文本模型吗？')) {
      try {
        const response = await fetch(`/api/model-configs/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || '删除文本模型失败');
        await loadTextModels();
        toast.success('文本模型已删除');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除文本模型失败');
      }
    }
  };

  const updateTextCapabilities = (key: keyof ModelCapabilities, value: boolean) => {
    setTextForm((current) => ({ ...current, capabilities: { ...current.capabilities, [key]: value } }));
  };

  const handleImportLegacyTextModels = async () => {
    const legacyStore = useTextModelStore.getState();
    if (!legacyStore.models.length) {
      toast.error('没有发现可导入的旧文本模型配置');
      return;
    }
    if (!confirm(`将导入 ${legacyStore.models.length} 个旧文本模型到服务端。确定继续吗？`)) return;

    setTextTesting(true);
    try {
      let imported = 0;
      for (const legacyModel of legacyStore.models) {
        const resolved = legacyStore.getModelById(legacyModel.id);
        if (!resolved) continue;

        const response = await fetch('/api/model-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: resolved.name,
            provider: 'openai',
            baseURL: resolved.baseURL,
            apiKey: resolved.apiKey,
            model: resolved.model,
            capabilities: inferModelCapabilities(resolved.model),
            isActive: true,
            isDefault: legacyModel.id === legacyStore.activeModelId,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || `导入“${resolved.name}”失败`);
        }
        imported += 1;
      }
      await loadTextModels();
      toast.success(`已导入 ${imported} 个旧文本模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入旧文本模型失败');
    } finally {
      setTextTesting(false);
    }
  };

  const [formData, setFormData] = useState({
    provider: 'openai' as 'openai' | 'alibaba' | 'relay' | 'toapis',
    name: '',
    apiKey: '',
    baseURL: '',
    model: '',
    relayType: 'openai' as 'openai' | 'sd' | 'toapis',
    maxConcurrent: 50,
  });

  const handleOpenDialog = (service?: AIServiceConfig) => {
    if (service) {
      const resolved = useConfigStore.getState().getServiceById(service.id);
      setEditingService(service);
      setFormData({
        provider: service.provider,
        name: service.name,
        apiKey: resolved?.apiKey ?? '',
        baseURL: service.baseURL || IMAGE_PROVIDER_BASE_URLS[service.provider],
        model: service.model || (service.relayType === 'toapis' ? TOAPIS_DEFAULT_MODEL : ''),
        relayType: service.relayType || (service.provider === 'toapis' ? 'toapis' : 'openai'),
        maxConcurrent: service.maxConcurrent || 50,
      });
    } else {
      setEditingService(null);
      setFormData({
        provider: 'openai',
        name: '',
        apiKey: '',
        baseURL: IMAGE_PROVIDER_BASE_URLS.openai,
        model: '',
        relayType: 'openai',
        maxConcurrent: 50,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.apiKey.trim() || !formData.baseURL.trim()) {
      toast.error('请填写服务名称、接口地址和 API Key');
      return;
    }

    const config: AIServiceConfig = {
      id: editingService?.id || generateId(),
      provider: formData.provider,
      name: formData.name.trim(),
      apiKey: formData.apiKey.trim(),
      baseURL: formData.baseURL.trim() || undefined,
      model: formData.model.trim() || (formData.provider === 'toapis' || formData.relayType === 'toapis' ? TOAPIS_DEFAULT_MODEL : undefined),
      relayType: formData.provider === 'relay' || formData.provider === 'toapis' ? formData.relayType : undefined,
      maxConcurrent: formData.maxConcurrent,
    };

    setImageSaving(true);
    try {
      await syncImageModelToServer(config, editingService?.name);
      if (editingService) {
        updateService(editingService.id, config);
      } else {
        addService(config);
      }
      await loadTextModels();
      setDialogOpen(false);
      toast.success(editingService ? '图片模型已更新并同步到营销助手' : '图片模型已添加并同步到营销助手');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存图片模型失败');
    } finally {
      setImageSaving(false);
    }
  };

  const handleTestConnection = async (service: AIServiceConfig) => {
    setTestingId(service.id);
    try {
      const serverModel = textModels.find((model) => model.name === service.name);
      if (!serverModel) {
        throw new Error('该图片模型尚未同步到营销助手，请先编辑并保存');
      }

      const response = await fetch(`/api/model-configs/${serverModel.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kinds: modelTestKinds(serverModel.capabilities) }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '图片模型实测失败');

      const report = data.data?.report ?? {};
      const evaluated = Object.keys(report);
      const passedCount = evaluated.filter((kind) => report[kind]?.passed).length;
      if (passedCount === evaluated.length) {
        toast.success(`图片模型实测通过（${passedCount}/${evaluated.length}）`);
      } else if (passedCount === 0) {
        toast.error('图片模型实测未通过，请查看卡片上的测试摘要');
      } else {
        toast.warning(`图片模型部分通过（${passedCount}/${evaluated.length}）`);
      }
      await loadTextModels();
    } catch (error) {
      console.error('Image model test error:', error);
      toast.error(error instanceof Error ? error.message : '图片模型实测失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const localService = services.find((service) => service.id === id);
    if (!localService || !confirm('确定要删除这个图片模型吗？')) return;
    setImageSaving(true);
    try {
      const serverModel = textModels.find((model) => model.name === localService.name);
      if (serverModel) {
        const response = await fetch(`/api/model-configs/${serverModel.id}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || '删除服务端图片模型失败');
      }
      deleteService(id);
      await loadTextModels();
      toast.success('图片模型已删除，并已从营销助手模型库移除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除图片模型失败');
    } finally {
      setImageSaving(false);
    }
  };

  const getProviderLabel = (provider: string, relayType?: AIServiceConfig['relayType']) => {
    if (provider === 'relay' && relayType === 'toapis') return 'ToAPIs 中转站';
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'alibaba':
        return '阿里百炼';
      case 'relay':
        return '中转站';
      case 'toapis':
        return 'ToAPIs 中转站';
      default:
        return provider;
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">设置</h1>
          <p className="text-muted-foreground">配置图片模型、文本模型和应用偏好</p>
        </div>
      </div>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">图片模型</TabsTrigger>
          <TabsTrigger value="text-model">文本模型</TabsTrigger>
          <TabsTrigger value="search">搜索服务</TabsTrigger>
          <TabsTrigger value="preferences">偏好设置</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              配置用于文生图、图生图和工作流的图片模型。保存后会自动同步到营销助手模型库。
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMigrateDialogOpen(true)} disabled={services.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                同步已有模型
              </Button>
              <Button onClick={() => handleOpenDialog()} disabled={imageSaving}>
                <Plus className="mr-2 h-4 w-4" />
                添加图片模型
              </Button>
            </div>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">暂无配置的图片模型</p>
                  <Button
                    variant="link"
                    onClick={() => handleOpenDialog()}
                    className="mt-2"
                  >
                    添加第一个图片模型
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((service) => {
                const serverModel = textModels.find((model) => model.name === service.name);
                return <Card key={service.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {service.name}
                        </CardTitle>
                        <Badge variant="outline">
                          {getProviderLabel(service.provider, service.relayType)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(service.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {service.model && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">模型: </span>
                        <span className="font-medium">{service.model}</span>
                      </div>
                    )}
                    {service.baseURL && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">地址: </span>
                        <span className="truncate font-medium">
                          {service.baseURL}
                        </span>
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-muted-foreground">并发数: </span>
                      <span className="font-medium">
                        {service.maxConcurrent || 50}
                      </span>
                    </div>
                    <ModelTestStatus model={serverModel} />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleTestConnection(service)}
                        disabled={testingId === service.id}
                      >
                        {testingId === service.id ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            测试中...
                          </>
                        ) : (
                          '实测能力'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(service)}
                        disabled={imageSaving}
                      >
                        编辑
                      </Button>
                    </div>
                  </CardContent>
                </Card>;
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="text-model" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            配置提示词优化和营销助手使用的文本模型。密钥仅保存在服务端。
          </p>
          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>文本模型</CardTitle><div className="flex gap-2"><Button variant="outline" size="sm" onClick={handleImportLegacyTextModels} disabled={textTesting}><Download className="mr-2 h-4 w-4" />导入旧配置</Button><Button size="sm" onClick={() => handleOpenTextDialog()}><Plus className="mr-2 h-4 w-4" />添加文本模型</Button></div></div></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">可保存多个 OpenAI 兼容文本模型，并在营销助手中按视觉识别、内容生成角色分别选择。</p>
              {textModelsLoading ? <p className="py-8 text-center text-sm text-muted-foreground">正在加载文本模型...</p> : textModels.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无配置的文本模型</p> : <div className="grid gap-4 md:grid-cols-2">{textModels.map((textModel) => <Card key={textModel.id}><CardHeader><div className="flex items-start justify-between"><div><CardTitle className="text-lg">{textModel.name}</CardTitle><div className="mt-2 flex flex-wrap gap-2">{textModel.isDefault && <Badge>默认</Badge>}<Badge variant="outline">{textModel.model}</Badge><Badge variant="outline">{textModel.apiProtocol === 'responses' ? 'Responses' : 'Chat Completions'}</Badge>{textModel.capabilities.vision && <Badge variant="secondary">视觉</Badge>}{textModel.capabilities.jsonMode && <Badge variant="secondary">JSON</Badge>}{textModel.capabilities.imageGeneration && <Badge variant="secondary">图片生成</Badge>}{textModel.capabilities.imageEditing && <Badge variant="secondary">图片编辑</Badge>}{textModel.capabilities.referenceImage && <Badge variant="secondary">参考图</Badge>}{!textModel.isActive && <Badge variant="destructive">已停用</Badge>}</div></div><Button variant="ghost" size="icon" aria-label={`删除 ${textModel.name}`} onClick={() => handleDeleteTextModel(textModel.id)}><Trash2 className="h-4 w-4" /></Button></div></CardHeader><CardContent className="space-y-3"><p className="truncate text-sm text-muted-foreground">{textModel.baseURL}</p>{textModel.testStatus && <div className="space-y-1"><div className="flex flex-wrap items-center gap-2">{textModel.testStatus === 'passed' && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">实测通过</Badge>}{textModel.testStatus === 'partial' && <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">实测部分通过</Badge>}{textModel.testStatus === 'failed' && <Badge variant="destructive">实测未通过</Badge>}{textModel.lastTestedAt && <span className="text-xs text-muted-foreground">{new Date(textModel.lastTestedAt).toLocaleString()}</span>}</div>{textModel.testError && <p className="break-all text-xs text-destructive">{textModel.testError}</p>}</div>}<div className="flex gap-2"><Button variant="outline" size="sm" className="flex-1" onClick={() => handleTestTextModel(textModel.id)} disabled={textTesting}>{textTesting ? <><Loader2 className="mr-2 h-3 animate-spin" />测试中...</> : '实测能力'}</Button><Button variant="outline" size="sm" onClick={() => handleOpenTextDialog(textModel.id)}>编辑</Button></div></CardContent></Card>)}</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <SearchServiceSection />
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>应用偏好</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                偏好设置功能即将推出...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 添加/编辑服务对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingService ? '编辑图片模型' : '添加图片模型'}
            </DialogTitle>
            <DialogDescription>
              配置图片模型的连接信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>模型提供商</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData((current) => {
                    const provider = value as 'openai' | 'alibaba' | 'relay' | 'toapis';
                    const currentDefault = IMAGE_PROVIDER_BASE_URLS[current.provider];
                    const isToAPIs = provider === 'toapis';
                    const wasToAPIs = current.provider === 'toapis' || current.relayType === 'toapis';
                    return {
                      ...current,
                      provider,
                      relayType: isToAPIs ? 'toapis' : 'openai',
                      baseURL:
                        isToAPIs
                          ? TOAPIS_DEFAULT_BASE_URL
                          : !current.baseURL || current.baseURL === currentDefault || wasToAPIs
                          ? IMAGE_PROVIDER_BASE_URLS[provider]
                          : current.baseURL,
                      model: isToAPIs ? TOAPIS_DEFAULT_MODEL : wasToAPIs ? '' : current.model,
                    };
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (DALL-E)</SelectItem>
                  <SelectItem value="alibaba">阿里百炼（通义万相）</SelectItem>
                  <SelectItem value="relay">中转站</SelectItem>
                  <SelectItem value="toapis">ToAPIs 中转站</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>图片模型名称</Label>
              <Input
                placeholder="例如：我的商品主图模型"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={formData.apiKey}
                onChange={(e) =>
                  setFormData({ ...formData, apiKey: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder={IMAGE_PROVIDER_BASE_URLS[formData.provider] || 'https://api.example.com/v1'}
                value={formData.baseURL}
                onChange={(e) =>
                  setFormData({ ...formData, baseURL: e.target.value })
                }
              />
            </div>

            {formData.provider === 'relay' && (
              <>
                <div className="space-y-2">
                  <Label>中转站类型</Label>
                  <Select
                    value={formData.relayType}
                    onValueChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        relayType: value as 'openai' | 'sd' | 'toapis',
                        baseURL: value === 'toapis' && (!current.baseURL || current.baseURL === IMAGE_PROVIDER_BASE_URLS.relay)
                          ? TOAPIS_DEFAULT_BASE_URL
                          : current.baseURL,
                        model: value === 'toapis' && !current.model ? TOAPIS_DEFAULT_MODEL : current.model,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI 格式</SelectItem>
                      <SelectItem value="sd">Stable Diffusion 格式</SelectItem>
                      <SelectItem value="toapis">ToAPIs 异步图片格式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>{formData.relayType === 'toapis' ? '模型名' : '模型名（可选）'}</Label>
              <Input
                placeholder={
                  formData.relayType === 'toapis'
                    ? '例如：gpt-image-2 / gemini-2.5-flash-image-preview'
                    : formData.provider === 'openai'
                    ? 'dall-e-3'
                    : formData.provider === 'alibaba'
                      ? 'wanx-v1'
                      : '留空使用默认模型'
                }
                value={formData.model}
                onChange={(e) =>
                  setFormData({ ...formData, model: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>最大并发数</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={formData.maxConcurrent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxConcurrent: parseInt(e.target.value) || 50,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
          <Button onClick={() => void handleSave()} disabled={imageSaving}>
            {imageSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />同步中...</> : '保存并同步'}
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editingTextModel ? '编辑文本模型' : '添加文本模型'}</DialogTitle><DialogDescription>配置用于提示词优化和营销助手的 OpenAI 兼容模型</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>模型名称</Label><Input placeholder="例如：主力文本模型" value={textForm.name} onChange={(e) => setTextForm({ ...textForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Base URL</Label><Input placeholder="https://api.openai.com/v1" value={textForm.baseURL} onChange={(e) => setTextForm({ ...textForm, baseURL: e.target.value })} /></div>
            <div className="space-y-2"><Label>接口协议</Label><Select value={textForm.apiProtocol} onValueChange={(value: TextModelApiProtocol) => setTextForm({ ...textForm, apiProtocol: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chat_completions">Chat Completions</SelectItem><SelectItem value="responses">Responses</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>API Key</Label><Input type="password" placeholder={editingTextModel ? '留空则保持原密钥不变' : 'sk-...'} value={textForm.apiKey} onChange={(e) => setTextForm({ ...textForm, apiKey: e.target.value })} /></div>
            <div className="space-y-2"><Label>模型名</Label><Input placeholder="例如：gpt-5.6-terra、qwen-vl-max" value={textForm.model} onChange={(e) => setTextForm({ ...textForm, model: e.target.value, capabilities: inferModelCapabilities(e.target.value) })} /></div>
            <div className="space-y-3 rounded-md border p-3"><Label>模型能力</Label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.vision} onCheckedChange={(checked) => updateTextCapabilities('vision', checked === true)} />支持视觉输入</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.jsonMode} onCheckedChange={(checked) => updateTextCapabilities('jsonMode', checked === true)} />支持 JSON 输出</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.ocr} onCheckedChange={(checked) => updateTextCapabilities('ocr', checked === true)} />适合识别图片文字</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.imageGeneration} onCheckedChange={(checked) => updateTextCapabilities('imageGeneration', checked === true)} />支持图片生成</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.imageEditing} onCheckedChange={(checked) => updateTextCapabilities('imageEditing', checked === true)} />支持图片编辑/图生图</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.capabilities.referenceImage} onCheckedChange={(checked) => updateTextCapabilities('referenceImage', checked === true)} />支持接收参考图</label></div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.isActive} onCheckedChange={(checked) => setTextForm({ ...textForm, isActive: checked === true })} />启用此模型</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={textForm.isDefault} onCheckedChange={(checked) => setTextForm({ ...textForm, isDefault: checked === true })} />设为默认模型</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTextDialogOpen(false)}>取消</Button><Button onClick={handleSaveTextModel}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 旧图片配置迁移预览对话框（V2 5.2） */}
      <Dialog open={migrateDialogOpen} onOpenChange={setMigrateDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>迁移图片模型到服务端</DialogTitle>
            <DialogDescription>
              迁移后营销助手2才能使用这些模型。API Key 只在服务端加密保存，迁移失败不会删除旧配置。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{service.name}</span>
                <span className="text-muted-foreground">{getProviderLabel(service.provider, service.relayType)}{service.model ? ` · ${service.model}` : ''}</span>
              </div>
            ))}
            {services.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">没有可迁移的配置</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrateDialogOpen(false)}>取消</Button>
            <Button onClick={handleMigrateImageServices} disabled={migrating || services.length === 0}>
              {migrating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />迁移中...</> : `确认迁移 ${services.length} 个配置`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
