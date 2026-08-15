export interface ModelCapabilities {
  vision: boolean;
  jsonMode: boolean;
  ocr: boolean;
  imageGeneration: boolean;
  /** 可对已有图片进行编辑或图生图（V2 5.1），不能由 imageGeneration 推断。 */
  imageEditing: boolean;
  /** 供应商能稳定接收参考图（V2 5.1），不能由其它能力推断。 */
  referenceImage: boolean;
}

export type ModelCapabilityKey = keyof ModelCapabilities;

export const TEXT_MODEL_API_PROTOCOLS = ['chat_completions', 'responses'] as const;

export type TextModelApiProtocol = (typeof TEXT_MODEL_API_PROTOCOLS)[number];

export interface ModelConfigSummary {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
  apiProtocol: TextModelApiProtocol;
  capabilities: ModelCapabilities;
  isActive: boolean;
  isDefault: boolean;
  apiKeyConfigured: boolean;
  lastTestedAt?: string | null;
  testStatus?: string | null;
  testedCapabilities?: TestedCapabilities | null;
  testError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestedCapabilities {
  connection: boolean;
  jsonMode: boolean;
  vision: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  referenceImage: boolean;
}

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  vision: false,
  jsonMode: true,
  ocr: false,
  imageGeneration: false,
  imageEditing: false,
  referenceImage: false,
};

export function inferModelCapabilities(model: string): ModelCapabilities {
  const normalized = model.toLowerCase();
  const imageGeneration = /(?:^|[-_])(?:gpt-image|dall-e|seedream|flux|sora|veo|kling|wan)(?:[-_]|\d|$)/.test(normalized);
  const imageEditing = imageGeneration && /(gpt-image|dall-e|seedream|flux|kling|wan)/.test(normalized);
  const vision = !imageGeneration && /(gpt-4o|gpt-4\.1|gpt-5|claude|gemini|qwen.*vl|qwen-vl|vision)/.test(normalized);

  return {
    vision,
    jsonMode: !imageGeneration,
    ocr: vision,
    imageGeneration,
    imageEditing,
    referenceImage: imageEditing,
  };
}
