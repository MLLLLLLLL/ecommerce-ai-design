import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createHash } from 'crypto';

/**
 * 文件存储配置
 */
interface FileStorageConfig {
  baseDir: string;
  maxSize?: number;
  allowedFormats?: string[];
}

/**
 * 文件信息
 */
interface FileInfo {
  filename: string;
  filepath: string;
  size: number;
  format: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  hash: string;
}

/**
 * 文件存储服务
 */
export class FileStorage {
  private config: Required<FileStorageConfig>;

  constructor(config: FileStorageConfig) {
    this.config = {
      baseDir: config.baseDir,
      maxSize: config.maxSize || 50 * 1024 * 1024,
      allowedFormats: config.allowedFormats || ['jpg', 'jpeg', 'png', 'webp'],
    };
  }

  async init() {
    await this.ensureDir(this.config.baseDir);
    await this.ensureDir(path.join(this.config.baseDir, 'thumbnails'));
    console.log('[FileStorage] Initialized:', this.config.baseDir);
  }

  async saveFromUrl(url: string, filename?: string): Promise<FileInfo> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return await this.saveFromBuffer(buffer, filename);
    } catch (error) {
      console.error('[FileStorage] Failed to save from URL:', error);
      throw error;
    }
  }

  async saveFromBase64(base64: string, filename?: string): Promise<FileInfo> {
    try {
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      return await this.saveFromBuffer(buffer, filename);
    } catch (error) {
      console.error('[FileStorage] Failed to save from base64:', error);
      throw error;
    }
  }

  async saveFromBuffer(buffer: Buffer, filename?: string): Promise<FileInfo> {
    try {
      if (buffer.length > this.config.maxSize) {
        throw new Error(`File size exceeds limit: ${this.config.maxSize} bytes`);
      }

      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (!metadata.format) {
        throw new Error('Unknown image format');
      }

      if (!this.config.allowedFormats.includes(metadata.format)) {
        throw new Error(`Format not allowed: ${metadata.format}`);
      }

      const hash = this.calculateHash(buffer);
      const finalFilename = filename || `${hash}.${metadata.format}`;
      const filepath = path.join(this.config.baseDir, finalFilename);

      if (await this.fileExists(filepath)) {
        console.log('[FileStorage] File already exists:', filepath);
        return await this.getFileInfo(filepath);
      }

      await fs.writeFile(filepath, buffer);
      const thumbnailPath = await this.generateThumbnail(buffer, hash, metadata.format);

      const fileInfo: FileInfo = {
        filename: finalFilename,
        filepath,
        size: buffer.length,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        thumbnail: thumbnailPath,
        hash,
      };

      console.log('[FileStorage] File saved:', filepath);
      return fileInfo;
    } catch (error) {
      console.error('[FileStorage] Failed to save from buffer:', error);
      throw error;
    }
  }

  private async generateThumbnail(buffer: Buffer, hash: string, format: string): Promise<string> {
    try {
      const thumbnailFilename = `${hash}_thumb.${format}`;
      const thumbnailPath = path.join(this.config.baseDir, 'thumbnails', thumbnailFilename);

      await sharp(buffer)
        .resize(200, 200, { fit: 'cover', position: 'center' })
        .toFile(thumbnailPath);

      console.log('[FileStorage] Thumbnail generated:', thumbnailPath);
      return thumbnailPath;
    } catch (error) {
      console.error('[FileStorage] Failed to generate thumbnail:', error);
      throw error;
    }
  }

  async getFileInfo(filepath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filepath);
      const buffer = await fs.readFile(filepath);
      const image = sharp(buffer);
      const metadata = await image.metadata();

      const hash = this.calculateHash(buffer);
      const filename = path.basename(filepath);
      const thumbnailPath = path.join(
        this.config.baseDir,
        'thumbnails',
        `${hash}_thumb.${metadata.format}`
      );

      return {
        filename,
        filepath,
        size: stats.size,
        format: metadata.format || 'unknown',
        width: metadata.width,
        height: metadata.height,
        thumbnail: (await this.fileExists(thumbnailPath)) ? thumbnailPath : undefined,
        hash,
      };
    } catch (error) {
      console.error('[FileStorage] Failed to get file info:', error);
      throw error;
    }
  }

  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);

      const filename = path.basename(filepath);
      const hash = filename.split('.')[0];

      try {
        const files = await fs.readdir(path.join(this.config.baseDir, 'thumbnails'));
        for (const file of files) {
          if (file.startsWith(`${hash}_thumb`)) {
            await fs.unlink(path.join(this.config.baseDir, 'thumbnails', file));
          }
        }
      } catch {
        // 忽略缩略图删除错误
      }

      console.log('[FileStorage] File deleted:', filepath);
    } catch (error) {
      console.error('[FileStorage] Failed to delete file:', error);
      throw error;
    }
  }

  async listFiles(): Promise<FileInfo[]> {
    try {
      const files = await fs.readdir(this.config.baseDir);
      const fileInfos: FileInfo[] = [];

      for (const file of files) {
        if (file === 'thumbnails') continue;

        const filepath = path.join(this.config.baseDir, file);
        const stats = await fs.stat(filepath);

        if (stats.isFile()) {
          try {
            const fileInfo = await this.getFileInfo(filepath);
            fileInfos.push(fileInfo);
          } catch {
            // 跳过无效文件
          }
        }
      }

      return fileInfos;
    } catch (error) {
      console.error('[FileStorage] Failed to list files:', error);
      throw error;
    }
  }

  private calculateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // 目录可能已存在
    }
  }

  async getStats() {
    const files = await this.listFiles();
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    return {
      fileCount: files.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      baseDir: this.config.baseDir,
    };
  }
}
