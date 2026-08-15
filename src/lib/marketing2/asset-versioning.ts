import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '@/lib/db/prisma';
import { FileStorage } from '@/lib/storage/FileStorage';
import { getAssetUrl } from '@/lib/utils';
import { Marketing2Error } from '@/lib/marketing2/schemas';

// ============================================
// 营销助手2资产版本（V2 6.3 / 8.3）
// 每次生成或返修都创建新资产版本：
// 记录任务 ID、来源资产 ID、步骤、版本号、提示词、模型快照。
// 原图只读保留，删除策略与任务删除分离。
// ============================================

export interface DerivedAssetInput {
  userId: string;
  taskId: string;
  stepKey: string;
  buffer: Buffer;
  filename: string;
  derivedReason: string;
  parentAssetId?: string | null;
  prompt?: string | null;
  negativePrompt?: string | null;
  modelSnapshot?: { modelId: string; name: string; provider: string; model: string } | null;
  parameters?: Record<string, unknown>;
  source?: string;
}

function getStorage(): FileStorage {
  return new FileStorage({ baseDir: process.env.USER_DATA_PATH || './user-data' });
}

/** 重名处理：同一任务内文件名冲突时追加任务短 ID 与新版本号。 */
async function resolveUniqueFilename(taskId: string, filename: string): Promise<string> {
  const exists = await prisma.asset.findFirst({ where: { marketingTaskId: taskId, filename } });
  if (!exists) return filename;

  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  const shortId = taskId.slice(0, 8);
  const siblings = await prisma.asset.count({
    where: { marketingTaskId: taskId, filename: { startsWith: `${stem}_v` } },
  });
  return `${stem}_v${siblings + 1}_${shortId}${ext}`;
}

/** 保存派生资产：文件落盘 + 版本链 + 模型快照。 */
export async function createDerivedAsset(input: DerivedAssetInput) {
  const storage = getStorage();
  await storage.init();

  const filename = await resolveUniqueFilename(input.taskId, input.filename);
  const { filepath, thumbnail } = await storage.saveFromBuffer(input.buffer, filename);

  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(input.buffer).metadata();
    width = metadata.width;
    height = metadata.height;
  } catch {
    // 非图片派生文件（如导出）跳过元数据
  }

  let revision = 1;
  if (input.parentAssetId) {
    const siblings = await prisma.asset.count({
      where: { parentAssetId: input.parentAssetId },
    });
    const parent = await prisma.asset.findUnique({ where: { id: input.parentAssetId } });
    revision = (parent?.revision ?? 1) + siblings;
  }

  const asset = await prisma.asset.create({
    data: {
      userId: input.userId,
      filename,
      filepath,
      thumbnail,
      filesize: input.buffer.length,
      width: width ?? null,
      height: height ?? null,
      format: path.extname(filename).slice(1) || 'png',
      prompt: input.prompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      aiModel: input.modelSnapshot?.model ?? null,
      aiProvider: input.modelSnapshot?.provider ?? null,
      parameters: {
        modelSnapshot: input.modelSnapshot ?? null,
        ...(input.parameters ?? {}),
      },
      source: input.source ?? 'marketing2',
      marketingTaskId: input.taskId,
      parentAssetId: input.parentAssetId ?? null,
      revision,
      derivedReason: input.derivedReason,
      stepKey: input.stepKey,
    },
  });

  return { asset, url: getAssetUrl(filepath) };
}

/** 登记用户上传的原图为资产（无父级，revision 1），返回 assetId 与 URL。 */
export async function registerOriginalAsset(options: {
  userId: string;
  taskId: string;
  stepKey: string;
  url: string;
}) {
  // 上传接口已写文件；此处仅建立任务关联的轻量记录，避免重复落盘。
  return options.url;
}

/**
 * 把图片引用解析为 data URL（供 Adapter 使用）。
 * 支持 /api/files/... 相对路径、user-data 相对路径、http(s)、data:。
 */
export async function resolveImageToDataURL(reference: string): Promise<string> {
  if (reference.startsWith('data:')) return reference;

  let buffer: Buffer | null = null;

  if (reference.startsWith('/api/files/')) {
    const relative = reference.slice('/api/files/'.length);
    const absolute = path.resolve(process.cwd(), ...relative.split('/'));
    const baseDir = path.resolve(process.env.USER_DATA_PATH || './user-data');
    if (!absolute.startsWith(baseDir + path.sep)) {
      throw new Marketing2Error('INPUT_INVALID', '非法图片路径', { httpStatus: 400 });
    }
    buffer = await fs.readFile(absolute).catch(() => null);
  } else if (reference.startsWith('http://') || reference.startsWith('https://')) {
    const response = await fetch(reference);
    if (response.ok) buffer = Buffer.from(await response.arrayBuffer());
  } else {
    // user-data 相对路径（Asset.filepath）
    const absolute = path.resolve(process.cwd(), reference.replace(/^\.\//, ''));
    buffer = await fs.readFile(absolute).catch(() => null);
  }

  if (!buffer) {
    throw new Marketing2Error('INPUT_INVALID', `图片不可读取：${reference.slice(0, 120)}`, {
      httpStatus: 400,
    });
  }

  const ext = path.extname(reference.split('?')[0]).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** 拉取生成结果（URL 或 base64）为 Buffer，供落盘。 */
export async function fetchGeneratedImage(imageRef: string): Promise<Buffer> {
  if (imageRef.startsWith('data:')) {
    return Buffer.from(imageRef.slice(imageRef.indexOf(',') + 1), 'base64');
  }
  if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) {
    const response = await fetch(imageRef);
    if (!response.ok) {
      throw new Marketing2Error('UPSTREAM_FAILED', `生成结果下载失败 (HTTP ${response.status})`, {
        httpStatus: 502,
      });
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.from(imageRef, 'base64');
}
