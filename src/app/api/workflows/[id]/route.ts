import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/current-user';

// GET /api/workflows/[id] - 工作流详情（含 definition，进入编辑器时调用）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const workflow = await prisma.workflowTemplate.findFirst({
      where: { id, userId: user.id },
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    console.error('[API] Get workflow error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/workflows/[id] - 保存工作流（名称/描述/定义）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const body = await req.json();
    const { name, description, definition } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim() || '未命名工作流';
    if (description !== undefined) updateData.description = description;
    if (definition !== undefined) updateData.definition = definition;

    const updated = await prisma.workflowTemplate.updateMany({
      where: { id, userId: user.id },
      data: updateData,
    });
    if (!updated.count) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      workflow: await prisma.workflowTemplate.findFirst({ where: { id, userId: user.id }, select: { id: true, name: true, description: true, createdAt: true, updatedAt: true } }),
    });
  } catch (error: any) {
    console.error('[API] Update workflow error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/workflows/[id] - 删除工作流
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const deleted = await prisma.workflowTemplate.deleteMany({ where: { id, userId: user.id } });
    if (!deleted.count) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Delete workflow error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
