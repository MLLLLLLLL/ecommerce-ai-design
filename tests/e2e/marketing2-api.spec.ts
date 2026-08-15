import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// ============================================
// 营销助手2 API 契约测试（V2 12.2）
// 密钥拒绝、非法 workflowKey、版本冲突、幂等键、重试门禁。
// ============================================

const WORKFLOW = 'marketing2-background-cleanup';

/** 1x1 PNG，用于真实上传。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function uploadTinyPng(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.post('/api/marketing/upload', {
    multipart: {
      files: {
        name: 'api-test.png',
        mimeType: 'image/png',
        buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
      },
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.data.files[0].url;
}

async function createDraft(
  request: import('@playwright/test').APIRequestContext,
  input: Record<string, unknown>,
  idempotencyKey = `api-test-create-${randomUUID()}`
) {
  return request.post('/api/marketing2/runs', {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { workflowKey: WORKFLOW, input, stepModels: {} },
  });
}

test.describe('API 契约', () => {
  test('前端传入 apiKey 时拒绝（FORBIDDEN_FIELDS）', async ({ request }) => {
    const response = await createDraft(request, {
      productImages: ['/api/files/user-data/marketing/x.png'],
      apiKey: 'sk-should-be-rejected',
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN_FIELDS');
  });

  test('stepModels 内嵌套密钥同样拒绝', async ({ request }) => {
    const response = await request.post('/api/marketing2/runs', {
      headers: { 'Idempotency-Key': 'api-test-forbidden-step-models' },
      data: {
        workflowKey: WORKFLOW,
        input: { productImages: ['/api/files/user-data/marketing/x.png'] },
        stepModels: { secret: 'abc' },
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN_FIELDS');
  });

  test('非法 workflowKey 返回 404', async ({ request }) => {
    const response = await request.post('/api/marketing2/runs', {
      headers: { 'Idempotency-Key': 'api-test-invalid-workflow' },
      data: { workflowKey: 'not-a-workflow', input: {}, stepModels: {} },
    });
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('WORKFLOW_NOT_FOUND');
  });

  test('输入不合法返回字段定位错误', async ({ request }) => {
    const response = await createDraft(request, { productImages: [] });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INPUT_INVALID');
    expect(body.error.fieldErrors).toBeTruthy();
  });

  test('创建缺少 Idempotency-Key 返回 400', async ({ request }) => {
    const response = await request.post('/api/marketing2/runs', {
      data: {
        workflowKey: WORKFLOW,
        input: { productImages: ['/api/files/user-data/marketing/x.png'] },
        stepModels: {},
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  test('重复创建同一幂等键复用同一草稿', async ({ request }) => {
    const idempotencyKey = 'api-test-create-deduplication';
    const data = {
      workflowKey: WORKFLOW,
      input: { productImages: ['/api/files/user-data/marketing/x.png'] },
      stepModels: {},
    };

    const [first, second] = await Promise.all([
      request.post('/api/marketing2/runs', {
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      }),
      request.post('/api/marketing2/runs', {
        headers: { 'Idempotency-Key': idempotencyKey },
        data,
      }),
    ]);
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(201);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.task.id).toBe(firstBody.task.id);
  });

  test('明确请求后可强制删除已执行任务', async ({ request }) => {
    const created = await createDraft(request, {
      productImages: ['/api/files/user-data/marketing/x.png'],
    });
    const { task } = await created.json();

    const executed = await request.post(
      `/api/marketing2/runs/${task.id}/steps/material_validate/execute`,
      {
        headers: { 'Idempotency-Key': `api-test-force-delete-${randomUUID()}` },
        data: { expectedVersion: task.taskVersion },
      }
    );
    expect(executed.status()).toBe(200);

    const deleted = await request.delete(`/api/marketing2/runs/${task.id}?force=true`);
    expect(deleted.status()).toBe(200);

    const missing = await request.get(`/api/marketing2/runs/${task.id}`);
    expect(missing.status()).toBe(404);
  });

  test('PATCH 版本冲突返回 VERSION_CONFLICT', async ({ request }) => {
    const created = await createDraft(request, {
      productImages: ['/api/files/user-data/marketing/x.png'],
    });
    expect(created.status()).toBe(201);
    const { task } = await created.json();

    const conflict = await request.patch(`/api/marketing2/runs/${task.id}`, {
      data: { expectedVersion: task.taskVersion + 99, title: '冲突标题' },
    });
    expect(conflict.status()).toBe(409);
    const body = await conflict.json();
    expect(body.error.code).toBe('VERSION_CONFLICT');
  });

  test('执行缺少 Idempotency-Key 返回 400', async ({ request }) => {
    const created = await createDraft(request, {
      productImages: ['/api/files/user-data/marketing/x.png'],
    });
    const { task } = await created.json();

    const response = await request.post(
      `/api/marketing2/runs/${task.id}/steps/material_validate/execute`,
      { data: { expectedVersion: task.taskVersion } }
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  test('重复执行同一幂等键返回首次结果且不重复创建 Item', async ({ request }) => {
    const created = await createDraft(request, {
      productImages: ['/api/files/user-data/marketing/x.png'],
    });
    const { task } = await created.json();
    const idem = 'api-test-idem-1';

    const first = await request.post(
      `/api/marketing2/runs/${task.id}/steps/material_validate/execute`,
      {
        headers: { 'Idempotency-Key': idem },
        data: { expectedVersion: task.taskVersion },
      }
    );
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.items.length).toBe(1);

    const second = await request.post(
      `/api/marketing2/runs/${task.id}/steps/material_validate/execute`,
      {
        headers: { 'Idempotency-Key': idem },
        data: { expectedVersion: firstBody.task.taskVersion },
      }
    );
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.deduplicated).toBe(true);
    expect(secondBody.items.length).toBe(1);
    expect(secondBody.items[0].id).toBe(firstBody.items[0].id);
  });

  test('非失败子项重试被拒绝', async ({ request }) => {
    const imageUrl = await uploadTinyPng(request);
    const created = await createDraft(request, { productImages: [imageUrl] });
    const { task } = await created.json();

    const executed = await request.post(
      `/api/marketing2/runs/${task.id}/steps/material_validate/execute`,
      {
        headers: { 'Idempotency-Key': 'api-test-retry-1' },
        data: { expectedVersion: task.taskVersion },
      }
    );
    const { items } = await executed.json();

    // 等待 Worker 将 item 推进到终态（completed），避免与领取过程竞争
    await expect
      .poll(
        async () => {
          const detail = await request.get(`/api/marketing2/runs/${task.id}`);
          const body = await detail.json();
          const item = body.items.find((candidate: { id: string }) => candidate.id === items[0].id);
          return item?.status;
        },
        { timeout: 15_000 }
      )
      .toBe('completed');

    const retry = await request.post(`/api/marketing2/runs/${task.id}/items/${items[0].id}/retry`, {
      headers: { 'Idempotency-Key': 'api-test-retry-2' },
      data: {},
    });
    expect(retry.status()).toBe(400);
    const body = await retry.json();
    expect(body.error.code).toBe('ITEM_RETRY_FORBIDDEN');
  });

  test('越权任务按不存在处理（404）', async ({ request }) => {
    const response = await request.get('/api/marketing2/runs/00000000-0000-0000-0000-000000000000');
    expect(response.status()).toBe(404);
  });
});
