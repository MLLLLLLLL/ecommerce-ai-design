import { prisma } from '@/lib/db/prisma';
import { decryptServerSecret, encryptServerSecret } from '@/lib/security/server-encryption';
import { HttpSearchAdapter } from '@/lib/search/SearchAdapter';
import type { SearchServiceConfig } from '@prisma/client';

// ============================================
// 搜索服务配置（V3 Phase 7 / ADR-0001）
// 路由依据：存在已启用且实测通过（testStatus=passed）的配置。
// ============================================

export interface SearchServiceSummary {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: string | null;
  testStatus: string | null;
  testError: string | null;
  maxQueriesPerTask: number;
  createdAt: string;
  updatedAt: string;
}

export function toSearchServiceSummary(config: SearchServiceConfig): SearchServiceSummary {
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    baseURL: config.baseURL,
    isActive: config.isActive,
    isDefault: config.isDefault,
    lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
    testStatus: config.testStatus,
    testError: config.testError,
    maxQueriesPerTask: config.maxQueriesPerTask,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function toSearchAdapter(config: SearchServiceConfig): HttpSearchAdapter {
  return new HttpSearchAdapter({
    provider: config.provider,
    baseURL: config.baseURL,
    apiKey: decryptServerSecret(config.apiKeyEncrypted),
  });
}

/** 解析默认搜索服务；不存在或未实测通过时返回 null（前端禁用 + API 拒绝）。 */
export async function resolveActiveSearchService(
  userId: string
): Promise<{ config: SearchServiceConfig; adapter: HttpSearchAdapter } | null> {
  const config = await prisma.searchServiceConfig.findFirst({
    where: { userId, isActive: true, testStatus: 'passed' },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!config) return null;
  return { config, adapter: toSearchAdapter(config) };
}

/** 实测搜索服务：一次真实查询（"保温杯"）返回含 URL 结果即通过。 */
export async function testSearchService(
  userId: string,
  id: string
): Promise<{ passed: boolean; message: string }> {
  const config = await prisma.searchServiceConfig.findFirst({ where: { id, userId } });
  if (!config) {
    throw new Error('搜索服务不存在或无权限测试');
  }
  const adapter = toSearchAdapter(config);
  const result = await adapter.search('保温杯');
  const passed = !result.degraded && result.sources.length > 0;

  await prisma.searchServiceConfig.update({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      testStatus: passed ? 'passed' : 'failed',
      testError: passed ? null : (result.error ?? '未返回可用结果').slice(0, 500),
    },
  });

  return {
    passed,
    message: passed
      ? `实测通过：返回 ${result.sources.length} 条来源`
      : result.error ?? '未返回可用结果',
  };
}

export async function createSearchService(
  userId: string,
  input: {
    name: string;
    provider: string;
    baseURL: string;
    apiKey: string;
    isActive: boolean;
    maxQueriesPerTask: number;
  }
): Promise<SearchServiceConfig> {
  const existingCount = await prisma.searchServiceConfig.count({ where: { userId } });
  const shouldBeDefault = existingCount === 0;

  return prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.searchServiceConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.searchServiceConfig.create({
      data: {
        userId,
        name: input.name,
        provider: input.provider,
        baseURL: input.baseURL.replace(/\/+$/, ''),
        apiKeyEncrypted: encryptServerSecret(input.apiKey),
        isActive: input.isActive,
        isDefault: shouldBeDefault,
        maxQueriesPerTask: input.maxQueriesPerTask,
      },
    });
  });
}
