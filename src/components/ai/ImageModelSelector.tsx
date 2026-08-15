'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AIServiceConfig } from '@/types/ai';

interface ImageModelSelectorProps {
  services: AIServiceConfig[];
  value: string | null;
  onValueChange: (serviceId: string) => void;
  disabled?: boolean;
}

/** 在文生图与图生图中复用的已配置图片模型选择器。 */
export function ImageModelSelector({
  services,
  value,
  onValueChange,
  disabled = false,
}: ImageModelSelectorProps) {
  const hasServices = services.length > 0;

  return (
    <div className="space-y-2">
      <Label htmlFor="image-model">生图模型</Label>
      <Select
        value={value ?? undefined}
        onValueChange={onValueChange}
        disabled={disabled || !hasServices}
      >
        <SelectTrigger id="image-model" aria-label="选择生图模型">
          <SelectValue placeholder={hasServices ? '请选择生图模型' : '暂无已配置的生图模型'} />
        </SelectTrigger>
        <SelectContent>
          {services.map((service) => (
            <SelectItem key={service.id} value={service.id}>
              {service.name}{service.model ? `（${service.model}）` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
