'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface PreviewImage {
  src: string;
  title: string;
}

export function ImagePreviewDialog({
  image,
  onOpenChange,
}: {
  image: PreviewImage | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] max-w-[min(96vw,1200px)] overflow-auto p-3 sm:rounded-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate text-base">{image?.title}</DialogTitle>
          <DialogDescription className="sr-only">生成图片原图预览</DialogDescription>
        </DialogHeader>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt={image.title}
            className="mx-auto max-h-[82vh] max-w-full object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
