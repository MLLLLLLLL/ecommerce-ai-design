'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';

// ============================================
// 搜索服务配置（V3 Phase 7 / ADR-0001）
// 联网 GEO 与市场洞察的前置依赖：
// 配置 -> 实测通过（testStatus=passed）-> 可用。
// ============================================

interface SearchServiceSummary {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: string | null;
  testStatus: string | null;
  testError: string | null;
  maxQueriesPerTask: number;
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  tavily: 'https://api.tavily.com/search',
  serper: 'https://google.serper.dev/search',
  custom: '',
};

export function SearchServiceSection() {
  const [services, setServices] = useState<SearchServiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    provider: 'tavily',
    baseURL: PROVIDER_DEFAULTS.tavily,
    apiKey: '',
    maxQueriesPerTask: 12,
  });

  const loadServices = useCallback(async () => {
    try {
      const response = await fetch('/api/search-services');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '读取失败');
      setServices(data.data.services as SearchServiceSummary[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取搜索服务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadServices(), 0);
    return () => clearTimeout(timer);
  }, [loadServices]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseURL.trim() || !form.apiKey.trim()) {
      toast.error('名称、接口地址与 API Key 均不能为空');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/search-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, maxQueriesPerTask: Number(form.maxQueriesPerTask) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存失败');
      toast.success('搜索服务已保存，请点击「实测」验证');
      setForm((current) => ({ ...current, apiKey: '' }));
      await loadServices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存搜索服务失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const response = await fetch(`/api/search-services/${id}/test`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '实测失败');
      if (data.data.passed) {
        toast.success(`实测通过：${data.data.message}`);
      } else {
        toast.error(`实测未通过：${data.data.message}`);
      }
      await loadServices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '实测失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该搜索服务吗？')) return;
    try {
      const response = await fetch(`/api/search-services/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '删除失败');
      toast.success('搜索服务已删除');
      await loadServices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除搜索服务失败');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        联网 GEO 与市场洞察需要搜索服务。支持 Tavily、Serper 或任意符合「输入 query → 返回 results 列表」的 JSON 接口。
        密钥仅保存在服务端；实测通过后才能用于联网模块。每个洞察任务最多消耗所配置的查询次数。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">新增搜索服务</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ss-name">名称</Label>
              <Input
                id="ss-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="例如：我的 Tavily"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ss-provider">供应商</Label>
              <Select
                value={form.provider}
                onValueChange={(value) =>
                  setForm({ ...form, provider: value, baseURL: PROVIDER_DEFAULTS[value] ?? '' })
                }
              >
                <SelectTrigger id="ss-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tavily">Tavily</SelectItem>
                  <SelectItem value="serper">Serper</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ss-baseurl">接口地址</Label>
              <Input
                id="ss-baseurl"
                value={form.baseURL}
                onChange={(event) => setForm({ ...form, baseURL: event.target.value })}
                placeholder="https://api.tavily.com/search"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ss-apikey">API Key</Label>
              <Input
                id="ss-apikey"
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                placeholder="tvly-..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ss-quota">每任务最多查询次数（1-20）</Label>
              <Input
                id="ss-quota"
                type="number"
                min={1}
                max={20}
                value={form.maxQueriesPerTask}
                onChange={(event) =>
                  setForm({ ...form, maxQueriesPerTask: Number(event.target.value) || 12 })
                }
              />
            </div>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                保存搜索服务
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">正在加载搜索服务...</p>
      ) : services.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无配置的搜索服务</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {service.isDefault && <Badge>默认</Badge>}
                      <Badge variant="outline">{service.provider}</Badge>
                      {service.testStatus === 'passed' && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          实测通过
                        </Badge>
                      )}
                      {service.testStatus === 'failed' && <Badge variant="destructive">实测未通过</Badge>}
                      {!service.testStatus && <Badge variant="secondary">未实测</Badge>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`删除 ${service.name}`} onClick={() => void handleDelete(service.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="truncate text-sm text-muted-foreground">{service.baseURL}</p>
                <p className="text-xs text-muted-foreground">每任务最多 {service.maxQueriesPerTask} 次查询</p>
                {service.testError && <p className="break-all text-xs text-destructive">{service.testError}</p>}
                {service.lastTestedAt && (
                  <p className="text-xs text-muted-foreground">
                    实测时间：{new Date(service.lastTestedAt).toLocaleString()}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={testingId === service.id}
                  onClick={() => void handleTest(service.id)}
                >
                  {testingId === service.id ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      实测中（一次真实查询）…
                    </>
                  ) : (
                    '实测'
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
