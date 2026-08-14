import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrchestratorNode, composePrompt } from '@/lib/workflow/nodes/orchestrator';
import type { ExecutionContext } from '@/lib/workflow/nodes/base';

// ---------- 工具 ----------

function makeContext(
  config: Record<string, any>,
  inputs: Record<string, any> = {}
): ExecutionContext {
  return {
    nodeId: 'n1',
    inputs,
    config,
    previousResults: new Map(),
  };
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function imageResponse(filepath: string): Response {
  return new Response(JSON.stringify({ success: true, assets: [{ filepath }] }), {
    status: 200,
  });
}

function modelConfigsResponse(models: unknown[]): Response {
  return new Response(JSON.stringify({ models }), { status: 200 });
}

const defaultModel = {
  id: 'model-1',
  name: '默认文本模型',
  isActive: true,
  isDefault: true,
  capabilities: { jsonMode: true },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------- composePrompt ----------

describe('composePrompt', () => {
  it('将模板占位符替换为输入值', () => {
    expect(
      composePrompt('商品：{promptA}，风格：{promptB}', {
        promptA: '保温杯',
        promptB: '北欧风',
      })
    ).toBe('商品：保温杯，风格：北欧风');
  });

  it('未连接的输入替换为空并压缩多余空白', () => {
    expect(
      composePrompt('商品：{promptA}  风格：{promptB}', { promptA: '保温杯' })
    ).toBe('商品：保温杯 风格：');
  });

  it('模板为空时退化为第一个非空输入', () => {
    expect(composePrompt('', { promptA: '', promptB: '第二段' })).toBe('第二段');
  });

  it('模板为空且无输入时返回空串', () => {
    expect(composePrompt('', { promptA: '', promptB: '' })).toBe('');
  });
});

// ---------- image 模式 ----------

describe('OrchestratorNode image 模式', () => {
  const node = new OrchestratorNode();

  it('无参考图时调文生图，返回首图与全部图片', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/text-to-image') return imageResponse('img/1.png');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await node.execute(
      makeContext(
        { mode: 'image', composerContent: '一只猫 {promptA}', serviceConfig: { id: 'svc' }, imageCount: 1 },
        { promptA: '戴帽子' }
      )
    );

    expect(result).toEqual({
      image: '/api/files/img/1.png',
      images: ['/api/files/img/1.png'],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/text-to-image');
    const body = JSON.parse(init.body);
    expect(body.params.prompt).toBe('一只猫 戴帽子');
    expect(body.params.seed).toBeUndefined();
  });

  it('连接参考图时调图生图并传 strength', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/image-to-image') return imageResponse('img/2.png');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await node.execute(
      makeContext(
        {
          mode: 'image',
          composerContent: '改造成赛博朋克风格',
          serviceConfig: { id: 'svc' },
          imageCount: 1,
        },
        { reference: 'data:image/png;base64,abc' }
      )
    );

    expect(result.image).toBe('/api/files/img/2.png');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/image-to-image');
    const body = JSON.parse(init.body);
    expect(body.params.image).toBe('data:image/png;base64,abc');
    expect(body.params.strength).toBe(0.75);
  });

  it('批量 3 张并行请求，固定种子按序递增', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/text-to-image') return imageResponse('img/batch.png');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await node.execute(
      makeContext(
        {
          mode: 'image',
          composerContent: '批量出图',
          serviceConfig: { id: 'svc' },
          imageCount: 3,
          seed: 100,
        },
        {}
      )
    );

    expect(result.images).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const seeds = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).params.seed);
    expect(seeds).toEqual([100, 101, 102]);
  });

  it('批量中一张失败则整体失败并指明张号', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/text-to-image') {
        calls += 1;
        if (calls === 2) {
          return new Response(JSON.stringify({ success: false, error: '服务不可用' }), {
            status: 500,
          });
        }
        return imageResponse('img/ok.png');
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await expect(
      node.execute(
        makeContext(
          { mode: 'image', composerContent: '批量', serviceConfig: { id: 'svc' }, imageCount: 3 },
          {}
        )
      )
    ).rejects.toThrow('第 2 张生成失败');
  });
});

// ---------- text 模式 ----------

describe('OrchestratorNode text 模式', () => {
  const node = new OrchestratorNode();

  it('取默认文本模型生成文案并返回 text', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/model-configs') return modelConfigsResponse([defaultModel]);
      if (url === '/api/ai/optimize-prompt') {
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"生成"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"的文案"}}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await node.execute(
      makeContext({ mode: 'text', composerContent: '写一段文案' }, {})
    );

    expect(result).toEqual({ text: '生成的文案' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/ai/optimize-prompt');
    const body = JSON.parse(init.body);
    expect(body.modelId).toBe('model-1');
    expect(body.prompt).toBe('写一段文案');
    expect(body.mode).toBe('text-to-image');
  });

  it('systemPrompt 拼入 prompt 前缀', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/model-configs') return modelConfigsResponse([defaultModel]);
      if (url === '/api/ai/optimize-prompt') return sseResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    });

    await node.execute(
      makeContext(
        { mode: 'text', composerContent: '写一段文案', systemPrompt: '你是文案专家' },
        {}
      )
    );

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.prompt).toBe('你是文案专家\n\n写一段文案');
  });

  it('无可用文本模型时报错', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/model-configs') return modelConfigsResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    });

    await expect(
      node.execute(makeContext({ mode: 'text', composerContent: '写一段文案' }, {}))
    ).rejects.toThrow('文本模型');
  });
});

// ---------- both 模式 ----------

describe('OrchestratorNode both 模式', () => {
  const node = new OrchestratorNode();

  it('先生成文案，再以文案为提示词出图', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/model-configs') return modelConfigsResponse([defaultModel]);
      if (url === '/api/ai/optimize-prompt') {
        return sseResponse(['data: {"choices":[{"delta":{"content":"生成好的文案"}}]}\n\n']);
      }
      if (url === '/api/ai/text-to-image') return imageResponse('img/final.png');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await node.execute(
      makeContext(
        { mode: 'both', composerContent: '主题内容', serviceConfig: { id: 'svc' }, imageCount: 1 },
        {}
      )
    );

    expect(result.text).toBe('生成好的文案');
    expect(result.image).toBe('/api/files/img/final.png');
    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.params.prompt).toBe('生成好的文案');
  });
});

// ---------- validate ----------

describe('OrchestratorNode validate', () => {
  const node = new OrchestratorNode();

  it('缺提示词内容校验失败', async () => {
    expect(await node.validate(makeContext({ mode: 'image', serviceConfig: {} }, {}))).toBe(
      false
    );
  });

  it('image 模式缺 AI 服务校验失败', async () => {
    expect(
      await node.validate(makeContext({ mode: 'image', composerContent: '有内容' }, {}))
    ).toBe(false);
  });

  it('text 模式无需 AI 服务', async () => {
    expect(
      await node.validate(makeContext({ mode: 'text', composerContent: '有内容' }, {}))
    ).toBe(true);
  });
});
