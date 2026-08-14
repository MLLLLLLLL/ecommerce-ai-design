import { expect, test } from '@playwright/test';

// Phase 0 营销页面冒烟测试（V3 12.5）
// 覆盖三种视口：1440×900 / 1024×768 / 390×844

const CONSOLE_ERROR_PATTERNS = [/hydration/i, /Unhandled/i, /Failed to load resource/i];

test.describe('营销工作台冒烟', () => {
  test('页面可加载且无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const unexpected = errors.filter((text) =>
      CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(text))
    );
    expect(unexpected).toEqual([]);
  });

  test('页面渲染加载状态或工作台/提示信息', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(
        async () => {
          const hasLoading = await page.getByText('正在加载模型配置').isVisible().catch(() => false);
          const hasWorkspace = await page
            .locator('[data-testid="marketing-workspace"]')
            .isVisible()
            .catch(() => false);
          const hasAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);
          return hasLoading || hasWorkspace || hasAlert;
        },
        { timeout: 10_000 }
      )
      .toBe(true);
  });

  test('无横向溢出（三视口）', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test('五 Tab 外壳可切换且占位 Tab 有阶段状态', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: '营销模块' }).getByRole('tab');
    await expect(tabs).toHaveCount(5);

    await tabs.filter({ hasText: '多语言翻译' }).click();
    await expect(page.getByText('待翻译内容')).toBeVisible();

    await tabs.filter({ hasText: 'SEO 优化' }).click();
    await expect(page.getByRole('button', { name: '生成 SEO 优化建议' })).toBeVisible();

    await tabs.filter({ hasText: 'GEO 优化' }).click();
    await expect(page.getByRole('button', { name: '生成 GEO 内容' })).toBeVisible();

    await tabs.filter({ hasText: '市场洞察' }).click();
    // 未配置搜索服务时展示未配置状态（联网门禁）
    await expect(page.getByText(/尚未配置可用的搜索服务|联网洞察/)).toBeVisible();

    await tabs.filter({ hasText: '文案创作' }).click();
    await expect(page.getByRole('button', { name: '开始生成' })).toBeVisible();
  });

  test('旧版向导入口可切换', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const legacyButton = page.getByRole('button', { name: '旧版向导' });
    await legacyButton.click();
    await page.waitForURL(/mode=legacy/);
    await expect(page.getByRole('button', { name: '切换到新工作台' })).toBeVisible();
  });

  test('翻译 Tab：表单可交互且未填源文本时提示', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: '营销模块' }).getByRole('tab');
    await tabs.filter({ hasText: '多语言翻译' }).click();

    await expect(page.getByText('待翻译内容')).toBeVisible();

    // 未填写源文本直接提交：提示错误
    await page.getByRole('button', { name: '开始翻译' }).click();
    await expect(page.getByText('请输入待翻译内容')).toBeVisible();
  });

  test('翻译 Tab：目标语言可多选且受上限约束', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: '营销模块' }).getByRole('tab');
    await tabs.filter({ hasText: '多语言翻译' }).click();

    await page.getByLabel('搜索语言').fill('英语');
    await page.getByText('英语（美国）').click();
    await expect(page.getByText('已选 1/10 种')).toBeVisible();

    await page.getByLabel('搜索语言').fill('日语');
    await page.getByText('日语', { exact: true }).click();
    await expect(page.getByText('已选 2/10 种')).toBeVisible();

    // 已选 chips 出现，可移除
    await page.getByLabel('移除 日语').click();
    await expect(page.getByText('已选 1/10 种')).toBeVisible();
  });

  test('SEO Tab：表单可见且未填必填项时提示', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: '营销模块' }).getByRole('tab');
    await tabs.filter({ hasText: 'SEO 优化' }).click();

    // 顶部提示：不含实时数据
    await expect(page.getByText(/不提供实时搜索量/)).toBeVisible();

    // 未填商品名与关键词直接提交：提示错误
    await page.getByRole('button', { name: '生成 SEO 优化建议' }).click();
    await expect(page.getByText('请输入商品名称或页面主题')).toBeVisible();

    // 已确认事实可添加
    await page.getByLabel('SEO 事实键').fill('材质');
    await page.getByLabel('SEO 事实值').fill('316 不锈钢');
    await page.getByRole('button', { name: 'SEO 添加事实' }).click();
    await expect(page.getByText('材质：')).toBeVisible();
    await expect(page.getByText('316 不锈钢')).toBeVisible();
  });

  test('全部作品：类型/状态/时间组合筛选', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: '全部作品' }).click();

    await expect(page.getByLabel('类型筛选')).toBeVisible();
    await page.getByLabel('类型筛选').selectOption('translate');
    await page.getByLabel('状态筛选').selectOption('completed');
    await page.getByLabel('时间筛选').selectOption('7d');
    await expect(page.getByRole('textbox', { name: '搜索', exact: true })).toBeVisible();
  });

  test('GEO Tab：离线声明可见且必填校验生效', async ({ page }) => {
    await page.goto('/marketing');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: '营销模块' }).getByRole('tab');
    await tabs.filter({ hasText: 'GEO 优化' }).click();

    // 顶部离线声明
    await expect(page.getByText(/离线版 GEO/)).toBeVisible();

    // 未填必填项直接提交：提示错误
    await page.getByRole('button', { name: '生成 GEO 内容' }).click();
    await expect(page.getByText('请输入目标用户问题')).toBeVisible();

    // 已确认事实输入可用
    await page.getByLabel('GEO 事实键').fill('material');
    await page.getByLabel('GEO 事实值').fill('316 不锈钢');
    await page.getByRole('button', { name: 'GEO 添加事实' }).click();
    await expect(page.getByText('material：')).toBeVisible();
  });
});
