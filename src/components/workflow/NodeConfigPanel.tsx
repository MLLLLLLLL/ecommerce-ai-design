'use client';

import { useEffect, useState } from 'react';
import { Node } from 'reactflow';
import { Shuffle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  NodeData,
  NodeRegistry,
  NodeFieldSchema,
  IntegerFieldSchema,
  FloatFieldSchema,
} from '@/lib/workflow/nodes/base';
import { useAIServices } from '@/hooks/useAIService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader } from '@/components/image-to-image/ImageUploader';
import { PromptOptimizeDialog } from '@/components/shared/PromptOptimizeDialog';
import { usePromptOptimize } from '@/hooks/usePromptOptimize';
import type { ModelConfigSummary } from '@/types/model-config';
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  computeSize,
  Resolution,
} from '@/components/text-to-image/ParameterPanel';

interface NodeConfigPanelProps {
  node: Node<NodeData> | null;
  onConfigChange: (nodeId: string, key: string, value: any) => void;
}

// 数值字段：自由输入，失焦时校验并收敛至合法范围
// 通过 key 绑定字段与节点，切换时由 React 重建组件以同步外部值，避免在 effect 中 setState
function NumberField({
  field,
  value,
  onChange,
}: {
  field: IntegerFieldSchema | FloatFieldSchema;
  value: any;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : '');

  const commit = () => {
    let num = Number(text);
    if (Number.isNaN(num)) {
      num = field.default ?? 0;
    }
    if (field.type === 'integer') {
      num = Math.round(num);
    }
    if (field.min !== undefined) num = Math.max(field.min, num);
    if (field.max !== undefined) num = Math.min(field.max, num);
    setText(String(num));
    onChange(num);
  };

  return (
    // number 类型输入框不支持选中 API，改用 text + 数字键盘，聚焦全选、失焦收敛
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

// 种子字段：随机/固定切换（借鉴 ComfyUI/InvokeAI 的 seed 交互）
function SeedField({
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
        onCheckedChange={(checked) => {
          onChange(
            checked
              ? -1
              : Math.floor(Math.random() * 2147483647)
          );
        }}
      />
      <span className="text-xs text-muted-foreground">随机</span>
      {!isRandom && (
        <>
          <Input
            type="text"
            inputMode="numeric"
            className="flex-1"
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
            title="换一个种子"
            onClick={() => onChange(Math.floor(Math.random() * 2147483647))}
          >
            <Shuffle className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

// AI 服务选择字段
function ServiceField({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: string) => void;
}) {
  const { services, activeServiceId } = useAIServices();

  if (services.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        尚未配置 AI 服务，请先到「设置」页面添加（执行时将使用激活的中转站服务）
      </p>
    );
  }

  return (
    <Select
      value={value || activeServiceId || ''}
      onValueChange={(v) => onChange(v)}
    >
      <SelectTrigger>
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

// 提示词优化按钮（复刻文生图页面的优化交互：流式对比弹窗，接受后回填）
function OptimizePromptButton({
  getText,
  onAccept,
}: {
  getText: () => string;
  onAccept: (text: string) => void;
}) {
  const [modelId, setModelId] = useState<string | null>(null);
  const {
    dialogOpen,
    setDialogOpen,
    optimizing,
    optimizedText,
    originalPrompt,
    error,
    optimize,
    accept,
    cancel,
  } = usePromptOptimize();

  const handleOptimize = () => {
    const prompt = getText();
    if (!prompt.trim()) return;

    if (!modelId) {
      toast.error('请先在设置页的「文本模型」标签中配置提示词优化模型');
      return;
    }

    void optimize(modelId, prompt.trim(), 'text-to-image');
  };

  useEffect(() => {
    const loadDefaultModel = async () => {
      try {
        const response = await fetch('/api/model-configs');
        const data = await response.json();
        const models = data.models as ModelConfigSummary[] | undefined;
        const model = models?.find((item) => item.isActive && item.isDefault && item.capabilities.jsonMode)
          || models?.find((item) => item.isActive && item.capabilities.jsonMode);
        setModelId(model?.id || null);
      } catch {
        setModelId(null);
      }
    };
    void loadDefaultModel();
  }, []);

  const handleAccept = () => {
    const text = accept();
    if (text) onAccept(text);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-xs text-muted-foreground"
        onClick={handleOptimize}
      >
        <Sparkles className="h-3.5 w-3.5" />
        优化提示词
      </Button>
      <PromptOptimizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        originalPrompt={originalPrompt}
        optimizedPrompt={optimizedText}
        loading={optimizing}
        error={error}
        onAccept={handleAccept}
        onCancel={cancel}
      />
    </>
  );
}

// 分辨率+比例联动控件（与文生图页面交互一致：尺寸随分辨率等比缩放）
function ResolutionControl({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  const resolution: Resolution = config.resolution || '1k';
  const aspect: string = config.aspect || '1:1';
  const multiplier =
    RESOLUTIONS.find((r) => r.value === resolution)?.multiplier ?? 1;

  const apply = (nextResolution: Resolution, nextAspect: string) => {
    const size = computeSize(nextResolution, nextAspect);
    onChange('resolution', nextResolution);
    onChange('aspect', nextAspect);
    onChange('width', size.width);
    onChange('height', size.height);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {RESOLUTIONS.map((r) => (
          <Button
            key={r.value}
            type="button"
            variant={resolution === r.value ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            onClick={() => apply(r.value, aspect)}
          >
            {r.label}
          </Button>
        ))}
      </div>
      <Select value={aspect} onValueChange={(v) => apply(resolution, v)}>
        <SelectTrigger>
          <SelectValue placeholder="选择比例" />
        </SelectTrigger>
        <SelectContent>
          {ASPECT_RATIOS.map((a) => (
            <SelectItem key={a.ratio} value={a.ratio}>
              {a.ratio} ({a.width * multiplier}×{a.height * multiplier})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// 单个字段的控件分发
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: NodeFieldSchema;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (field.type) {
    case 'integer':
    case 'float':
      // key 变化时重建输入框，保证切换节点/字段时回显外部值
      return (
        <NumberField
          key={`${field.label}-${value}`}
          field={field}
          value={value}
          onChange={onChange}
        />
      );
    case 'string':
      return field.multiline ? (
        <Textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      );
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <span className="text-xs text-muted-foreground">
            {value ? '开启' : '关闭'}
          </span>
        </div>
      );
    case 'combo':
      return (
        <Select value={value ?? field.default} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
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
    case 'seed':
      return <SeedField value={value} onChange={onChange} />;
    case 'image':
      return <ImageUploader value={value} onChange={onChange} />;
    case 'service':
      return <ServiceField value={value} onChange={onChange} />;
    default:
      return null;
  }
}

/**
 * 节点配置面板（借鉴 InvokeAI 的字段表单渲染）
 * 根据节点 getConfigSchema() 动态渲染表单控件
 */
export function NodeConfigPanel({ node, onConfigChange }: NodeConfigPanelProps) {
  if (!node) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        选择一个节点以编辑配置
      </div>
    );
  }

  const impl = NodeRegistry.get(node.data.type);
  if (!impl) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        未知节点类型：{node.data.type}
      </div>
    );
  }

  const schema = impl.getConfigSchema();
  const entries = Object.entries(schema);
  const config = node.data.config || {};

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div>
          <h3 className="text-sm font-semibold">{impl.name}</h3>
          <p className="text-xs text-muted-foreground">{impl.description}</p>
        </div>

        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">该节点无可配置参数</p>
        )}

        {entries.map(([key, field]) => {
          // 比例字段并入分辨率联动控件渲染
          if (key === 'aspect' && schema.resolution) return null;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-red-500">*</span>}
                </Label>
                {/* 文本输入节点的文本内容字段：复刻提示词优化按钮 */}
                {node.data.type === 'textInput' && key === 'text' && (
                  <OptimizePromptButton
                    getText={() => config.text || ''}
                    onAccept={(t) => onConfigChange(node.id, 'text', t)}
                  />
                )}
              </div>
              {field.description && (
                <p className="text-[11px] text-muted-foreground">
                  {field.description}
                </p>
              )}
              {key === 'resolution' && schema.aspect ? (
                <ResolutionControl
                  config={config}
                  onChange={(k, v) => onConfigChange(node.id, k, v)}
                />
              ) : (
                <FieldControl
                  field={field}
                  value={config[key]}
                  onChange={(v) => onConfigChange(node.id, key, v)}
                />
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
