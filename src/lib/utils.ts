import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 生成 UUID v4。crypto.randomUUID 仅在安全上下文（HTTPS/localhost）可用，
 * 通过局域网 HTTP 访问时不存在，此处用 crypto.getRandomValues 兜底实现。
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 将存储的文件路径转换为可访问的URL
 * 绝对URL/data URI 原样返回，其余映射到 /api/files 服务路由
 */
export function getAssetUrl(p?: string | null): string {
  if (!p) return '';
  if (/^(https?:|data:|\/api\/)/.test(p)) return p;
  return '/api/files/' + p.replace(/\\/g, '/').replace(/^\.\//, '');
}
