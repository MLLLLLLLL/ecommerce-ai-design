'use client';

import { useState } from 'react';
import { Loader2, Play, Shuffle } from 'lucide-react';
import { OrchestratorNode } from '@/lib/workflow/nodes/orchestrator';
import type { NodeConfigSchema, NodeFieldSchema } from '@/lib/workflow/nodes/base';
import { useAIServices } from '@/hooks/useAIService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CanvasNodeData, CanvasNodeMetadata } from '@/lib/canvas/nodes/types';

// 编排节点面板：用 workflow OrchestratorNode 的 schema 驱动简版表单，
// 字段经 FIELD_MAP 映射到画布节点 metadata（serviceId 仅存 id，执行时才解析完整配置）
const SCHEMA: NodeConfigSchema = new OrchestratorNode().getConfigSchema();

const FIELD_MAP: Record<string, keyof CanvasNodeMetadata> = {
  composerContent: 'composerContent',
  mode: 'mode',
  systemPrompt: 'systemPrompt',
  imageCount: 'imageCount',
  serviceConfig: 'serviceId',
  negativePrompt: 'negativePrompt',
  strength: 'strength',
  width: 'genWidth',
  height: 'genHeight',
  steps: 'steps',
  cfgScale: 'cfgScale',
  seed: 'seed',
};

// 跳过 resolution/aspect 联动（画布面板直接用宽高输入）
const SKIP_KEYS = new Set(['resolution', 'aspect']);

interface ConfigNodeBodyProps {
  node: CanvasNodeData;
  onPatchMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
  onExecute: (node: CanvasNodeData) => void;
}

export function ConfigNodeBody({
  node,
  onPatchMetadata,
  onExecute,
}: ConfigNodeBodyProps) {
  const running = node.metadata.status === 'running';
  const meta = node.metadata;

  const patch = (patch: Partial<CanvasNodeMetadata>) =>
    onPatchMetadata(node.id, patch);

  return (
    <div data-canvas-scroll className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain text-xs">
      {Object.entries(SCHEMA)
        .filter(([key]) => !SKIP_KEYS.has(key))
        .map(([key, field]) => (
          <FieldControl
            key={key}
            fieldKey={key}
            field={field}
            value={meta[FIELD_MAP[key]]}
            onChange={(v) => patch({ [FIELD_MAP[key]]: v })}
          />
        ))}

      {/* 执行按钮 + 状态 */}
      <div className="sticky bottom-0 mt-1 border-t border-slate-100 pt-2">
        {meta.error && (
          <p className="mb-1 break-all text-red-500">{meta.error}</p>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 flex-1"
            disabled={running}
            onClick={() => onExecute(node)}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 h-3.5 w-3.5" />
            )}
            {running ? '生成中…' : '执行生成'}
          </Button>
          {meta.status === 'success' && (
            <span className="text-emerald-500">✓</span>
          )}
        </div>

        {/* 结果预览 */}
        {meta.resultText && (
          <pre className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-all rounded border bg-slate-50 p-1.5 text-[10px] text-slate-600">
            {meta.resultText}
          </pre>
        )}
        {meta.resultImages && meta.resultImages.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            {meta.resultImages.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="生成结果"
                className="h-16 w-full rounded border object-cover"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 简版 schema 字段渲染（复用 workflow 配置面板的交互模式） ----------

function FieldControl({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: NodeFieldSchema;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-slate-600">
        {field.label}
        {field.required && <span className="text-red-500">*</span>}
      </span>
      <FieldInput fieldKey={fieldKey} field={field} value={value} onChange={onChange} />
    </div>
  );
}

function FieldInput({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: NodeFieldSchema;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (field.type) {
    case 'string':
      return field.multiline ? (
        <Textarea
          className="min-h-16 text-xs"
          value={value || ''}
          placeholder={fieldKey === 'composerContent' ? '支持 {promptA} 引用上游文本' : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          className="h-7 text-xs"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'combo':
      return (
        <Select value={value || field.default} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'integer':
    case 'float':
      return (
        <NumberInput
          value={value}
          min={field.min}
          max={field.max}
          integer={field.type === 'integer'}
          onChange={onChange}
        />
      );

    case 'seed':
      return <SeedInput value={value} onChange={onChange} />;

    case 'service':
      return <ServiceInput value={value} onChange={onChange} />;

    default:
      return null;
  }
}

function NumberInput({
  value,
  min,
  max,
  integer,
  onChange,
}: {
  value: any;
  min?: number;
  max?: number;
  integer: boolean;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : '');

  const commit = () => {
    let num = Number(text);
    if (Number.isNaN(num)) num = 0;
    if (integer) num = Math.round(num);
    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);
    setText(String(num));
    onChange(num);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-7 text-xs"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function SeedInput({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: number) => void;
}) {
  const isRandom = value === undefined || value === null || value < 0;

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={isRandom}
        onCheckedChange={(checked) =>
          onChange(checked ? -1 : Math.floor(Math.random() * 2147483647))
        }
      />
      <span className="text-slate-500">随机</span>
      {!isRandom && (
        <>
          <Input
            type="text"
            inputMode="numeric"
            className="h-7 flex-1 text-xs"
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const num = Number(e.target.value);
              onChange(Number.isNaN(num) ? 0 : Math.max(0, Math.round(num)));
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6"
            title="换一个种子"
            onClick={() => onChange(Math.floor(Math.random() * 2147483647))}
          >
            <Shuffle className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
}

function ServiceInput({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: string) => void;
}) {
  const { services, activeServiceId } = useAIServices();

  if (services.length === 0) {
    return (
      <p className="text-slate-400">
        尚未配置 AI 服务，请先到「设置」页面添加（执行时使用激活服务）
      </p>
    );
  }

  return (
    <Select value={value || activeServiceId || ''} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue placeholder="选择 AI 服务" />
      </SelectTrigger>
      <SelectContent>
        {services.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
            {s.id === activeServiceId ? '（激活）' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
