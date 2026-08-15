'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { getAssetUrl } from '@/lib/utils';

// ============================================
// 阶段一：素材与参数（交互 6.1）
// 图片 1-5 张（上传/资源库/删除/替换），平台、输出数量规则、
// 产品、定位、约束分组；不同工作流展示各自最小输入。
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
  workflowKey: string;
  value: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
  disabled?: boolean;
}

/** 质检工作流的资产选择器：从资源库勾选已生成图片。 */
function AssetPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [assets, setAssets] = useState<{ id: string; filename: string; filepath: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/assets?pageSize=50')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.success) setAssets(data.assets ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">资源库暂无图片，请先在其它任务中生成或上传。</p>;
  }

  return (
    <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
      {assets.map((asset) => {
        const checked = selected.includes(asset.id);
        return (
          <label
            key={asset.id}
            className={`relative cursor-pointer overflow-hidden rounded-md border ${checked ? 'ring-2 ring-blue-500' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getAssetUrl(asset.filepath)} alt={asset.filename} className="h-20 w-full object-cover" />
            <span className="absolute left-1 top-1">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next === true ? [...selected, asset.id] : selected.filter((id) => id !== asset.id))
                }
              />
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function MaterialStep({ workflowKey, value, onChange, disabled }: MaterialStepProps) {
  const set = (key: string, fieldValue: unknown) => onChange({ ...value, [key]: fieldValue });
  const images = (value.productImages as string[]) ?? [];
  const sellPoints = (value.sellPoints as string[]) ?? [];
  const forbidden = (value.forbidden as string[]) ?? [];
  const prompts = (value.prompts as { kind: string; index: number; keyword: string; prompt: string }[]) ?? [];
  const referenceImages = (value.referenceImages as string[]) ?? [];
  const assetIds = (value.assetIds as string[]) ?? [];

  const total =
    typeof value.mainImageCount === 'number' && typeof value.detailPageCount === 'number'
      ? value.mainImageCount + value.detailPageCount
      : null;

  return (
    <div className="space-y-6">
      {/* 图片 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{workflowKey === 'marketing2-quality-repair' ? '待质检图片' : '产品图'}</h3>
        {workflowKey === 'marketing2-quality-repair' ? (
          <AssetPicker selected={assetIds} onChange={(ids) => set('assetIds', ids)} />
        ) : workflowKey === 'marketing2-batch-generation' ? (
          <>
            <Label className="text-xs text-muted-foreground">参考图（至少 1 张）</Label>
            <ImagePicker images={referenceImages} onChange={(next) => set('referenceImages', next)} disabled={disabled} />
          </>
        ) : (
          <ImagePicker images={images} onChange={(next) => set('productImages', next)} disabled={disabled} />
        )}
      </section>

      {/* 批量生图：提示词列表 */}
      {workflowKey === 'marketing2-batch-generation' && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">提示词（来自历史策划或手动输入，最多 {TOTAL_IMAGE_ITEM_LIMIT} 条）</h3>
          {prompts.map((plan, index) => (
            <div key={index} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center gap-2 text-xs">
                <Select
                  value={plan.kind}
                  onValueChange={(kind) => {
                    const next = [...prompts];
                    next[index] = { ...plan, kind };
                    set('prompts', next);
                  }}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_image">主图</SelectItem>
                    <SelectItem value="detail_page">详情页</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="w-32"
                  placeholder="关键词"
                  value={plan.keyword}
                  onChange={(e) => {
                    const next = [...prompts];
                    next[index] = { ...plan, keyword: e.target.value };
                    set('prompts', next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set('prompts', prompts.filter((_, i) => i !== index))}
                >
                  删除
                </Button>
              </div>
              <Textarea
                rows={2}
                placeholder="生图提示词"
                value={plan.prompt}
                onChange={(e) => {
                  const next = [...prompts];
                  next[index] = { ...plan, prompt: e.target.value };
                  set('prompts', next);
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={prompts.length >= TOTAL_IMAGE_ITEM_LIMIT}
            onClick={() =>
              set('prompts', [
                ...prompts,
                { kind: 'main_image', index: prompts.length + 1, keyword: '', prompt: '' },
              ])
            }
          >
            添加提示词
          </Button>
        </section>
      )}

      {/* 产品信息 */}
      {workflowKey !== 'marketing2-background-cleanup' && workflowKey !== 'marketing2-quality-repair' && (
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
          {workflowKey === 'marketing2-image-detail-full' && (
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
          )}
          {workflowKey === 'marketing2-image-detail-full' && (
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
          )}
        </section>
      )}

      {/* 定位与约束（交互 6.1，仅完整链路） */}
      {workflowKey === 'marketing2-image-detail-full' && (
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
      )}

      {/* 平台与输出 */}
      {workflowKey !== 'marketing2-background-cleanup' && workflowKey !== 'marketing2-quality-repair' && (
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
            {workflowKey !== 'marketing2-batch-generation' && (
              <>
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
              </>
            )}
          </div>
          {total !== null && total > TOTAL_IMAGE_ITEM_LIMIT && (
            <p className="text-xs text-destructive">
              主图与详情页合计 {total} 个，超过单次任务上限 {TOTAL_IMAGE_ITEM_LIMIT} 个，请调整数量。
            </p>
          )}
        </section>
      )}

      {/* 底图净化指令 */}
      {workflowKey === 'marketing2-background-cleanup' && (
        <section className="space-y-1">
          <Label className="text-xs">净化指令（可选）</Label>
          <Textarea
            rows={2}
            placeholder="例如：保留产品与包装，去除背景杂物与水印"
            value={(value.cleanupInstruction as string) ?? ''}
            disabled={disabled}
            onChange={(e) => set('cleanupInstruction', e.target.value)}
          />
        </section>
      )}
    </div>
  );
}
