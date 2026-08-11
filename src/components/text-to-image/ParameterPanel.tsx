'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

export interface GenerationParams {
  width: number;
  height: number;
  samples: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

interface ParameterPanelProps {
  params: GenerationParams;
  onChange: (params: GenerationParams) => void;
  disabled?: boolean;
}

const PRESET_SIZES = [
  { label: '1:1 (1024×1024)', width: 1024, height: 1024 },
  { label: '16:9 (1344×768)', width: 1344, height: 768 },
  { label: '9:16 (768×1344)', width: 768, height: 1344 },
  { label: '4:3 (1152×896)', width: 1152, height: 896 },
  { label: '3:4 (896×1152)', width: 896, height: 1152 },
];

export function ParameterPanel({
  params,
  onChange,
  disabled = false,
}: ParameterPanelProps) {
  const handleSizeChange = (value: string) => {
    const preset = PRESET_SIZES.find((s) => s.label === value);
    if (preset) {
      onChange({ ...params, width: preset.width, height: preset.height });
    }
  };

  const currentSizeLabel =
    PRESET_SIZES.find(
      (s) => s.width === params.width && s.height === params.height
    )?.label || '自定义';

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <h3 className="font-semibold">生成参数</h3>

      {/* 尺寸选择 */}
      <div className="space-y-2">
        <Label>图片尺寸</Label>
        <Select
          value={currentSizeLabel}
          onValueChange={handleSizeChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_SIZES.map((size) => (
              <SelectItem key={size.label} value={size.label}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 生成数量 */}
      <div className="space-y-2">
        <Label>生成数量: {params.samples}</Label>
        <Slider
          value={[params.samples]}
          onValueChange={([value]) => onChange({ ...params, samples: value })}
          min={1}
          max={4}
          step={1}
          disabled={disabled}
        />
      </div>

      {/* 采样步数 */}
      <div className="space-y-2">
        <Label>采样步数: {params.steps || 20}</Label>
        <Slider
          value={[params.steps || 20]}
          onValueChange={([value]) => onChange({ ...params, steps: value })}
          min={10}
          max={50}
          step={5}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          步数越多，质量越好，但生成时间越长
        </p>
      </div>

      {/* CFG Scale */}
      <div className="space-y-2">
        <Label>提示词相关度: {params.cfgScale || 7}</Label>
        <Slider
          value={[params.cfgScale || 7]}
          onValueChange={([value]) => onChange({ ...params, cfgScale: value })}
          min={1}
          max={20}
          step={0.5}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          值越高，越严格遵循提示词
        </p>
      </div>

      {/* 随机种子 */}
      <div className="space-y-2">
        <Label>随机种子（可选）</Label>
        <Input
          type="number"
          placeholder="留空使用随机值"
          value={params.seed || ''}
          onChange={(e) =>
            onChange({
              ...params,
              seed: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          相同的种子+提示词会生成相似的图片
        </p>
      </div>
    </div>
  );
}
