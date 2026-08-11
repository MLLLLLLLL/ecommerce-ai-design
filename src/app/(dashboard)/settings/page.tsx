'use client';

import { useState } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useTextModelStore } from '@/stores/useTextModelStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AIServiceConfig } from '@/types/ai';

export default function SettingsPage() {
    const { services, addService, updateService, deleteService } =
    useConfigStore();
  const { setTextModel } = useTextModelStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<AIServiceConfig | null>(
    null
  );
  const [testingId, setTestingId] = useState<string | null>(null);

  // 文本模型表单
  // zustand persist 对 localStorage 同步恢复，客户端首次渲染前已 hydrate，
  // 惰性初始化直接从 store 读取（apiKey解密后展示），避免用 effect 回填
  const [textForm, setTextForm] = useState(() => {
    if (typeof window === 'undefined') {
      return { baseURL: '', apiKey: '', model: '' };
    }
    const decrypted = useTextModelStore.getState().getTextModel();
    return {
      baseURL: decrypted?.baseURL || '',
      apiKey: decrypted?.apiKey || '',
      model: decrypted?.model || '',
    };
  });
  const [textTesting, setTextTesting] = useState(false);

  const handleSaveTextModel = () => {
    if (
      !textForm.baseURL.trim() ||
      !textForm.apiKey.trim() ||
      !textForm.model.trim()
    ) {
      toast.error('请填写完整的文本模型配置');
      return;
    }

    setTextModel(textForm);
    toast.success('文本模型配置已保存');
  };

  const handleTestTextModel = async () => {
    if (
      !textForm.baseURL.trim() ||
      !textForm.apiKey.trim() ||
      !textForm.model.trim()
    ) {
      toast.error('请填写完整的文本模型配置');
      return;
    }

    setTextTesting(true);
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', ...textForm }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('连接成功！');
      } else {
        toast.error(data.error || '连接失败');
      }
    } catch (error) {
      console.error('Text model test error:', error);
      toast.error('连接测试失败');
    } finally {
      setTextTesting(false);
    }
  };

  const [formData, setFormData] = useState({
    provider: 'openai' as 'openai' | 'alibaba' | 'relay',
    name: '',
    apiKey: '',
    baseURL: '',
    model: '',
    relayType: 'openai' as 'openai' | 'sd',
    maxConcurrent: 50,
  });

  const handleOpenDialog = (service?: AIServiceConfig) => {
    if (service) {
      setEditingService(service);
      setFormData({
        provider: service.provider,
        name: service.name,
        apiKey: service.apiKey,
        baseURL: service.baseURL || '',
        model: service.model || '',
        relayType: service.relayType || 'openai',
        maxConcurrent: service.maxConcurrent || 50,
      });
    } else {
      setEditingService(null);
      setFormData({
        provider: 'openai',
        name: '',
        apiKey: '',
        baseURL: '',
        model: '',
        relayType: 'openai',
        maxConcurrent: 50,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      toast.error('请填写服务名称和 API Key');
      return;
    }

    const config: AIServiceConfig = {
      id: editingService?.id || crypto.randomUUID(),
      provider: formData.provider,
      name: formData.name.trim(),
      apiKey: formData.apiKey.trim(),
      baseURL: formData.baseURL.trim() || undefined,
      model: formData.model.trim() || undefined,
      relayType: formData.provider === 'relay' ? formData.relayType : undefined,
      maxConcurrent: formData.maxConcurrent,
    };

    if (editingService) {
      updateService(editingService.id, config);
      toast.success('服务已更新');
    } else {
      addService(config);
      toast.success('服务已添加');
    }

    setDialogOpen(false);
  };

  const handleTestConnection = async (service: AIServiceConfig) => {
    setTestingId(service.id);
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('连接成功！');
      } else {
        toast.error(data.error || '连接失败');
      }
    } catch (error: any) {
      console.error('Test connection error:', error);
      toast.error('连接测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个服务配置吗？')) {
      deleteService(id);
      toast.success('服务已删除');
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'alibaba':
        return '阿里百炼';
      case 'relay':
        return '中转站';
      default:
        return provider;
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">设置</h1>
          <p className="text-muted-foreground">配置 AI 服务和应用偏好</p>
        </div>
      </div>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">AI 服务</TabsTrigger>
          <TabsTrigger value="text-model">文本模型</TabsTrigger>
          <TabsTrigger value="preferences">偏好设置</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              配置你的 AI 图像生成服务
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              添加服务
            </Button>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">暂无配置的服务</p>
                  <Button
                    variant="link"
                    onClick={() => handleOpenDialog()}
                    className="mt-2"
                  >
                    添加第一个服务
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((service) => (
                <Card key={service.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {service.name}
                        </CardTitle>
                        <Badge variant="outline">
                          {getProviderLabel(service.provider)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(service.id)}
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
                          '测试连接'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(service)}
                      >
                        编辑
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="text-model" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            配置用于「提示词优化」的文本大模型（OpenAI 兼容接口）
          </p>
          <Card>
            <CardHeader>
              <CardTitle>提示词优化模型</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  placeholder="https://api.openai.com/v1"
                  value={textForm.baseURL}
                  onChange={(e) =>
                    setTextForm({ ...textForm, baseURL: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  OpenAI 兼容接口地址，支持通义、DeepSeek、中转站等
                </p>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={textForm.apiKey}
                  onChange={(e) =>
                    setTextForm({ ...textForm, apiKey: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>模型名</Label>
                <Input
                  placeholder="例如：gpt-4o、qwen-vl-max（图生图优化建议使用支持视觉的模型）"
                  value={textForm.model}
                  onChange={(e) =>
                    setTextForm({ ...textForm, model: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleTestTextModel}
                  disabled={textTesting}
                >
                  {textTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    '测试连接'
                  )}
                </Button>
                <Button onClick={handleSaveTextModel}>保存</Button>
              </div>
            </CardContent>
          </Card>
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
              {editingService ? '编辑服务' : '添加服务'}
            </DialogTitle>
            <DialogDescription>
              配置 AI 图像生成服务的连接信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>服务提供商</Label>
              <Select
                value={formData.provider}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, provider: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (DALL-E)</SelectItem>
                  <SelectItem value="alibaba">阿里百炼（通义万相）</SelectItem>
                  <SelectItem value="relay">中转站</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>服务名称</Label>
              <Input
                placeholder="例如：我的 OpenAI 服务"
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

            {formData.provider === 'relay' && (
              <>
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input
                    placeholder="https://api.example.com/v1"
                    value={formData.baseURL}
                    onChange={(e) =>
                      setFormData({ ...formData, baseURL: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>中转站类型</Label>
                  <Select
                    value={formData.relayType}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, relayType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI 格式</SelectItem>
                      <SelectItem value="sd">Stable Diffusion 格式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>模型（可选）</Label>
              <Input
                placeholder={
                  formData.provider === 'openai'
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
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
