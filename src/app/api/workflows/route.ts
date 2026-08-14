import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

// GET /api/workflows - 工作流仓库列表（不返回 definition 大字段，仅回节点数）
export async function GET() {
  try {
    const user = await getCurrentUser();
    const workflows = await prisma.workflowTemplate.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        nodeCount: Array.isArray((w.definition as any)?.nodes)
          ? (w.definition as any).nodes.length
          : 0,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('[API] Get workflows error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/workflows - 新建工作流项目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, description, definition } = body;

    const user = await getCurrentUser();

    const workflow = await prisma.workflowTemplate.create({
      data: {
        userId: user.id,
        name: name?.trim() || '未命名工作流',
        description: description ?? null,
        definition: definition ?? { nodes: [], edges: [] },
      },
    });

    return NextResponse.json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    console.error('[API] Create workflow error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
