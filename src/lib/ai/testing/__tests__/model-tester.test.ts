import { describe, expect, it } from 'vitest';
import { runModelTests, testConnection, testJsonMode, testVision } from '@/lib/ai/model-tester';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';

describe('模型能力实测（V3 5.2）', () => {
  it('connection：正常响应通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: 'pong' });
    const result = await testConnection(client);
    expect(result.passed).toBe(true);
  });

  it('connection：上游失败不通过且摘要脱敏', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'rate-limited' });
    const result = await testConnection(client);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('rate_limited');
  });

  it('jsonMode：合法 JSON 且 Schema 匹配通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"test":"ok","value":42}' });
    const result = await testJsonMode(client);
    expect(result.passed).toBe(true);
  });

  it('jsonMode：无效 JSON 不通过', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'invalid-json' });
    const result = await testJsonMode(client);
    expect(result.passed).toBe(false);
  });

  it('jsonMode：Schema 不匹配不通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: '{"test":"no","value":"42"}' });
    const result = await testJsonMode(client);
    expect(result.passed).toBe(false);
  });

  it('vision：五色回答及常见色系名称均通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: 'crimson, azure, emerald, gold, violet' });
    const result = await testVision(client);
    expect(result.passed).toBe(true);
  });

  it('vision：五色齐全但顺序不同也通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: 'red, green, yellow, blue, purple' });
    const result = await testVision(client);
    expect(result.passed).toBe(true);
  });

  it('vision：缺少颜色不通过', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: 'red, blue, green, yellow' });
    const result = await testVision(client);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('五色识别不完整');
  });

  it('runModelTests：全部通过 -> passed', async () => {
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: 'pong' },
      { kind: 'success', content: '{"test":"ok","value":1}' },
      { kind: 'success', content: 'red, blue, green, yellow, purple' },
    ]);
    const { report, status } = await runModelTests(client);
    expect(report.connection.passed).toBe(true);
    expect(report.jsonMode.passed).toBe(true);
    expect(report.vision.passed).toBe(true);
    expect(status).toBe('passed');
  });

  it('runModelTests：部分通过 -> partial', async () => {
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: 'pong' },
      { kind: 'invalid-json' },
      { kind: 'rate-limited' },
    ]);
    const { status } = await runModelTests(client);
    expect(status).toBe('partial');
  });

  it('runModelTests：全部失败 -> failed', async () => {
    const client = new MockTextCompletionClient().setScenario({ kind: 'timeout' });
    const { status } = await runModelTests(client);
    expect(status).toBe('failed');
  });
});
