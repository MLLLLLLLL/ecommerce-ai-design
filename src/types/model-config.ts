export interface ModelCapabilities {
  vision: boolean;
  jsonMode: boolean;
  ocr: boolean;
  imageGeneration: boolean;
}

export interface ModelConfigSummary {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
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
}

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  vision: false,
  jsonMode: true,
  ocr: false,
  imageGeneration: false,
};

export function inferModelCapabilities(model: string): ModelCapabilities {
  const normalized = model.toLowerCase();
  const imageGeneration = /(?:^|[-_])(?:gpt-image|dall-e|seedream|flux|sora|veo|kling|wan)(?:[-_]|\d|$)/.test(normalized);
  const vision = !imageGeneration && /(gpt-4o|gpt-4\.1|gpt-5|claude|gemini|qwen.*vl|qwen-vl|vision)/.test(normalized);

  return {
    vision,
    jsonMode: !imageGeneration,
    ocr: vision,
    imageGeneration,
  };
}
