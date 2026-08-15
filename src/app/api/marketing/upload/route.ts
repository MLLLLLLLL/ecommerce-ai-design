import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { Metadata } from 'sharp';
import { getAssetUrl } from '@/lib/utils';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  PRODUCT_IMAGE_ALLOWED_MIME,
  PRODUCT_IMAGE_MAX,
  PRODUCT_IMAGE_MAX_BYTES,
} from '@/lib/marketing/schemas';

// ============================================
// POST /api/marketing/upload（V3 6.1）
// 营销图片文件化：浏览器先上传到服务端文件存储，
// 任务输入只保存 /api/files/... URL，不落 Base64。
// 限制：单次 1-5 张，单张 10MB，仅 JPEG/PNG/WebP，
// MIME 与文件头双校验，随机文件名，路径限制在 USER_DATA_PATH 下。
// ============================================

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface MarketingUploadFile {
  url: string;
  filename: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
}

type UploadSuccess = {
  success: true;
  data: { files: MarketingUploadFile[] };
  requestId: string;
};

type UploadFailure = {
  success: false;
  error: {
    code: 'UPLOAD_INVALID';
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
  requestId: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  try {
    await getCurrentUser();

    const formData = await request.formData();
    const entries = formData.getAll('files');
    if (entries.length === 0) {
      return uploadError(requestId, '请至少上传一张图片', { files: ['必须提供 files 字段'] });
    }
    if (entries.length > PRODUCT_IMAGE_MAX) {
      return uploadError(
        requestId,
        `一次最多上传 ${PRODUCT_IMAGE_MAX} 张图片，当前 ${entries.length} 张`,
        { files: [`数量超过 ${PRODUCT_IMAGE_MAX} 张`] }
      );
    }

    const files = entries.filter((entry): entry is File => entry instanceof File);
    if (files.length !== entries.length) {
      return uploadError(requestId, '上传内容不是有效文件', { files: ['存在无效文件项'] });
    }

    // 保存相对 USER_DATA_PATH 的路径（与 marketing/import 一致），
    // 文件名由服务端生成，写入位置固定在 USER_DATA_PATH/marketing 下。
    const baseDir = process.env.USER_DATA_PATH || './user-data';
    const marketingDir = path.join(baseDir, 'marketing');
    await fs.mkdir(marketingDir, { recursive: true });

    const saved: MarketingUploadFile[] = [];
    const user = await getCurrentUser();
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      const fieldError = validateFileMeta(file, index);
      if (fieldError) {
        return uploadError(requestId, fieldError, {
          files: [`第 ${index + 1} 张：${fieldError}`],
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      let metadata: Metadata;
      try {
        metadata = await sharp(buffer).metadata();
      } catch {
        return uploadError(requestId, `第 ${index + 1} 张图片无法解析，可能不是有效图片`, {
          files: [`第 ${index + 1} 张不是有效图片`],
        });
      }

      const ext = MIME_TO_EXT[file.type];
      const format = metadata.format;
      if (!ext || !format || format !== (ext === 'jpg' ? 'jpeg' : ext)) {
        return uploadError(
          requestId,
          `第 ${index + 1} 张图片格式不符：仅支持 JPEG、PNG、WebP`,
          { files: [`第 ${index + 1} 张格式不受支持`] }
        );
      }

      const filename = `${randomUUID()}.${ext}`;
      const filepath = path.join(marketingDir, filename);
      await fs.writeFile(filepath, buffer);
      await prisma.asset.create({
        data: {
          userId: user.id,
          filename,
          filepath,
          filesize: buffer.length,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          format: format,
          source: 'marketing-upload',
        },
      });

      saved.push({
        url: getAssetUrl(filepath),
        filename,
        size: buffer.length,
        mime: file.type,
        width: metadata.width,
        height: metadata.height,
      });
    }

    const success: UploadSuccess = {
      success: true,
      data: { files: saved },
      requestId,
    };
    return NextResponse.json(success);
  } catch (error) {
    console.error('[API] Marketing upload error:', error);
    return uploadError(requestId, '图片上传失败');
  }
}

function validateFileMeta(file: File, index: number): string | null {
  if (file.size === 0) {
    return `第 ${index + 1} 张图片为空文件`;
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return `第 ${index + 1} 张图片超过 10MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`;
  }
  if (!PRODUCT_IMAGE_ALLOWED_MIME.includes(file.type)) {
    return `第 ${index + 1} 张图片类型不受支持：${file.type || '未知'}`;
  }
  return null;
}

function uploadError(
  requestId: string,
  message: string,
  fieldErrors?: Record<string, string[]>
): NextResponse {
  const failure: UploadFailure = {
    success: false,
    error: {
      code: 'UPLOAD_INVALID',
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    requestId,
  };
  return NextResponse.json(failure, { status: 400 });
}
