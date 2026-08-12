import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { resolveTextModelForPurpose } from '@/lib/model-configs';
import { CopywritingEngine, ProductAnalyzer, PromptEngine } from '@/lib/marketing';
import { Language, MarketingTaskInput, Platform } from '@/types/marketing';
import type { ModelCapabilities } from '@/types/model-config';

const outputsSchema = z.object({
  analysis: z.boolean(),
  copywriting: z.boolean(),
  mainPrompts: z.boolean(),
  detailPrompts: z.boolean(),
});

const taskInputSchema = z.object({
  productName: z.string().trim().min(1).max(300),
  productImages: z.array(z.string().min(1)).min(1).max(12),
  category: z.string().optional(),
  platform: z.string().min(1),
  language: z.string().min(1),
  sellPoints: z.array(z.string()).max(20).optional(),
  keywords: z.array(z.string()).max(30).optional(),
  parameters: z.record(z.string(), z.string()).optional(),
  outputs: outputsSchema,
  modelSelection: z.object({
    visionModelId: z.string().uuid(),
    contentModelId: z.string().uuid(),
  }),
});

const requestSchema = z.object({ taskInput: taskInputSchema }).strict();

type StepName = 'analysis' | 'copywriting' | 'mainPrompts' | 'detailPrompts';
type StepState = {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  role?: 'vision' | 'content';
  modelId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
};

function buildSteps(input: MarketingTaskInput): Record<StepName, StepState> {
  const needsAnalysis = input.outputs.analysis || input.outputs.copywriting || input.outputs.mainPrompts || input.outputs.detailPrompts;
  return {
    analysis: { status: needsAnalysis ? 'pending' : 'skipped', role: 'vision', modelId: input.modelSelection.visionModelId },
    copywriting: { status: input.outputs.copywriting ? 'pending' : 'skipped', role: 'content', modelId: input.modelSelection.contentModelId },
    mainPrompts: { status: input.outputs.mainPrompts ? 'pending' : 'skipped', role: 'content', modelId: input.modelSelection.contentModelId },
    detailPrompts: { status: input.outputs.detailPrompts ? 'pending' : 'skipped', role: 'content', modelId: input.modelSelection.contentModelId },
  };
}

function toSnapshot(
  config: { id: string; name: string; provider: string; baseURL: string; model: string },
  capabilities: ModelCapabilities
) {
  return { id: config.id, name: config.name, provider: config.provider, baseURL: config.baseURL, model: config.model, capabilities };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : '未知错误';
}

/** POST /api/marketing/generate - 使用已保存模型生成营销素材 */
export async function POST(request: NextRequest) {
  let taskId: string | null = null;
  let steps: Record<StepName, StepState> | null = null;
  let activeStep: StepName | null = null;

  try {
    const body = requestSchema.parse(await request.json());
    const input = body.taskInput as MarketingTaskInput;
    if (!Object.values(input.outputs).some(Boolean)) {
      return NextResponse.json({ success: false, error: '请至少选择一项生成内容' }, { status: 400 });
    }

    const user = await getCurrentUser();
    const [vision, content] = await Promise.all([
      resolveTextModelForPurpose(user.id, input.modelSelection.visionModelId, 'vision'),
      resolveTextModelForPurpose(user.id, input.modelSelection.contentModelId, 'content'),
    ]);

    steps = buildSteps(input);
    const task = await prisma.marketingTask.create({
      data: {
        userId: user.id,
        productName: input.productName,
        productImages: input.productImages,
        category: input.category || null,
        platform: input.platform,
        language: input.language,
        sellPoints: input.sellPoints || [],
        keywords: input.keywords || [],
        parameters: input.parameters || {},
        modelSnapshot: {
          vision: toSnapshot(vision.config, vision.capabilities),
          content: toSnapshot(content.config, content.capabilities),
        } as unknown as Prisma.InputJsonValue,
        executionSteps: steps,
        status: 'analyzing',
      },
    });
    taskId = task.id;

    const updateStep = async (name: StepName, update: Partial<StepState>) => {
      if (!steps || !taskId) return;
      steps[name] = { ...steps[name], ...update };
      await prisma.marketingTask.update({ where: { id: taskId }, data: { executionSteps: steps } });
    };

    let analysis = null;
    let copywriting = null;
    let mainPrompts = null;
    let detailPrompts = null;

    activeStep = 'analysis';
    const analysisStartedAt = Date.now();
    await updateStep(activeStep, { status: 'running', startedAt: new Date().toISOString() });
    const analyzer = new ProductAnalyzer(vision.runtimeConfig);
    analysis = await analyzer.analyze({
      images: input.productImages,
      productName: input.productName,
      userHints: { category: input.category as never, sellPoints: input.sellPoints, parameters: input.parameters },
    });
    await prisma.marketingTask.update({ where: { id: taskId }, data: { analysis: analysis as never } });
    await updateStep(activeStep, { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - analysisStartedAt });

    if (input.outputs.copywriting) {
      activeStep = 'copywriting';
      const startedAt = Date.now();
      await updateStep(activeStep, { status: 'running', startedAt: new Date().toISOString() });
      copywriting = await new CopywritingEngine(content.runtimeConfig).generate(analysis, input.platform as Platform, input.language as Language, input.keywords);
      await prisma.marketingTask.update({ where: { id: taskId }, data: { copywriting: copywriting as never } });
      await updateStep(activeStep, { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
    }

    if (input.outputs.mainPrompts) {
      activeStep = 'mainPrompts';
      const startedAt = Date.now();
      await updateStep(activeStep, { status: 'running', startedAt: new Date().toISOString() });
      mainPrompts = await new PromptEngine(content.runtimeConfig).generateMainImagePrompts(analysis, input.platform as Platform, input.language as Language, input.sellPoints);
      await prisma.marketingTask.update({ where: { id: taskId }, data: { mainPrompts: mainPrompts as never } });
      await updateStep(activeStep, { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
    }

    if (input.outputs.detailPrompts) {
      activeStep = 'detailPrompts';
      const startedAt = Date.now();
      await updateStep(activeStep, { status: 'running', startedAt: new Date().toISOString() });
      detailPrompts = await new PromptEngine(content.runtimeConfig).generateDetailPagePrompts(analysis, input.platform as Platform, input.language as Language);
      await prisma.marketingTask.update({ where: { id: taskId }, data: { detailPrompts: detailPrompts as never } });
      await updateStep(activeStep, { status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
    }

    await prisma.marketingTask.update({ where: { id: taskId }, data: { status: 'completed' } });
    return NextResponse.json({ success: true, taskId, result: { analysis, copywriting, mainPrompts, detailPrompts } });
  } catch (error) {
    const message = errorMessage(error);
    if (taskId) {
      if (steps && activeStep) {
        steps[activeStep] = { ...steps[activeStep], status: 'failed', completedAt: new Date().toISOString(), error: message };
      }
      await prisma.marketingTask.update({
        where: { id: taskId },
        data: { status: 'failed', error: message, ...(steps ? { executionSteps: steps } : {}) },
      });
    }
    const status = error instanceof z.ZodError || /所选模型|图片识别模型|内容生成模型|请至少选择/.test(message) ? 400 : 500;
    console.error('[API] Marketing generate error:', error);
    return NextResponse.json({ success: false, error: message || '营销素材生成失败' }, { status });
  }
}

/** GET /api/marketing/generate?taskId=xxx - 查询当前用户的任务 */
export async function GET(request: NextRequest) {
  try {
    const taskId = new URL(request.url).searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ success: false, error: '缺少 taskId 参数' }, { status: 400 });

    const user = await getCurrentUser();
    const task = await prisma.marketingTask.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 });

    return NextResponse.json({
      success: true,
      task: {
        taskId: task.id,
        status: task.status,
        analysis: task.analysis,
        copywriting: task.copywriting,
        mainPrompts: task.mainPrompts,
        detailPrompts: task.detailPrompts,
        modelSnapshot: task.modelSnapshot,
        executionSteps: task.executionSteps,
        error: task.error,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] Marketing get task error:', error);
    return NextResponse.json({ success: false, error: '查询任务失败' }, { status: 500 });
  }
}
