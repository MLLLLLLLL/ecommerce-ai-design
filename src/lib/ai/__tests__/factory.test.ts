import { createAIService, validateConfig } from '../factory';
import { AIServiceConfig } from '@/types/ai';
import { OpenAIAdapter } from '../adapters/openai';
import { AlibabaAdapter } from '../adapters/alibaba';
import { RelayAdapter } from '../adapters/relay';

describe('AI Service Factory', () => {
  describe('createAIService', () => {
    it('should create OpenAI adapter', () => {
      const config: AIServiceConfig = {
        id: 'test-1',
        provider: 'openai',
        name: 'OpenAI Test',
        apiKey: 'sk-test-key',
        maxConcurrent: 50,
      };

      const adapter = createAIService(config);
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it('should create Alibaba adapter', () => {
      const config: AIServiceConfig = {
        id: 'test-2',
        provider: 'alibaba',
        name: 'Alibaba Test',
        apiKey: 'test-key',
        maxConcurrent: 50,
      };

      const adapter = createAIService(config);
      expect(adapter).toBeInstanceOf(AlibabaAdapter);
    });

    it('should create Relay adapter', () => {
      const config: AIServiceConfig = {
        id: 'test-3',
        provider: 'relay',
        name: 'Relay Test',
        apiKey: 'test-key',
        baseURL: 'https://api.example.com',
        relayType: 'openai',
        maxConcurrent: 50,
      };

      const adapter = createAIService(config);
      expect(adapter).toBeInstanceOf(RelayAdapter);
    });

    it('should throw error for unknown provider', () => {
      const config = {
        id: 'test-4',
        provider: 'unknown',
        name: 'Unknown Test',
        apiKey: 'test-key',
      } as any;

      expect(() => createAIService(config)).toThrow('Unknown provider');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const config: Partial<AIServiceConfig> = {
        provider: 'openai',
        name: 'Test Service',
        apiKey: 'sk-test-key',
        maxConcurrent: 50,
      };

      const errors = validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing provider', () => {
      const config: Partial<AIServiceConfig> = {
        name: 'Test Service',
        apiKey: 'sk-test-key',
      };

      const errors = validateConfig(config);
      expect(errors).toContain('Provider is required');
    });

    it('should return error for missing name', () => {
      const config: Partial<AIServiceConfig> = {
        provider: 'openai',
        apiKey: 'sk-test-key',
      };

      const errors = validateConfig(config);
      expect(errors).toContain('Name is required');
    });

    it('should return error for missing apiKey', () => {
      const config: Partial<AIServiceConfig> = {
        provider: 'openai',
        name: 'Test Service',
      };

      const errors = validateConfig(config);
      expect(errors).toContain('API Key is required');
    });

    it('should return error for relay without baseURL', () => {
      const config: Partial<AIServiceConfig> = {
        provider: 'relay',
        name: 'Relay Test',
        apiKey: 'test-key',
      };

      const errors = validateConfig(config);
      expect(errors).toContain('Base URL is required for relay provider');
    });

    it('should return error for invalid maxConcurrent', () => {
      const config: Partial<AIServiceConfig> = {
        provider: 'openai',
        name: 'Test Service',
        apiKey: 'sk-test-key',
        maxConcurrent: 150,
      };

      const errors = validateConfig(config);
      expect(errors).toContain('Max concurrent must be between 1 and 100');
    });

    it('should return multiple errors', () => {
      const config: Partial<AIServiceConfig> = {};

      const errors = validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Provider is required');
      expect(errors).toContain('Name is required');
      expect(errors).toContain('API Key is required');
    });
  });
});
