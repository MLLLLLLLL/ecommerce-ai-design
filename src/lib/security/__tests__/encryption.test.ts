import { encryptApiKey, decryptApiKey, testEncryption } from '../encryption';

describe('Encryption', () => {
  describe('encryptApiKey', () => {
    it('should encrypt API key', () => {
      const apiKey = 'sk-test-key-12345';
      const encrypted = encryptApiKey(apiKey);

      expect(encrypted).toBeTruthy();
      expect(encrypted).toContain(':');
      expect(encrypted.split(':').length).toBe(3);
    });

    it('should produce different ciphertext each time', () => {
      const apiKey = 'sk-test-key-12345';
      const encrypted1 = encryptApiKey(apiKey);
      const encrypted2 = encryptApiKey(apiKey);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptApiKey', () => {
    it('should decrypt API key correctly', () => {
      const apiKey = 'sk-test-key-12345';
      const encrypted = encryptApiKey(apiKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(apiKey);
    });

    it('should handle special characters', () => {
      const apiKey = 'sk-test!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptApiKey(apiKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(apiKey);
    });

    it('should throw error for invalid format', () => {
      expect(() => decryptApiKey('invalid-format')).toThrow();
    });

    it('should throw error for tampered data', () => {
      const apiKey = 'sk-test-key-12345';
      const encrypted = encryptApiKey(apiKey);
      const tampered = encrypted.replace('a', 'b');

      expect(() => decryptApiKey(tampered)).toThrow();
    });
  });

  describe('testEncryption', () => {
    it('should return true for working encryption', () => {
      const result = testEncryption();
      expect(result).toBe(true);
    });
  });
});
