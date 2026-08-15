import { describe, expect, it } from 'vitest';
import {
  getWorkflow,
  ITEM_KINDS,
  mainImageItemKind,
  promptPlanItemKind,
  parseItemKind,
  qualityCheckItemKind,
  repairItemKind,
  STEP_CAPABILITY_MATRIX,
  stepDependenciesMet,
  WORKFLOW_REGISTRY,
} from '@/lib/marketing2/workflow-registry';

// ============================================
// 工作流注册表契约测试（V2 4 / 12.1）
// ============================================

describe('workflow registry', () => {
  it('冻结五个 workflowKey', () => {
    expect(WORKFLOW_REGISTRY.map((workflow) => workflow.key)).toEqual([
      'marketing2-image-detail-full',
      'marketing2-background-cleanup',
      'marketing2-prompt-planning',
      'marketing2-batch-generation',
      'marketing2-quality-repair',
    ]);
  });

  it('每张卡片声明必填输入、输出与步骤', () => {
    for (const workflow of WORKFLOW_REGISTRY) {
      expect(workflow.version).toBeGreaterThan(0);
      expect(workflow.requiredInputs.length).toBeGreaterThan(0);
      expect(workflow.outputTypes.length).toBeGreaterThan(0);
      expect(workflow.steps.length).toBeGreaterThanOrEqual(2);
      // 步骤 order 严格递增
      workflow.steps.forEach((step, index) => {
        expect(step.order).toBe(index + 1);
      });
    }
  });

  it('能力矩阵符合交互文档 7.2', () => {
    expect(STEP_CAPABILITY_MATRIX.visual_analysis).toEqual(['vision', 'jsonMode']);
    expect(STEP_CAPABILITY_MATRIX.prompt_planning).toEqual(['jsonMode']);
    expect(STEP_CAPABILITY_MATRIX.background_cleanup).toEqual(['imageEditing', 'referenceImage']);
    expect(STEP_CAPABILITY_MATRIX.batch_generation).toEqual(['imageGeneration', 'referenceImage']);
    expect(STEP_CAPABILITY_MATRIX.quality_repair).toEqual(['vision', 'jsonMode']);
    expect(STEP_CAPABILITY_MATRIX['quality_repair:repair']).toEqual(['imageEditing', 'referenceImage']);
    expect(STEP_CAPABILITY_MATRIX.material_validate).toEqual([]);
  });

  it('底图净化在所有包含它的工作流中可跳过，其余步骤不可（交互 6.2）', () => {
    const full = getWorkflow('marketing2-image-detail-full')!;
    const cleanup = full.steps.find((step) => step.key === 'background_cleanup')!;
    expect(cleanup.allowSkip).toBe(true);
    for (const workflow of WORKFLOW_REGISTRY) {
      for (const step of workflow.steps) {
        const expectSkip = step.key === 'background_cleanup';
        expect(step.allowSkip).toBe(expectSkip);
      }
    }
  });

  it('步骤依赖校验：依赖未 approved/skipped 时拒绝', () => {
    const full = getWorkflow('marketing2-image-detail-full')!;
    const blocked = stepDependenciesMet(full, 'prompt_planning', {
      material_validate: 'approved',
      visual_analysis: 'awaiting_review',
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.missing).toContain('visual_analysis');

    const passed = stepDependenciesMet(full, 'prompt_planning', {
      material_validate: 'approved',
      background_cleanup: 'skipped',
      visual_analysis: 'approved',
    });
    expect(passed.ok).toBe(true);
  });

  it('item kind 构造与解析', () => {
    expect(mainImageItemKind(3)).toBe('main_image:3');
    expect(qualityCheckItemKind('a1')).toBe('quality_check:a1');
    expect(repairItemKind('a1', 'text_garbled')).toBe('repair:a1:text_garbled');
    expect(parseItemKind('main_image:3')).toEqual({ type: 'main_image', index: 3 });
    expect(promptPlanItemKind('detail_page', 8)).toBe('prompt_plan:detail_page:8');
    expect(parseItemKind('prompt_plan:detail_page:8')).toEqual({
      type: 'prompt_plan',
      kind: 'detail_page',
      index: 8,
    });
    expect(parseItemKind('repair:a1:text_garbled')).toEqual({
      type: 'repair',
      assetId: 'a1',
      issueType: 'text_garbled',
    });
    expect(parseItemKind(ITEM_KINDS.materialValidate)).toEqual({
      type: 'simple',
      key: 'material_validate',
    });
  });
});
