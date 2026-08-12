'use client';

import { useMemo, useRef, useState, type WheelEvent } from 'react';
import { MarketingTaskResult } from '@/types/marketing';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Check, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ResultViewerProps {
  result: MarketingTaskResult;
}

export function ResultViewer({ result }: ResultViewerProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('analysis');
  const [importing, setImporting] = useState(false);
  const lastWheelAt = useRef(0);

  const tabs = useMemo(() => {
    return [
      result.analysis && 'analysis',
      result.copywriting && 'copywriting',
      result.mainPrompts && 'mainPrompts',
      result.detailPrompts && 'detailPrompts',
    ].filter(Boolean) as string[];
  }, [result]);

  const handleCopy = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(itemName);
    toast.success(`已复制${itemName}`);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `marketing-result-${result.taskId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('已导出JSON文件');
  };

  const handleImportToAssets = async () => {
    setImporting(true);
    try {
      const response = await fetch('/api/marketing/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '导入素材库失败');
      }
      toast.success('营销结果已导入素材库');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入素材库失败');
    } finally {
      setImporting(false);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (tabs.length < 2 || Math.abs(event.deltaY) < 20) return;
    const now = Date.now();
    if (now - lastWheelAt.current < 350) return;
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = Math.max(0, Math.min(tabs.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1)));
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      lastWheelAt.current = now;
      setActiveTab(tabs[nextIndex]);
    }
  };

  return (
    <div className="space-y-4">
      {/* 头部操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">生成结果</h2>
          <p className="text-sm text-muted-foreground mt-1">
            任务ID: {result.taskId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImportToAssets} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            导入素材库
          </Button>
          <Button variant="outline" onClick={handleExportJSON}>
            <Download className="mr-2 h-4 w-4" />
            导出JSON
          </Button>
        </div>
      </div>

      {/* 结果内容 */}
      <div onWheel={handleWheel} className="w-full">
      <Tabs value={tabs.includes(activeTab) ? activeTab : tabs[0]} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {result.analysis && <TabsTrigger value="analysis">产品分析</TabsTrigger>}
          {result.copywriting && <TabsTrigger value="copywriting">文案</TabsTrigger>}
          {result.mainPrompts && <TabsTrigger value="mainPrompts">主图提示词</TabsTrigger>}
          {result.detailPrompts && <TabsTrigger value="detailPrompts">详情页提示词</TabsTrigger>}
        </TabsList>

        {/* 产品分析 */}
        {result.analysis && (
          <TabsContent value="analysis" className="space-y-4">
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">产品识别报告</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">产品名称</p>
                  <p className="text-lg">{result.analysis.productName}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">品类</p>
                  <Badge variant="secondary">{result.analysis.category}</Badge>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">产品外观锁定描述</p>
                  <Card className="p-4 bg-gray-50">
                    <p className="text-sm whitespace-pre-wrap">{result.analysis.productAnchor}</p>
                  </Card>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">可见卖点</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.analysis.inferred.sellPoints.map((point, i) => (
                      <li key={i} className="text-sm">{point}</li>
                    ))}
                  </ul>
                </div>

                {result.analysis.risks.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">风险提示</p>
                    <Card className="p-4 bg-yellow-50 border-yellow-200">
                      <ul className="space-y-1">
                        {result.analysis.risks.map((risk, i) => (
                          <li key={i} className="text-sm text-yellow-800">⚠️ {risk}</li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>
        )}

        {/* 文案 */}
        {result.copywriting && (
          <TabsContent value="copywriting" className="space-y-4">
            {/* 标题 */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">商品标题</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(result.copywriting!.title.main, '标题')}
                >
                  {copiedItem === '标题' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-lg">{result.copywriting.title.main}</p>
              
              <div className="mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">标题变体</p>
                <div className="space-y-2">
                  {result.copywriting.title.variations.map((title, i) => (
                    <p key={i} className="text-sm text-gray-700">{i + 1}. {title}</p>
                  ))}
                </div>
              </div>
            </Card>

            {/* 核心卖点 */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">核心卖点</h3>
              <div className="space-y-2">
                {result.copywriting.corePoints.map((point, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <Badge variant={point.emphasis === 'high' ? 'default' : 'secondary'}>
                      {point.emphasis === 'high' ? '高' : point.emphasis === 'medium' ? '中' : '低'}
                    </Badge>
                    <p className="flex-1">{point.text}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* 商品描述 */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">商品描述</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(result.copywriting!.description.long, '描述')}
                >
                  {copiedItem === '描述' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{result.copywriting.description.long}</p>
              </div>
            </Card>

            {/* SEO关键词 */}
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">SEO关键词</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">主关键词</p>
                  <div className="flex flex-wrap gap-2">
                    {result.copywriting.seo.primary.map((keyword, i) => (
                      <Badge key={i} variant="default">{keyword}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">长尾词</p>
                  <div className="flex flex-wrap gap-2">
                    {result.copywriting.seo.secondary.map((keyword, i) => (
                      <Badge key={i} variant="secondary">{keyword}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        )}

        {/* 主图提示词 */}
        {result.mainPrompts && (
          <TabsContent value="mainPrompts" className="space-y-4">
            {result.mainPrompts.prompts.map((prompt, i) => (
              <Card key={i} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">主图 {prompt.index}</h3>
                    <p className="text-sm text-muted-foreground">{prompt.title}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(prompt.chinesePrompt, `主图${prompt.index}`)}
                  >
                    {copiedItem === `主图${prompt.index}` ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Card className="p-4 bg-gray-50">
                  <p className="text-sm whitespace-pre-wrap">{prompt.chinesePrompt}</p>
                </Card>
                <p className="text-xs text-muted-foreground mt-2">
                  {prompt.renderParams}
                </p>
              </Card>
            ))}
          </TabsContent>
        )}

        {/* 详情页提示词 */}
        {result.detailPrompts && (
          <TabsContent value="detailPrompts" className="space-y-4">
            {result.detailPrompts.prompts.map((prompt, i) => (
              <Card key={i} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">详情页 {prompt.index}</h3>
                    <p className="text-sm text-muted-foreground">{prompt.keyword}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(prompt.chinesePrompt, `详情页${prompt.index}`)}
                  >
                    {copiedItem === `详情页${prompt.index}` ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Card className="p-4 bg-gray-50">
                  <p className="text-sm whitespace-pre-wrap">{prompt.chinesePrompt}</p>
                </Card>
                <p className="text-xs text-muted-foreground mt-2">
                  {prompt.renderParams}
                </p>
              </Card>
            ))}
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div>
  );
}
