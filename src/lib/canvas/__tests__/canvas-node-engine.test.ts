import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useConfigStore 使用 localStorage persist，node 测试环境不可用，mock 为固定假服务
vi.mock('@/stores/useConfigStore', () => ({
  useConfigStore: {
    getState: () => ({
      getServiceById: () => ({ id: 'svc', name: '测试服务' }),
      getActiveService: () => ({ id: 'svc', name: '测试服务' }),
    }),
  },
}));

import {
  resolveConfigInputs,
  computeResultPositions,
  executeConfigNode,
  validateConfigNode,
  generatePlanImage,
} from '@/lib/canvas/nodes/engine';
import { normalizeCanvasConnections } from '@/lib/canvas/nodes/types';
import type {
  CanvasNodeData,
  CanvasConnection,
} from '@/lib/canvas/nodes/types';

// ---------- 工具 ----------

function makeNode(overrides: Partial<CanvasNodeData>): CanvasNodeData {
  return {
    id: 'n1',
    kind: 'text',
    title: '节点',
    position: { x: 100, y: 100 },
    width: 260,
    height: 160,
    metadata: {},
    ...overrides,
  };
}

function makeTextNode(id: string, content: string): CanvasNodeData {
  return makeNode({ id, kind: 'text', metadata: { content } });
}

function makeImageNode(id: string, imageUrl: string): CanvasNodeData {
  return makeNode({
    id,
    kind: 'image',
    width: 240,
    height: 240,
    metadata: { imageUrl },
  });
}

function makeConfigNode(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return makeNode({
    id: 'config',
    kind: 'config',
    width: 300,
    height: 420,
    metadata: {
      composerContent: '',
      mode: 'image',
      imageCount: 1,
      genWidth: 1024,
      genHeight: 1024,
      steps: 20,
      cfgScale: 7,
      seed: -1,
      strength: 0.75,
    },
    ...overrides,
  });
}

function imageResponse(filepath: string): Response {
  return new Response(JSON.stringify({ success: true, assets: [{ filepath }] }), {
    status: 200,
  });
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------- resolveConfigInputs ----------

describe('resolveConfigInputs', () => {
  it('上游 text 节点按顺序填入 promptA/B/C', () => {
    const config = makeConfigNode();
    const nodes = [
      makeTextNode('t1', '保温杯'),
      makeTextNode('t2', '北欧风'),
      makeTextNode('t3', '场景图'),
    ];
    const connections: CanvasConnection[] = [
      { id: 'c1', fromNodeId: 't1', fromPortName: 'text', toNodeId: 'config', toPortName: 'promptA' },
      { id: 'c2', fromNodeId: 't2', fromPortName: 'text', toNodeId: 'config', toPortName: 'promptB' },
      { id: 'c3', fromNodeId: 't3', fromPortName: 'text', toNodeId: 'config', toPortName: 'promptC' },
    ];
    expect(resolveConfigInputs(config, nodes, connections)).toEqual({
      promptA: '保温杯',
      promptB: '北欧风',
      promptC: '场景图',
    });
  });

  it('上游 image 节点作为 reference（text 优先）', () => {
    const config = makeConfigNode();
    const nodes = [makeTextNode('t1', '改风格'), makeImageNode('i1', '/api/files/a.png')];
    const connections: CanvasConnection[] = [
      { id: 'c1', fromNodeId: 'i1', fromPortName: 'image', toNodeId: 'config', toPortName: 'reference' },
      { id: 'c2', fromNodeId: 't1', fromPortName: 'text', toNodeId: 'config', toPortName: 'promptA' },
    ];
    const inputs = resolveConfigInputs(config, nodes, connections);
    expect(inputs.promptA).toBe('改风格');
    expect(inputs.reference).toBe('/api/files/a.png');
  });

  it('无连线时返回空输入', () => {
    expect(resolveConfigInputs(makeConfigNode(), [], [])).toEqual({});
  });
});

describe('normalizeCanvasConnections', () => {
  it('为旧版连线补齐可执行的端口信息', () => {
    const nodes = [makeTextNode('t1', '保温杯'), makeConfigNode()];
    expect(
      normalizeCanvasConnections(nodes, [
        { id: 'legacy', fromNodeId: 't1', toNodeId: 'config' },
      ])
    ).toEqual([
      {
        id: 'legacy',
        fromNodeId: 't1',
        fromPortName: 'text',
        toNodeId: 'config',
        toPortName: 'promptA',
      },
    ]);
  });

  it('拒绝类型不匹配的旧版连线', () => {
    const nodes = [makeTextNode('t1', '保温杯'), makeImageNode('i1', '/api/a.png')];
    expect(
      normalizeCanvasConnections(nodes, [
        { id: 'legacy', fromNodeId: 't1', toNodeId: 'i1' },
      ])
    ).toEqual([]);
  });
});

// ---------- computeResultPositions ----------

describe('computeResultPositions', () => {
  it('编排节点右侧 80px，每张间隔 400px（st-image 位置策略）', () => {
    const source = makeConfigNode({ position: { x: 200, y: 300 } });
    const positions = computeResultPositions(source, 3);
    expect(positions).toEqual([
      { x: 200 + 300 + 80, y: 300 },
      { x: 200 + 300 + 80 + 400, y: 300 },
      { x: 200 + 300 + 80 + 800, y: 300 },
    ]);
  });
});

// ---------- validateConfigNode ----------

describe('validateConfigNode', () => {
  it('缺少提示词内容时返回具体错误', () => {
    const config = makeConfigNode({ metadata: { mode: 'image' } });
    expect(validateConfigNode(config, [], [])).toContain('缺少提示词内容');
  });

  it('image 模式：有内容且服务可解析时校验通过', () => {
    const config = makeConfigNode({
      metadata: { mode: 'image', composerContent: '有内容' },
    });
    expect(validateConfigNode(config, [], [])).toBeNull();
  });

  it('text 模式无需 AI 服务', () => {
    const config = makeConfigNode({
      metadata: { mode: 'text', composerContent: '写一段文案' },
    });
    expect(validateConfigNode(config, [], [])).toBeNull();
  });
});

// ---------- executeConfigNode ----------

describe('executeConfigNode', () => {
  it('image 模式：组合上游提示词并调用文生图，返回首图与全部', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/text-to-image') return imageResponse('img/out.png');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const config = makeConfigNode({
      metadata: {
        composerContent: '一只猫 {promptA}',
        mode: 'image',
        imageCount: 1,
      },
    });
    const nodes = [config, makeTextNode('t1', '戴帽子')];
    const connections: CanvasConnection[] = [
      { id: 'c1', fromNodeId: 't1', fromPortName: 'text', toNodeId: 'config', toPortName: 'promptA' },
    ];

    const result = await executeConfigNode(config, nodes, connections);
    expect(result).toEqual({
      image: '/api/files/img/out.png',
      images: ['/api/files/img/out.png'],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.prompt).toBe('一只猫 戴帽子');
  });

  it('text 模式：调默认文本模型生成文案', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/model-configs') {
        return new Response(
          JSON.stringify({
            models: [
              {
                id: 'model-1',
                isActive: true,
                isDefault: true,
                capabilities: { jsonMode: true },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === '/api/ai/optimize-prompt') {
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"生成"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"的文案"}}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const config = makeConfigNode({
      metadata: { mode: 'text', composerContent: '写一段文案' },
    });
    const result = await executeConfigNode(config, [config], []);
    expect(result).toEqual({ text: '生成的文案' });
  });
});

// ---------- generatePlanImage ----------

describe('generatePlanImage', () => {
  it('无参考图走文生图', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/text-to-image') return imageResponse('img/plan.png');
      throw new Error(`unexpected fetch: ${url}`);
    });
    const url = await generatePlanImage({ prompt: '槽位提示词' });
    expect(url).toBe('/api/files/img/plan.png');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/text-to-image');
  });

  it('带参考图走图生图并传 strength', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/image-to-image') return imageResponse('img/plan2.png');
      throw new Error(`unexpected fetch: ${url}`);
    });
    const url = await generatePlanImage({
      prompt: '改风格',
      referenceUrl: 'data:image/png;base64,xyz',
      strength: 0.5,
    });
    expect(url).toBe('/api/files/img/plan2.png');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.params.image).toBe('data:image/png;base64,xyz');
    expect(body.params.strength).toBe(0.5);
  });

  it('生成失败时抛出服务端错误信息', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response(JSON.stringify({ success: false, error: '中转站不可用' }), {
        status: 502,
      });
    });
    await expect(generatePlanImage({ prompt: 'x' })).rejects.toThrow('中转站不可用');
  });
});
