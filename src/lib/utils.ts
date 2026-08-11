import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
