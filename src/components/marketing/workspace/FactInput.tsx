'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================
// 已确认事实输入（V3 9.1）
// 用户明确填写的事实（key-value）将作为 confirmed 事实，
// 进入 SEO/GEO 引擎的可发布内容；未填写的内容不会被编造。
// ============================================

export interface FactDraftItem {
  key: string;
  value: string;
}

interface FactInputProps {
  facts: FactDraftItem[];
  onChange: (facts: FactDraftItem[]) => void;
  /** 多个 Tab 同时挂载时用于区分表单控件的标签前缀。 */
  labelPrefix?: string;
}

export function FactInput({ facts, onChange, labelPrefix = '' }: FactInputProps) {
  const [draft, setDraft] = useState<FactDraftItem>({ key: '', value: '' });

  const addFact = () => {
    if (!draft.key.trim() || !draft.value.trim()) {
      toast.error('事实的键与值都不能为空');
      return;
    }
    onChange([...facts, { key: draft.key.trim(), value: draft.value.trim() }]);
    setDraft({ key: '', value: '' });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        您明确填写的事实将作为已确认信息进入生成内容；未填写的内容不会被编造。
      </p>
      {facts.length > 0 && (
        <div className="space-y-1.5">
          {facts.map((fact, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="shrink-0 font-medium">{fact.key}：</span>
              <span className="min-w-0 flex-1 truncate">{fact.value}</span>
              <button
                type="button"
                aria-label={`移除事实 ${fact.key}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => onChange(facts.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft.key}
          onChange={(event) => setDraft({ ...draft, key: event.target.value })}
          placeholder="键（如：材质）"
          className="max-w-40"
          aria-label={`${labelPrefix}事实键`}
        />
        <Input
          value={draft.value}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          placeholder="值（如：316 不锈钢）"
          aria-label={`${labelPrefix}事实值`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addFact();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`${labelPrefix}添加事实`}
          onClick={addFact}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
