import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/folders - 获取文件夹列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId');

    const folders = await prisma.folder.findMany({
      where: {
        parentId: parentId || null,
      },
      include: {
        _count: {
          select: {
            assets: true,
            children: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      success: true,
      folders,
    });
  } catch (error: any) {
    console.error('[API] Get folders error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/folders - 创建文件夹
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color, parentId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      );
    }

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

    // 检查同级文件夹中是否已存在同名文件夹
    const existing = await prisma.folder.findFirst({
      where: {
        userId: user.id,
        parentId: parentId || null,
        name: name.trim(),
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Folder with this name already exists' },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.create({
      data: {
        userId: user.id,
        name: name.trim(),
        description: description || null,
        color: color || null,
        parentId: parentId || null,
      },
      include: {
        _count: {
          select: {
            assets: true,
            children: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      folder,
    });
  } catch (error: any) {
    console.error('[API] Create folder error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
