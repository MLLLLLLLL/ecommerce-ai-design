import { prisma } from '@/lib/db/prisma';
import { createDerivedAsset } from '@/lib/marketing2/asset-versioning';
import { Marketing2Error, sanitizeFilenamePart } from '@/lib/marketing2/schemas';
import { getWorkflow } from '@/lib/marketing2/workflow-registry';
import type { MarketingTask, MarketingTaskItem } from '@prisma/client';
import { z } from 'zod';

// ============================================
// 营销助手2导出（V2 7.4）
// JSON / Markdown / 提示词包 / 质检报告 / 资产清单；
// 导出文件创建 Asset 并关联原任务。
// ============================================

export const EXPORT_FORMATS = ['json', 'markdown', 'prompts', 'quality_report', 'asset_manifest'] as const;

const exportBodySchema = z
  .object({
    format: z.enum(EXPORT_FORMATS),
  })
  .strict();

export type ExportFormat = z.infer<typeof exportBodySchema>['format'];

export function parseExportBody(body: unknown) {
  const parsed = exportBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new Marketing2Error('INPUT_INVALID', '导出格式不合法');
  }
  return parsed.data;
}

export async function exportRun(task: MarketingTask, items: MarketingTaskItem[], format: ExportFormat) {
  const workflow = getWorkflow(task.workflowKey ?? '');
  const stepResults = (task.stepResults as Record<string, Record<string, unknown>> | null) ?? {};
  const assets = await prisma.asset.findMany({
    where: { marketingTaskId: task.id },
    orderBy: { createdAt: 'asc' },
  });

  const productSlug = sanitizeFilenamePart(task.productName);
  let filename = '';
  let content = '';

  switch (format) {
    case 'json': {
      filename = `${productSlug}_任务导出.json`;
      content = JSON.stringify(
        {
          task: {
            id: task.id,
            workflowKey: task.workflowKey,
            title: task.productName,
            status: task.status,
            createdAt: task.createdAt.toISOString(),
            input: task.input,
            stepModels: task.stepModels,
            stepResults,
          },
          items: items.map((item) => ({
            kind: item.kind,
            stepKey: item.stepKey,
            status: item.status,
            result: item.result,
            error: item.error,
          })),
        },
        null,
        2
      );
      break;
    }
    case 'markdown': {
      filename = `${productSlug}_任务报告.md`;
      const lines: string[] = [
        `# ${task.productName} - 营销任务报告`,
        '',
        `- 工作流：${workflow?.title ?? task.workflowKey}`,
        `- 状态：${task.status}`,
        `- 创建时间：${task.createdAt.toISOString()}`,
        '',
        '## 步骤结果',
        '',
      ];
      for (const [stepKey, saved] of Object.entries(stepResults)) {
        const step = workflow?.steps.find((item) => item.key === stepKey);
        const state = saved?.approved ? '已确认' : saved?.skipped ? `已跳过（${saved.reason}）` : '进行中';
        lines.push(`### ${step?.title ?? stepKey}（${state}）`, '');
        if (saved?.result) {
          lines.push('```json', JSON.stringify(saved.result, null, 2), '```', '');
        }
      }
      content = lines.join('\n');
      break;
    }
    case 'prompts': {
      filename = `${productSlug}_提示词包.md`;
      const planning = (stepResults.prompt_planning?.result as {
        plans?: { kind: string; index: number; keyword?: string; prompt: string; negativePrompt?: string }[];
      }) ?? {};
      const lines: string[] = [`# ${task.productName} 提示词包`, ''];
      for (const plan of planning.plans ?? []) {
        const label = plan.kind === 'main_image' ? '主图' : '详情页';
        lines.push(
          `## ${label} ${plan.index}${plan.keyword ? ` - ${plan.keyword}` : ''}`,
          '',
          plan.prompt,
          ''
        );
        if (plan.negativePrompt) {
          lines.push(`负面提示词：${plan.negativePrompt}`, '');
        }
      }
      content = lines.join('\n');
      break;
    }
    case 'quality_report': {
      filename = `${productSlug}_质检报告.json`;
      const quality = (stepResults.quality_repair?.result as Record<string, unknown>) ?? {};
      content = JSON.stringify(
        {
          taskId: task.id,
          productName: task.productName,
          exportedAt: new Date().toISOString(),
          reports: quality.reports ?? [],
          overrides: quality.overrides ?? [],
        },
        null,
        2
      );
      break;
    }
    case 'asset_manifest': {
      filename = `${productSlug}_资产清单.json`;
      content = JSON.stringify(
        {
          taskId: task.id,
          assets: assets.map((asset) => ({
            id: asset.id,
            filename: asset.filename,
            filepath: asset.filepath,
            stepKey: asset.stepKey,
            derivedReason: asset.derivedReason,
            parentAssetId: asset.parentAssetId,
            revision: asset.revision,
            prompt: asset.prompt,
            aiModel: asset.aiModel,
            createdAt: asset.createdAt.toISOString(),
          })),
        },
        null,
        2
      );
      break;
    }
  }

  const buffer = Buffer.from(content, 'utf-8');
  const { asset, url } = await createDerivedAsset({
    userId: task.userId,
    taskId: task.id,
    stepKey: 'export',
    buffer,
    filename,
    derivedReason: `export:${format}`,
    source: 'marketing2-export',
  });

  return { assetId: asset.id, url, filename };
}
