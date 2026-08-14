import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitPrompt, fetchDefaultTextModelId } from '@/lib/canvas/nodes/split-prompt';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('splitPrompt', () => {
  it('成功时返回拆分的提示词数组', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, prompts: ['子提示词1', '子提示词2'] }),
        { status: 200 }
      )
    );

    const prompts = await splitPrompt('model-1', '总提示词', 2);
    expect(prompts).toEqual(['子提示词1', '子提示词2']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/split-prompt');
    expect(JSON.parse(init.body)).toEqual({
      modelId: 'model-1',
      prompt: '总提示词',
      count: 2,
    });
  });

  it('trim 并过滤空字符串', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, prompts: ['  a  ', '', '  b  '] }),
        { status: 200 }
      )
    );
    const prompts = await splitPrompt('m', 'p', 3);
    expect(prompts).toEqual(['a', 'b']);
  });

  it('服务端错误时抛出错误信息', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: '模型不可用' }), {
        status: 502,
      })
    );
    await expect(splitPrompt('m', 'p', 2)).rejects.toThrow('模型不可用');
  });

  it('返回空数组时抛出错误', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, prompts: [] }), { status: 200 })
    );
    await expect(splitPrompt('m', 'p', 2)).rejects.toThrow('未返回有效的拆分结果');
  });
});

describe('fetchDefaultTextModelId', () => {
  it('优先取默认+激活+jsonMode 模型', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { id: 'a', isActive: false, isDefault: false, capabilities: { jsonMode: true } },
            { id: 'b', isActive: true, isDefault: true, capabilities: { jsonMode: true } },
          ],
        }),
        { status: 200 }
      )
    );
    expect(await fetchDefaultTextModelId()).toBe('b');
  });

  it('无默认模型时回退到激活模型', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { id: 'a', isActive: true, isDefault: false, capabilities: { jsonMode: false } },
            { id: 'c', isActive: true, isDefault: false, capabilities: { jsonMode: true } },
          ],
        }),
        { status: 200 }
      )
    );
    expect(await fetchDefaultTextModelId()).toBe('c');
  });

  it('请求失败时返回 null', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect(await fetchDefaultTextModelId()).toBeNull();
  });
});
