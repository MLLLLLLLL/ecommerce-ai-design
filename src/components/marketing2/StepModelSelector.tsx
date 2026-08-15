'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAPABILITY_LABELS } from '@/lib/marketing2/workflow-registry';
import type { ModelCapabilities, ModelCapabilityKey, ModelConfigSummary } from '@/types/model-config';

// ============================================
// 步骤模型选择器（交互 7）
// 模型唯一来源是设置页；只展示当前用户、已启用、实测通过且能力匹配的模型；
// 支持“跟随上一步模型”与单独选择；模型停用或实测失效时执行按钮由服务端禁用。
// ============================================

const FOLLOW_PREVIOUS = '__follow_previous__';

function satisfies(capabilities: ModelCapabilities, required: ModelCapabilityKey[]): boolean {
  return required.every((key) => capabilities[key]);
}

export function StepModelSelector({
  label,
  selectorKey,
  requiredCapabilities,
  models,
  value,
  onChange,
  followPrevious,
}: {
  label: string;
  selectorKey: string;
  requiredCapabilities: ModelCapabilityKey[];
  models: ModelConfigSummary[];
  value: string;
  onChange: (selectorKey: string, modelId: string) => void;
  followPrevious?: { id: string; name: string } | null;
}) {
  const enabledMatching = models.filter(
    (model) => model.isActive && satisfies(model.capabilities, requiredCapabilities)
  );
  // 交互 7.2：只展示已启用、实测通过且能力匹配的模型
  const candidates = enabledMatching.filter((model) => model.testStatus === 'passed');
  const untestedCount = enabledMatching.length - candidates.length;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {candidates.length === 0 && !followPrevious ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          没有满足能力（
          {requiredCapabilities.map((key) => CAPABILITY_LABELS[key] ?? key).join('、')}
          ）且实测通过的模型。
          <Link href="/settings" className="underline">去设置</Link>
        </p>
      ) : (
        <Select
          value={value || candidates[0]?.id || FOLLOW_PREVIOUS}
          onValueChange={(id) => {
            if (id === FOLLOW_PREVIOUS) {
              if (followPrevious) onChange(selectorKey, followPrevious.id);
              return;
            }
            onChange(selectorKey, id);
          }}
        >
          <SelectTrigger aria-label={label}>
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {followPrevious && (
              <SelectItem value={FOLLOW_PREVIOUS}>跟随上一步（{followPrevious.name}）</SelectItem>
            )}
            {candidates.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}（实测通过）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {untestedCount > 0 && (
        <p className="text-xs text-amber-600">
          另有 {untestedCount} 个能力匹配模型未通过实测，按不可用处理。
          <Link href="/settings" className="underline">前往实测</Link>
        </p>
      )}
      {value && (
        <div className="flex flex-wrap gap-1">
          {requiredCapabilities.map((key) => (
            <Badge key={key} variant="outline" className="text-[10px]">
              {CAPABILITY_LABELS[key] ?? key}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
