import { describe, expect, it } from 'vitest';
import {
  GeoEngine,
  findBannedContentViolations,
  findClaimKeyViolations,
  findGeoFactLeaks,
} from '@/lib/marketing/geo-engine';
import { MockTextCompletionClient } from '@/lib/ai/testing/mock-model-client';
import type { GeoResult, MarketingFact } from '@/types/marketing-contract';

function makeGeoResult(overrides: Partial<GeoResult> = {}): GeoResult {
  return {
    question: '什么保温杯保温效果好？',
    directAnswer: '采用 316 不锈钢与真空隔热设计的保温杯保温效果较好。',
    supportingContent: '真空层减少热传导，杯盖密封结构降低热量散失。',
    faq: [{ question: '如何清洁？', answer: '使用中性清洁剂清洗。' }],
    claims: [{ text: '采用 316 不锈钢', factKey: 'material' }],
    pendingFacts: [],
    ...overrides,
  };
}

function makeFacts(): MarketingFact[] {
  return [
    { key: 'material', value: '316 不锈钢', status: 'confirmed', sourceType: 'user' },
    { key: 'capacity', value: '500ml', status: 'confirmed', sourceType: 'user' },
  ];
}

describe('GeoEngine', () => {
  it('成功生成（事实引用合法、无违规）', async () => {
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(makeGeoResult()) });
    const engine = new GeoEngine(client);
    const result = await engine.generate({
      question: '什么保温杯保温效果好？',
      brandName: 'XX 保温杯',
      language: 'zh-CN',
      facts: makeFacts(),
    });
    expect(result.directAnswer).toContain('316 不锈钢');
    expect(result.claims[0].factKey).toBe('material');
  });

  it('来源列表/引用编号/已核实/实时性文案触发修复并成功', async () => {
    const violating = makeGeoResult({
      supportingContent: '据来源：某评测机构显示…参考[1]。',
    });
    const client = new MockTextCompletionClient();
    client.setScenarioQueue([
      { kind: 'success', content: JSON.stringify(violating) },
      { kind: 'success', content: JSON.stringify(makeGeoResult()) },
    ]);
    const engine = new GeoEngine(client);
    const result = await engine.generate({
      question: '什么保温杯保温效果好？',
      brandName: 'XX 保温杯',
      language: 'zh-CN',
      facts: makeFacts(),
    });
    expect(client.callCount).toBe(2);
    expect(result.supportingContent).not.toContain('来源');
  });

  it('修复后仍违规：schema_mismatch 拦截', async () => {
    const violating = makeGeoResult({
      directAnswer: '已核实：本产品保温效果最佳，来源：官方数据。',
    });
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(violating) });
    const engine = new GeoEngine(client);
    try {
      await engine.generate({
        question: '什么保温杯保温效果好？',
        brandName: 'XX 保温杯',
        language: 'zh-CN',
        facts: makeFacts(),
      });
      expect.unreachable('应当抛出 schema_mismatch');
    } catch (error) {
      expect(error).toMatchObject({ kind: 'schema_mismatch', retryable: false });
    }
    expect(client.callCount).toBe(2);
  });

  it('claim factKey 引用不存在的事实被拦截', async () => {
    const violating = makeGeoResult({
      claims: [{ text: '获得行业大奖', factKey: 'award' }],
    });
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(violating) });
    const engine = new GeoEngine(client);
    await expect(
      engine.generate({
        question: 'q',
        brandName: 'b',
        language: 'zh-CN',
        facts: makeFacts(),
      })
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });
  });

  it('pendingFacts 泄漏进可发布内容被拦截', async () => {
    const violating = makeGeoResult({
      directAnswer: '本产品荣获 2025 年度最佳设计大奖。',
      pendingFacts: [
        { key: 'award', value: '2025 年度最佳设计大奖', status: 'pending', sourceType: 'model' },
      ],
    });
    const client = new MockTextCompletionClient();
    client.setScenario({ kind: 'success', content: JSON.stringify(violating) });
    const engine = new GeoEngine(client);
    await expect(
      engine.generate({ question: 'q', brandName: 'b', language: 'zh-CN', facts: makeFacts() })
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });
  });
});

describe('GEO 离线铁律校验函数', () => {
  it('检测来源列表、引用编号、已核实、实时性文案', () => {
    const result = makeGeoResult({
      supportingContent: '据来源：某报告。参考[1]。已核实。最新数据显示。截至2025年。',
    });
    const violations = findBannedContentViolations(result);
    const labels = violations.map((violation) => violation.label);
    expect(labels).toContain('来源列表');
    expect(labels).toContain('引用编号');
    expect(labels).toContain('已核实标识');
    expect(labels).toContain('实时性文案');
  });

  it('无违规时返回空数组', () => {
    expect(findBannedContentViolations(makeGeoResult())).toEqual([]);
  });

  it('claim key 校验：引用不存在的事实 key', () => {
    const result = makeGeoResult({
      claims: [
        { text: 'a', factKey: 'material' },
        { text: 'b', factKey: 'unknown-key' },
      ],
    });
    expect(findClaimKeyViolations(result, new Set(['material']))).toEqual(['unknown-key']);
  });

  it('pendingFacts 泄漏检测', () => {
    const result = makeGeoResult({
      supportingContent: '本产品销量第一。',
      pendingFacts: [
        { key: 'sales', value: '销量第一', status: 'pending', sourceType: 'model' },
      ],
    });
    expect(findGeoFactLeaks(result)).toEqual(['销量第一']);
  });
});
