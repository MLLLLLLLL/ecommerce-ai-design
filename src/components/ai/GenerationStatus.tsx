'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAIService } from '@/hooks/useAIService';
import { Clock, Zap, CheckCircle } from 'lucide-react';
import type { AIServiceConfig } from '@/types/ai';

interface GenerationStatusProps {
  config?: AIServiceConfig | null;
}

export function GenerationStatus({ config: selectedConfig }: GenerationStatusProps) {
  const { config: activeConfig, isReady: activeIsReady } = useAIService();
  const config = selectedConfig ?? activeConfig;
  const isReady = selectedConfig ? true : activeIsReady;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">生成状态</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 服务状态 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">AI服务</span>
            <Badge variant={isReady ? 'default' : 'secondary'}>
              {isReady ? '已就绪' : '未配置'}
            </Badge>
          </div>
          {config && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">提供商</span>
                <span className="font-medium">{config.provider}</span>
              </div>
              {config.model && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">模型</span>
                  <span className="font-medium">{config.model}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">并发数</span>
                <span className="font-medium">{config.maxConcurrent || 50}</span>
              </div>
            </>
          )}
        </div>

        {!isReady && (
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            请先在设置中配置 AI 服务
          </div>
        )}

        {/* 队列统计 */}
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-sm font-medium">队列统计</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">等待中</span>
                  <span className="font-medium">0</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">处理中</span>
                  <span className="font-medium">0</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">已完成</span>
                  <span className="font-medium">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 提示 */}
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          💡 提示：生成速度取决于 AI 服务响应时间
        </div>
      </CardContent>
    </Card>
  );
}
