'use client';

import Image from 'next/image';
import { Download, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAssetUrl } from '@/lib/utils';

interface Asset {
  id: string;
  filename: string;
  filepath: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  prompt?: string;
  aiProvider?: string;
  createdAt: string;
}

interface ResultGalleryProps {
  results: Asset[];
  onDelete?: (id: string) => void;
  onView?: (asset: Asset) => void;
}

export function ResultGallery({
  results,
  onDelete,
  onView,
}: ResultGalleryProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          暂无生成结果，请输入提示词后点击生成
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">生成结果</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((asset) => (
          <Card key={asset.id} className="overflow-hidden">
            <CardHeader className="p-0">
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <Image
                  src={getAssetUrl(asset.thumbnail || asset.filepath)}
                  alt={asset.filename}
                  fill
                  className="object-cover"
                />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {asset.aiProvider}
                  </Badge>
                  {asset.width && asset.height && (
                    <span className="text-xs text-muted-foreground">
                      {asset.width}×{asset.height}
                    </span>
                  )}
                </div>
                {asset.prompt && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {asset.prompt}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 p-4 pt-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onView?.(asset)}
              >
                <Eye className="mr-1 h-4 w-4" />
                查看
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = getAssetUrl(asset.filepath);
                  link.download = asset.filename;
                  link.click();
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(asset.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
