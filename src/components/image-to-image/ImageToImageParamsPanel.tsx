'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Resolution = '1k' | '2k' | '4k';

export interface ImageToImageParams {
  width: number;
  height: number;
  samples: number;
  strength: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  resolution?: Resolution;
  aspect?: string;
}

interface ImageToImageParamsPanelProps {
  params: ImageToImageParams;
  onChange: (params: ImageToImageParams) => void;
  disabled?: boolean;
}

// 1K 分辨率下各比例的基础尺寸
const ASPECT_RATIOS = [
  { ratio: '1:1', width: 1024, height: 1024 },
  { ratio: '16:9', width: 1344, height: 768 },
  { ratio: '9:16', width: 768, height: 1344 },
  { ratio: '4:3', width: 1152, height: 896 },
  { ratio: '3:4', width: 896, height: 1152 },
];

const RESOLUTIONS: {
  value: Resolution;
  label: string;
  multiplier: number;
}[] = [
  { value: '1k', label: '1K', multiplier: 1 },
  { value: '2k', label: '2K', multiplier: 2 },
  { value: '4k', label: '4K', multiplier: 4 },
];

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export function ImageToImageParamsPanel({
  params,
  onChange,
  disabled = false,
}: ImageToImageParamsPanelProps) {
  const resolution = params.resolution || '1k';
  const aspect = params.aspect || '1:1';
  const multiplier =
    RESOLUTIONS.find((r) => r.value === resolution)?.multiplier ?? 1;

  // 应用分辨率+比例组合，计算最终宽高
  const applySize = (nextResolution: Resolution, nextAspect: string) => {
    const mult =
      RESOLUTIONS.find((r) => r.value === nextResolution)?.multiplier ?? 1;
    const ratio =
      ASPECT_RATIOS.find((a) => a.ratio === nextAspect) || ASPECT_RATIOS[0];
    onChange({
      ...params,
      resolution: nextResolution,
      aspect: nextAspect,
      width: ratio.width * mult,
      height: ratio.height * mult,
    });
  };

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <h3 className="font-semibold">生成参数</h3>

      {/* 分辨率 */}
      <div className="space-y-2">
        <Label>分辨率</Label>
        <div className="grid grid-cols-3 gap-2">
          {RESOLUTIONS.map((r) => (
            <Button
              key={r.value}
              type="button"
              variant={resolution === r.value ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              disabled={disabled}
              onClick={() => applySize(r.value, aspect)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 比例选择（尺寸随分辨率缩放） */}
      <div className="space-y-2">
        <Label>图片尺寸</Label>
        <Select
          value={aspect}
          onValueChange={(value) => applySize(resolution, value)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
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

      {/* 强度控制 */}
      <div className="space-y-2">
        <Label>变化强度</Label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={params.strength}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ ...params, strength: Number.isNaN(v) ? 0 : v });
          }}
          onBlur={() =>
            onChange({ ...params, strength: clamp(params.strength, 0, 1) })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          值越高，变化越大；值越低，越接近原图（0-1）
        </p>
      </div>

      {/* 生成数量 */}
      <div className="space-y-2">
        <Label>生成数量</Label>
        <Input
          type="number"
          min={1}
          max={4}
          step={1}
          value={params.samples}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange({ ...params, samples: Number.isNaN(v) ? 1 : v });
          }}
          onBlur={() =>
            onChange({ ...params, samples: clamp(params.samples || 1, 1, 4) })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">每次生成 1-4 张图片</p>
      </div>

      {/* 采样步数 */}
      <div className="space-y-2">
        <Label>采样步数</Label>
        <Input
          type="number"
          min={10}
          max={50}
          step={1}
          value={params.steps ?? ''}
          placeholder="默认 20"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange({ ...params, steps: Number.isNaN(v) ? undefined : v });
          }}
          onBlur={() =>
            onChange({
              ...params,
              steps:
                params.steps === undefined ? 20 : clamp(params.steps, 10, 50),
            })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          步数越多，质量越好，但生成时间越长（10-50）
        </p>
      </div>

      {/* CFG Scale */}
      <div className="space-y-2">
        <Label>提示词相关度</Label>
        <Input
          type="number"
          min={1}
          max={20}
          step={0.5}
          value={params.cfgScale ?? ''}
          placeholder="默认 7"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ ...params, cfgScale: Number.isNaN(v) ? undefined : v });
          }}
          onBlur={() =>
            onChange({
              ...params,
              cfgScale:
                params.cfgScale === undefined ? 7 : clamp(params.cfgScale, 1, 20),
            })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          值越高，越严格遵循提示词（1-20）
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
