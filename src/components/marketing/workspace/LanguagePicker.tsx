'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { groupLanguagesByGroup, MARKETING_LANGUAGES } from '@/lib/marketing/languages';
import { TRANSLATE_TARGET_MAX } from '@/lib/marketing/schemas';

// ============================================
// 目标语言多选器（V3 Phase 3）
// 分组展示 + 搜索过滤 + 已选 chips；最多 10 种。
// ============================================

interface LanguagePickerProps {
  value: string[];
  onChange: (languages: string[]) => void;
  max?: number;
}

export function LanguagePicker({ value, onChange, max = TRANSLATE_TARGET_MAX }: LanguagePickerProps) {
  const [search, setSearch] = useState('');
  const groups = useMemo(() => groupLanguagesByGroup(), []);

  const query = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!query) return [...groups.entries()];
    const result: [string, typeof MARKETING_LANGUAGES][] = [];
    for (const [group, options] of groups.entries()) {
      const matched = options.filter(
        (option) =>
          option.code.toLowerCase().includes(query) ||
          option.label.toLowerCase().includes(query) ||
          option.nativeLabel.toLowerCase().includes(query)
      );
      if (matched.length > 0) result.push([group, matched]);
    }
    return result;
  }, [groups, query]);

  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((item) => item !== code));
    } else if (value.length < max) {
      onChange([...value, code]);
    }
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => {
            const option = MARKETING_LANGUAGES.find((item) => item.code === code);
            return (
              <Badge key={code} variant="secondary" className="gap-1 pr-1">
                {option ? `${option.label}（${option.code}）` : code}
                <button
                  type="button"
                  aria-label={`移除 ${option?.label ?? code}`}
                  className="rounded-full hover:bg-muted"
                  onClick={() => toggle(code)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜索语言（中文名/本地名/代码）"
        aria-label="搜索语言"
      />

      <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
        {filteredGroups.map(([group, options]) => (
          <div key={group} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{group}</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {options.map((option) => {
                const checked = value.includes(option.code);
                const disabled = !checked && value.length >= max;
                return (
                  <label
                    key={option.code}
                    className={`flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-sm ${disabled ? 'opacity-50' : 'hover:bg-muted'}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(option.code)}
                    />
                    <span className="min-w-0 flex-1 truncate" title={`${option.label}（${option.nativeLabel}）`}>
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">没有匹配的语言</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        已选 {value.length}/{max} 种，一次最多翻译 {max} 种语言，同时请求 3 种。
      </p>
    </div>
  );
}
