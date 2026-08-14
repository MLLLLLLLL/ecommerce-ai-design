import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';
import { exportTaskSchema } from '@/lib/marketing/schemas';
import { getAssetUrl } from '@/lib/utils';
import { MarketingServiceError } from '@/lib/marketing/task-service';
import type { ApiResponse } from '@/types/marketing-contract';

type RouteContext = { params: Promise<{ id: string }> };

function toMarkdown(result: Record<string, unknown>): string {
  const lines: string[] = [];

  const geo = result as {
    question?: string;
    directAnswer?: string;
    supportingContent?: string;
    faq?: { question?: string; answer?: string }[];
    claims?: { text?: string; factKey?: string }[];
    pendingFacts?: { key?: string; value?: string }[];
  };
  if (geo.question && geo.directAnswer) {
    lines.push('# GEO 内容（离线版）', '', '> 本结果未联网核实，仅基于用户提供的已确认事实与内容生成。', '');
    lines.push('## 用户问题', '', geo.question, '');
    lines.push('## 直接回答', '', geo.directAnswer, '');
    if (geo.supportingContent) lines.push('## 支撑内容', '', geo.supportingContent, '');
    if (geo.claims?.length) {
      lines.push('## 事实断言', '');
      for (const claim of geo.claims) lines.push(`- ${claim.text ?? ''}（事实：${claim.factKey ?? ''}）`);
      lines.push('');
    }
    if (geo.faq?.length) {
      lines.push('## 相关追问', '');
      for (const item of geo.faq) lines.push(`**${item.question ?? ''}**\n\n${item.answer ?? ''}\n`);
    }
    if (geo.pendingFacts?.length) {
      lines.push('## 待确认事实（未进入可发布内容）', '');
      for (const fact of geo.pendingFacts) lines.push(`- ${fact.key ?? ''}：${fact.value ?? ''}`);
      lines.push('');
    }
    return lines.join('\n').trim() + '\n';
  }

  const seo = result as {
    keywordIntent?: { keyword?: string; intent?: string; explanation?: string }[];
    pageTitle?: { title?: string; metaDescription?: string; slug?: string };
    headingStructure?: { h1?: string; h2?: string[] };
    bodyContent?: string;
    faq?: { question?: string; answer?: string }[];
    imageAlt?: { image?: string; alt?: string }[];
    internalLinks?: { anchorText?: string; target?: string; reason?: string }[];
    jsonLd?: Record<string, unknown>;
    pendingFacts?: { key?: string; value?: string }[];
  };
  if (seo.pageTitle || seo.bodyContent) {
    lines.push('# SEO 内容优化建议', '');
    if (seo.pageTitle?.title) {
      lines.push('## 页面标题', '', `标题：${seo.pageTitle.title}`, '', `Meta 描述：${seo.pageTitle.metaDescription ?? ''}`, '', `Slug：${seo.pageTitle.slug ?? ''}`, '');
    }
    if (seo.keywordIntent?.length) {
      lines.push('## 关键词意图', '');
      for (const item of seo.keywordIntent) {
        lines.push(`- ${item.keyword ?? ''}：${item.intent ?? ''}（${item.explanation ?? ''}）`);
      }
      lines.push('');
    }
    if (seo.headingStructure) {
      lines.push('## 标题结构', '', `H1：${seo.headingStructure.h1 ?? ''}`, '');
      for (const h2 of seo.headingStructure.h2 ?? []) lines.push(`- H2：${h2}`);
      lines.push('');
    }
    if (seo.bodyContent) lines.push('## 正文', '', seo.bodyContent, '');
    if (seo.faq?.length) {
      lines.push('## 常见问题', '');
      for (const item of seo.faq) lines.push(`**${item.question ?? ''}**\n\n${item.answer ?? ''}\n`);
    }
    if (seo.imageAlt?.length) {
      lines.push('## 图片 Alt', '');
      for (const item of seo.imageAlt) lines.push(`- ${item.image ?? ''}：${item.alt ?? ''}`);
      lines.push('');
    }
    if (seo.internalLinks?.length) {
      lines.push('## 内链建议', '');
      for (const item of seo.internalLinks) {
        lines.push(`- [${item.anchorText ?? ''}](${item.target ?? ''})：${item.reason ?? ''}`);
      }
      lines.push('');
    }
    if (seo.pendingFacts?.length) {
      lines.push('## 待确认事实（未进入可发布正文）', '');
      for (const fact of seo.pendingFacts) lines.push(`- ${fact.key ?? ''}：${fact.value ?? ''}`);
      lines.push('');
    }
    if (seo.jsonLd && Object.keys(seo.jsonLd).length > 0) {
      // JSON-LD 仅在导出时序列化（V3 9.2）
      lines.push('## JSON-LD', '', '```json', JSON.stringify(seo.jsonLd, null, 2), '```', '');
    }
    return lines.join('\n').trim() + '\n';
  }

  const translations = result.translations as
    | Record<string, { status?: string; translation?: string }>
    | undefined;
  if (translations && Object.keys(translations).length > 0) {
    lines.push('# 多语言翻译', '');
    const sourceText = typeof result.sourceText === 'string' ? result.sourceText : '';
    const sourceLanguage = typeof result.sourceLanguage === 'string' ? result.sourceLanguage : '';
    lines.push('## 原文', '', sourceText, '');
    for (const [language, entry] of Object.entries(translations)) {
      if (entry.status === 'completed' && entry.translation) {
        lines.push(`## ${language}`, '', entry.translation, '');
      } else {
        lines.push(`## ${language}`, '', '_翻译失败_', '');
      }
    }
    if (sourceLanguage && sourceLanguage !== 'auto') {
      lines.push(`源语言：${sourceLanguage}`);
    }
    return lines.join('\n').trim() + '\n';
  }

  const copywriting = result.copywriting as
    | { title?: { main?: string; variations?: string[]; seoOptimized?: string }; corePoints?: { text: string }[]; description?: { short?: string; long?: string; structured?: Record<string, unknown> }; seo?: { primary?: string[]; secondary?: string[] } }
    | undefined;
  if (copywriting) {
    lines.push('# 文案', '');
    if (copywriting.title?.main) lines.push('## 主标题', '', copywriting.title.main, '');
    if (copywriting.title?.variations?.length) {
      lines.push('### 标题变体', '');
      copywriting.title.variations.forEach((v) => lines.push(`- ${v}`));
      lines.push('');
    }
    if (copywriting.corePoints?.length) {
      lines.push('## 核心卖点', '');
      copywriting.corePoints.forEach((p) => lines.push(`- ${p.text}`));
      lines.push('');
    }
    if (copywriting.description?.short) lines.push('## 简短描述', '', copywriting.description.short, '');
    if (copywriting.description?.long) lines.push('## 详情页描述', '', copywriting.description.long, '');
    if (copywriting.seo?.primary?.length) {
      lines.push('## SEO 关键词', '', `主词：${copywriting.seo.primary.join('、')}`, '');
    }
  }

  const mainPrompts = result.mainPrompts as { prompts?: { title?: string; chinesePrompt?: string; renderParams?: string }[] } | undefined;
  if (mainPrompts?.prompts?.length) {
    lines.push('# 主图提示词', '');
    mainPrompts.prompts.forEach((p) => {
      lines.push(`## ${p.title ?? '未命名'}`, '', p.chinesePrompt ?? '', '', `渲染参数：${p.renderParams ?? ''}`, '');
    });
  }

  const detailPrompts = result.detailPrompts as { prompts?: { keyword?: string; chinesePrompt?: string; renderParams?: string }[] } | undefined;
  if (detailPrompts?.prompts?.length) {
    lines.push('# 详情页提示词', '');
    detailPrompts.prompts.forEach((p) => {
      lines.push(`## ${p.keyword ?? '未命名'}`, '', p.chinesePrompt ?? '', '', `渲染参数：${p.renderParams ?? ''}`, '');
    });
  }

  const pendingFacts = result.pendingFacts;
  if (Array.isArray(pendingFacts) && pendingFacts.length > 0) {
    lines.push('# 待确认事实', '');
    for (const fact of pendingFacts as { key?: string; value?: string }[]) {
      lines.push(`- ${fact.key ?? ''}：${fact.value ?? ''}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * POST /api/marketing/tasks/:id/export - 导出 JSON/Markdown（V3 8.1）
 * 生成真实文件并创建 Asset（source=marketing-assistant，parameters.marketingTaskId）。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const body = exportTaskSchema.parse(await request.json());
    const user = await getCurrentUser();

    const task = await prisma.marketingTask.findFirst({ where: { id, userId: user.id } });
    if (!task) {
      throw new MarketingServiceError('TASK_NOT_FOUND', '任务不存在或不属于当前用户', {
        httpStatus: 404,
      });
    }
    if (!task.result || task.status === 'failed') {
      throw new MarketingServiceError('EXPORT_FAILED', '任务没有可导出的结果', { httpStatus: 400 });
    }

    const baseDir = process.env.USER_DATA_PATH || './user-data';
    const exportDir = path.join(baseDir, 'marketing', 'exports');
    await fs.mkdir(exportDir, { recursive: true });

    const safeName = task.productName.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || '营销作品';
    const filename = `marketing-${safeName}-${randomUUID().slice(0, 8)}.${body.format === 'markdown' ? 'md' : 'json'}`;
    const filepath = path.join(exportDir, filename);

    const content =
      body.format === 'markdown'
        ? toMarkdown(task.result as Record<string, unknown>)
        : JSON.stringify(task.result, null, 2);

    await fs.writeFile(filepath, content, 'utf8');

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        filename,
        filepath,
        filesize: Buffer.byteLength(content, 'utf8'),
        format: body.format,
        aiProvider: 'marketing-assistant',
        aiModel: 'marketing-export',
        prompt: task.productName ? `营销作品导出：${task.productName}` : '营销作品导出',
        parameters: { marketingTaskId: task.id, module: task.module, format: body.format },
        source: 'marketing-assistant',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        assetId: asset.id,
        filename,
        url: getAssetUrl(filepath),
        marketingTaskId: task.id,
        format: body.format,
      },
      requestId,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    if (error instanceof MarketingServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
          requestId,
        } satisfies ApiResponse<never>,
        { status: error.httpStatus }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' },
          requestId,
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }
    console.error('[API] Marketing export error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'EXPORT_FAILED', message: '导出失败' },
        requestId,
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
