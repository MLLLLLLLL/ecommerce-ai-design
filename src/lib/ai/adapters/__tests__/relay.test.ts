import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayAdapter } from '../relay';

const config = {
  id: 'toapis-test',
  provider: 'relay' as const,
  relayType: 'toapis' as const,
  name: 'ToAPIs',
  apiKey: 'sk-test',
  baseURL: 'https://toapis.com/v1',
  model: 'gpt-image-2',
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RelayAdapter ToAPIs protocol', () => {
  afterEach(() => vi.restoreAllMocks());

  it('submits ratio/resolution and polls the async task result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1', object: 'generation.task', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'task_1',
        object: 'generation.task',
        status: 'completed',
        result: { type: 'image', data: [{ url: 'https://files.toapis.com/generated/1.png' }] },
      }));

    const urls = await new RelayAdapter(config).textToImage({
      prompt: '商品主图',
      width: 1024,
      height: 576,
      samples: 1,
    });

    expect(urls).toEqual(['https://files.toapis.com/generated/1.png']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: 'gpt-image-2',
      prompt: '商品主图',
      n: 1,
      size: '16:9',
      resolution: '1k',
      response_format: 'url',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://toapis.com/v1/images/generations/task_1');
  });

  it('uploads base64 references before creating an image task', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { url: 'https://files.toapis.com/uploads/source.png' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'task_2', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'task_2',
        status: 'completed',
        result: { data: [{ url: 'https://files.toapis.com/generated/2.png' }] },
      }));

    const urls = await new RelayAdapter(config).imageToImage({
      image: 'data:image/png;base64,aGVsbG8=',
      prompt: '保持商品外观',
      width: 1024,
      height: 1024,
      samples: 1,
    });

    expect(urls).toEqual(['https://files.toapis.com/generated/2.png']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://toapis.com/v1/uploads/images');
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.reference_images).toEqual(['https://files.toapis.com/uploads/source.png']);
    expect(request).not.toHaveProperty('image');
  });

  it.each([
    ['gemini-2.5-flash-image-preview', '1K'],
    ['doubao-seedream-5-0-pro', '2K'],
    ['gemini-3.1-flash-image-preview', '2K'],
  ])('uses the model-specific ToAPIs payload for %s', async (model, resolution) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'task_model', object: 'generation.task', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'task_model',
        status: 'completed',
        result: { data: [{ url: 'https://files.toapis.com/generated/model.png' }] },
      }));

    const urls = await new RelayAdapter({ ...config, model }).textToImage({
      prompt: '模型兼容性测试',
      width: 2048,
      height: 2048,
      samples: 1,
    });

    expect(urls).toEqual(['https://files.toapis.com/generated/model.png']);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model,
      size: '1:1',
      metadata: { resolution },
    });
    expect(request).not.toHaveProperty('resolution');
  });
});
