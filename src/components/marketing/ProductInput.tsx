'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface ProductInputProps {
  productName: string;
  productImages: string[];
  sellPoints: string[];
  keywords: string[];
  onProductNameChange: (name: string) => void;
  onProductImagesChange: (images: string[]) => void;
  onSellPointsChange: (points: string[]) => void;
  onKeywordsChange: (keywords: string[]) => void;
}

export function ProductInput({
  productName,
  productImages,
  sellPoints,
  keywords,
  onProductNameChange,
  onProductImagesChange,
  onSellPointsChange,
  onKeywordsChange,
}: ProductInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sellPointsText, setSellPointsText] = useState(sellPoints.join('\n'));
  const [keywordsText, setKeywordsText] = useState(keywords.join('、'));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (productImages.length + files.length > 5) {
      toast.error('最多只能上传5张图片');
      return;
    }

    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} 不是图片文件`);
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 文件过大（限制10MB）`);
        continue;
      }

      // 转换为base64
      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            newImages.push(e.target.result as string);
          }
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }

    onProductImagesChange([...productImages, ...newImages]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    onProductImagesChange(productImages.filter((_, i) => i !== index));
  };

  const handleSellPointsChange = (text: string) => {
    setSellPointsText(text);
    const points = text
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p);
    onSellPointsChange(points);
  };

  const handleKeywordsChange = (text: string) => {
    setKeywordsText(text);
    const kws = text
      .split(/[、,，\s]+/)
      .map((k) => k.trim())
      .filter((k) => k);
    onKeywordsChange(kws);
  };

  return (
    <div className="space-y-6">
      {/* 商品名称 */}
      <div className="space-y-2">
        <Label htmlFor="productName">
          商品名称 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="productName"
          placeholder="如：AMAZFIT智能手表Pro Max"
          value={productName}
          onChange={(e) => onProductNameChange(e.target.value)}
        />
      </div>

      {/* 商品图片 */}
      <div className="space-y-2">
        <Label>
          商品图片 <span className="text-red-500">*</span>
          <span className="text-sm text-muted-foreground ml-2">
            （建议1-5张，用于AI识别产品）
          </span>
        </Label>

        {/* 图片预览 */}
        {productImages.length > 0 && (
          <div className="grid grid-cols-5 gap-4 mb-4">
            {productImages.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`产品图${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg border"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemoveImage(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 上传区域 */}
        <Card
          className="border-2 border-dashed hover:border-blue-400 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="p-8 text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              点击上传或拖拽图片到此处
            </p>
            <p className="mt-1 text-xs text-gray-400">
              支持 JPG、PNG 格式，单个文件不超过 10MB
            </p>
          </div>
        </Card>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 核心卖点 */}
      <div className="space-y-2">
        <Label htmlFor="sellPoints">
          核心卖点
          <span className="text-sm text-muted-foreground ml-2">
            （可选，每行一个）
          </span>
        </Label>
        <Textarea
          id="sellPoints"
          placeholder="每行一个卖点，如：&#10;续航18天&#10;GPS定位&#10;50米防水"
          value={sellPointsText}
          onChange={(e) => handleSellPointsChange(e.target.value)}
          rows={4}
        />
      </div>

      {/* 目标关键词 */}
      <div className="space-y-2">
        <Label htmlFor="keywords">
          目标关键词
          <span className="text-sm text-muted-foreground ml-2">
            （可选，用于SEO优化）
          </span>
        </Label>
        <Input
          id="keywords"
          placeholder="用顿号或空格分隔，如：智能手表、运动手表、心率监测"
          value={keywordsText}
          onChange={(e) => handleKeywordsChange(e.target.value)}
        />
      </div>
    </div>
  );
}
