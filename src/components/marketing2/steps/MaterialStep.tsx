'use client';

import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { marketing2Api } from '@/components/marketing2/hooks/use-marketing2-run';
import {
  DETAIL_PAGE_COUNT_RANGE,
  MAIN_IMAGE_COUNT_RANGE,
  TOTAL_IMAGE_ITEM_LIMIT,
} from '@/lib/marketing2/schemas';

// ============================================
// 阶段一：素材与参数（交互 6.1）
// 图片 1-5 张（上传/资源库/删除/替换），平台、输出数量规则、
// 产品、定位、约束分组。
// ============================================

const PLATFORMS = [
  { value: 'taobao', label: '淘宝' },
  { value: 'tmall', label: '天猫' },
  { value: 'jd', label: '京东' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'amazon', label: '亚马逊' },
  { value: 'other', label: '其他' },
];

function ImagePicker({
  images,
  onChange,
  disabled,
  max = 5,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = max - images.length;
    if (remaining <= 0) {
      toast.error(`最多 ${max} 张图片`);
      return;
    }
    setUploading(true);
    try {
      const saved = await marketing2Api.upload(Array.from(files).slice(0, remaining));
      onChange([...images, ...saved.map((file) => file.url)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((url, index) => (
          <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`产品图 ${index + 1}`} className="h-full w-full object-cover" />
            {!disabled && (
              <button
                type="button"
                aria-label={`删除第 ${index + 1} 张图片`}
                className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onChange(images.filter((item) => item !== url))}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {!disabled && images.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent"
          >
            <Upload className="h-4 w-4" />
            {uploading ? '上传中' : '上传'}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <p className="text-xs text-muted-foreground">
        支持 JPEG/PNG/WebP，单张不超过 10MB，{images.length}/{max} 张
      </p>
    </div>
  );
}

function CountField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | 'auto';
  min: number;
  max: number;
  onChange: (value: number | 'auto') => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Select
          value={value === 'auto' ? 'auto' : 'manual'}
          onValueChange={(mode) => onChange(mode === 'auto' ? 'auto' : min)}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动规划</SelectItem>
            <SelectItem value="manual">手动指定</SelectItem>
          </SelectContent>
        </Select>
        {value !== 'auto' && (
          <Input
            type="number"
            className="w-24"
            min={min}
            max={max}
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              onChange(Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : min);
            }}
          />
        )}
      </div>
    </div>
  );
}

export interface MaterialStepProps {
  value: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
  disabled?: boolean;
}
export function MaterialStep({ value, onChange, disabled }: MaterialStepProps) {
  const set = (key: string, fieldValue: unknown) => onChange({ ...value, [key]: fieldValue });
  const images = (value.productImages as string[]) ?? [];
  const sellPoints = (value.sellPoints as string[]) ?? [];
  const forbidden = (value.forbidden as string[]) ?? [];

  const total =
    typeof value.mainImageCount === 'number' && typeof value.detailPageCount === 'number'
      ? value.mainImageCount + value.detailPageCount
      : null;

  return (
    <div className="space-y-6">
      {/* 图片 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">产品图</h3>
        <ImagePicker images={images} onChange={(next) => set('productImages', next)} disabled={disabled} />
      </section>

      {/* 产品信息 */}
      <section className="space-y-3">
          <h3 className="text-sm font-medium">产品信息</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">产品名称 *</Label>
              <Input
                value={(value.productName as string) ?? ''}
                disabled={disabled}
                onChange={(e) => set('productName', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">品牌名</Label>
              <Input
                value={(value.brandName as string) ?? ''}
                disabled={disabled}
                onChange={(e) => set('brandName', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">核心卖点（逗号分隔）</Label>
            <Input
              value={sellPoints.join('，')}
              disabled={disabled}
              onChange={(e) =>
                set('sellPoints', e.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">禁止出现（逗号分隔）</Label>
            <Input
              value={forbidden.join('，')}
              disabled={disabled}
              onChange={(e) =>
                set('forbidden', e.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))
              }
            />
          </div>
        </section>

      {/* 定位与约束（交互 6.1） */}
      <section className="space-y-3">
          <h3 className="text-sm font-medium">定位与约束</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">目标人群</Label>
              <Input
                value={(value.targetAudience as string) ?? ''}
                disabled={disabled}
                onChange={(e) => set('targetAudience', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">价格带 / 定位</Label>
              <Input
                value={(value.positioning as string) ?? ''}
                disabled={disabled}
                onChange={(e) => set('positioning', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">使用场景（逗号分隔）</Label>
            <Input
              value={((value.scenes as string[]) ?? []).join('，')}
              disabled={disabled}
              onChange={(e) =>
                set('scenes', e.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">设计风格</Label>
              <Input
                value={(value.designStyle as string) ?? ''}
                disabled={disabled}
                onChange={(e) => set('designStyle', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">其他要求</Label>
            <Textarea
              rows={2}
              value={(value.extraRequirements as string) ?? ''}
              disabled={disabled}
              onChange={(e) => set('extraRequirements', e.target.value)}
            />
          </div>
      </section>

      {/* 平台与输出 */}
      <section className="space-y-3">
          <h3 className="text-sm font-medium">平台与输出</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">目标平台</Label>
              <Select
                value={(value.platform as string) ?? 'taobao'}
                onValueChange={(platform) => set('platform', platform)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((platform) => (
                    <SelectItem key={platform.value} value={platform.value}>
                      {platform.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CountField
              label={`主图数量（${MAIN_IMAGE_COUNT_RANGE.min}-${MAIN_IMAGE_COUNT_RANGE.max}）`}
              value={(value.mainImageCount as number | 'auto') ?? 'auto'}
              min={MAIN_IMAGE_COUNT_RANGE.min}
              max={MAIN_IMAGE_COUNT_RANGE.max}
              onChange={(count) => set('mainImageCount', count)}
            />
            <CountField
              label={`详情页数量（${DETAIL_PAGE_COUNT_RANGE.min}-${DETAIL_PAGE_COUNT_RANGE.max}）`}
              value={(value.detailPageCount as number | 'auto') ?? 'auto'}
              min={DETAIL_PAGE_COUNT_RANGE.min}
              max={DETAIL_PAGE_COUNT_RANGE.max}
              onChange={(count) => set('detailPageCount', count)}
            />
          </div>
          {total !== null && total > TOTAL_IMAGE_ITEM_LIMIT && (
            <p className="text-xs text-destructive">
              主图与详情页合计 {total} 个，超过单次任务上限 {TOTAL_IMAGE_ITEM_LIMIT} 个，请调整数量。
            </p>
          )}
        </section>
    </div>
  );
}
