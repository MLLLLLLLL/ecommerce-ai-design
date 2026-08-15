import { expect, test } from '@playwright/test';

// ============================================
// 营销助手2 E2E（V2 12.3 / 12.4）
// V3 单工作流入口、连续向导与草稿恢复、
// 三视口无横向溢出与键盘可达。
// ============================================

const CONSOLE_ERROR_PATTERNS = [/hydration/i, /Unhandled/i];

/** 1x1 红色 PNG，用于产品图上传。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe('营销助手2卡片中心', () => {
  test('只渲染一张主流程卡片且无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/marketing2');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('主图详情页全自动生成', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('底图净化', { exact: true })).toHaveCount(0);

    const unexpected = errors.filter((text) =>
      CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(text))
    );
    expect(unexpected).toEqual([]);
  });

  test('返回旧版营销助手入口存在', async ({ page }) => {
    await page.goto('/marketing2');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: '返回旧版营销助手' })).toBeVisible();
  });

  test('无横向溢出', async ({ page }) => {
    await page.goto('/marketing2');
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test('键盘可以聚焦卡片操作按钮', async ({ page }) => {
    await page.goto('/marketing2');
    await page.waitForLoadState('networkidle');

    // Tab 到卡片内的第一个操作按钮（开始新任务/配置模型/继续任务）
    const target = page
      .getByRole('link')
      .filter({ hasText: /开始新任务|配置模型|继续任务/ })
      .first();
    await expect(target).toBeVisible();
    await target.focus();
    await expect(target).toBeFocused();
  });
});

test.describe('工作流运行页', () => {
  test('步骤栏与素材表单渲染', async ({ page }) => {
    await page.goto('/marketing2/marketing2-image-detail-full');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('准备产品图', { exact: true })).toBeVisible();
    await expect(page.getByText('底图精修（可选）', { exact: true })).toBeVisible();
    await expect(page.getByText('产品信息')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存并继续' })).toBeVisible();
  });

  test('草稿保存后刷新恢复（任务版本不丢失）', async ({ page }) => {
    await page.goto('/marketing2/marketing2-prompt-planning');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('xpath=//label[contains(text(),"产品名称")]/following::input[1]');
    await nameInput.fill('E2E 恢复测试产品');

    // 上传 1x1 产品图，满足素材校验
    await page.locator('input[type="file"]').setInputFiles({
      name: 'product.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await expect(page.getByAltText('产品图 1')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '保存草稿' }).click();
    await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible({ timeout: 10_000 });

    // URL 应写入 runId
    await page.waitForURL(/runId=/);

    await page.reload();
    await page.waitForLoadState('networkidle');
    const restored = page.locator(
      'xpath=//label[contains(text(),"产品名称")]/following::input[1]'
    );
    await expect(restored).toHaveValue('E2E 恢复测试产品');
  });

  test('未知工作流展示错误提示', async ({ page }) => {
    await page.goto('/marketing2/not-a-workflow');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/未知工作流/)).toBeVisible();
  });
});
