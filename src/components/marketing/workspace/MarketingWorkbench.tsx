'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopywritingTab } from './CopywritingTab';
import { GeoTab } from './GeoTab';
import { InsightTab } from './InsightTab';
import { ResultsPanel } from './ResultsPanel';
import { SeoTab } from './SeoTab';
import { TranslateTab } from './TranslateTab';
import { TaskDetail } from './use-task-polling';
import type { ModelConfigSummary } from '@/types/model-config';
import type { GenerateTaskData } from '@/types/marketing-contract';

// ============================================
// 五 Tab 营销工作台（V3 3.1/4.1）
// 桌面左右分栏、移动端上下排列；Tab 切换不清空状态。
// Phase 6：提交后后台执行，本轮作品显示执行进度。
// Phase 7：市场洞察需联网搜索服务（未配置时不可提交）。
// ============================================

const TAB_ITEMS = [
  { value: 'copywriting', label: '文案创作', phase: '可用' },
  { value: 'translate', label: '多语言翻译', phase: '可用' },
  { value: 'seo', label: 'SEO 优化', phase: '可用' },
  { value: 'geo', label: 'GEO 优化', phase: '离线版' },
  { value: 'insight', label: '市场洞察', phase: '联网版' },
];

interface MarketingWorkbenchProps {
  models: ModelConfigSummary[];
}

export function MarketingWorkbench({ models }: MarketingWorkbenchProps) {
  const [currentResult, setCurrentResult] = useState<GenerateTaskData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<TaskDetail | null>(null);
  const [resultNonce, setResultNonce] = useState(0);

  const handleResult = (data: GenerateTaskData) => {
    setCurrentResult(data);
    setProgress(null);
    setResultNonce((n) => n + 1);
  };

  const handleProgress = (detail: TaskDetail | null) => {
    setProgress(detail);
  };

  return (
    <div data-testid="marketing-workspace" className="flex h-full min-h-0 flex-col gap-4 p-4 lg:p-6">
      <Tabs defaultValue="copywriting" className="flex h-full min-h-0 flex-col gap-4">
        <TabsList className="w-full justify-start overflow-x-auto" aria-label="营销模块">
          {TAB_ITEMS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
              {tab.label}
              {tab.phase !== '可用' && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                  {tab.phase}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:grid-rows-1">
          {/* 左侧：当前 Tab 输入 */}
          <div className="min-h-0 overflow-y-auto">
            <TabsContent value="copywriting" forceMount className="mt-0 data-[state=inactive]:hidden">
              <CopywritingTab
                models={models}
                generating={generating}
                onGeneratingChange={setGenerating}
                onProgress={handleProgress}
                onResult={handleResult}
              />
            </TabsContent>
            <TabsContent value="translate" forceMount className="mt-0 data-[state=inactive]:hidden">
              <TranslateTab
                models={models}
                generating={generating}
                onGeneratingChange={setGenerating}
                onProgress={handleProgress}
                onResult={handleResult}
              />
            </TabsContent>
            <TabsContent value="seo" forceMount className="mt-0 data-[state=inactive]:hidden">
              <SeoTab
                models={models}
                generating={generating}
                onGeneratingChange={setGenerating}
                onProgress={handleProgress}
                onResult={handleResult}
              />
            </TabsContent>
            <TabsContent value="geo" forceMount className="mt-0 data-[state=inactive]:hidden">
              <GeoTab
                models={models}
                generating={generating}
                onGeneratingChange={setGenerating}
                onProgress={handleProgress}
                onResult={handleResult}
              />
            </TabsContent>
            <TabsContent value="insight" forceMount className="mt-0 data-[state=inactive]:hidden">
              <InsightTab
                models={models}
                generating={generating}
                onGeneratingChange={setGenerating}
                onProgress={handleProgress}
                onResult={handleResult}
              />
            </TabsContent>
          </div>

          {/* 右侧：本轮结果 / 窗口历史 / 全部作品 */}
          <div className="min-h-0 overflow-y-auto">
            <ResultsPanel
              currentResult={currentResult}
              generating={generating}
              progress={progress}
              refreshNonce={resultNonce}
            />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
