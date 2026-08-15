import { NextRequest, NextResponse } from 'next/server';
import { createAIService } from '@/lib/ai/factory';
import { QueueManager } from '@/lib/queue/QueueManager';
import { FileStorage } from '@/lib/storage/FileStorage';
import { prisma } from '@/lib/db/prisma';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { config, params } = body;

    // 验证参数
    if (!params.image) {
      return NextResponse.json(
        { success: false, error: 'Image is required' },
        { status: 400 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'AI service configuration is required' },
        { status: 400 }
      );
    }

    // 获取适配器
    // 获取适配器（每次请求新建，确保使用最新配置）
    const adapter = createAIService(config);

    // 通过队列执行任务
    const taskId = crypto.randomUUID();

    const imageUrls = await QueueManager.addTask<string[]>(
      config.id,
      {
        id: taskId,
        execute: () =>
          adapter.imageToImage({
            image: params.image,
            prompt: params.prompt || '',
            negativePrompt: params.negativePrompt,
            width: params.width || 1024,
            height: params.height || 1024,
            samples: params.samples || 1,
            strength: params.strength || 0.75,
            steps: params.steps,
            cfgScale: params.cfgScale,
            seed: params.seed,
            mask: params.mask,
          }),
      }
    );

    // 保存到文件系统和数据库
    const storage = new FileStorage({
      baseDir: process.env.USER_DATA_PATH || './user-data',
    });
    await storage.init();

    const assets = [];

    // 获取或创建默认用户
    let user = await prisma.user.findFirst({
      where: { email: 'local@user.com' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'local@user.com',
          name: '本地用户',
        },
      });
    }

    // 处理每张生成的图片
    for (const url of imageUrls) {
      try {
        // 生成文件名
        const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;

        const saved = await storage.saveFromUrl(url, filename);
        const { filepath, thumbnail } = saved;

        // 创建数据库记录
        const asset = await prisma.asset.create({
          data: {
            userId: user.id,
            filename,
            filepath,
            thumbnail,
            filesize: saved.size,
            width: saved.width || params.width || 1024,
            height: saved.height || params.height || 1024,
            format: 'png',
            prompt: params.prompt || null,
            negativePrompt: params.negativePrompt || null,
            aiModel: config.model || null,
            aiProvider: config.provider,
            parameters: {
              width: params.width,
              height: params.height,
              strength: params.strength,
              steps: params.steps,
              cfgScale: params.cfgScale,
              seed: params.seed,
            },
            source: 'image-to-image',
          },
          include: {
            tags: true,
            folder: true,
          },
        });

        assets.push(asset);
      } catch (error) {
        console.error('Error saving image:', error);
      }
    }

    return NextResponse.json({
      success: true,
      assets,
      count: assets.length,
      provider: config.provider,
    });
  } catch (error: any) {
    console.error('[API] Image-to-image error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate images',
      },
      { status: 500 }
    );
  }
}
