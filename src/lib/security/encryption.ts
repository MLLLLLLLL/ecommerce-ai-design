import CryptoJS from 'crypto-js';

// 该模块同时运行在浏览器与服务端（配置Store在客户端加解密API Key），
// 因此密钥通过 NEXT_PUBLIC_ 前缀暴露给客户端，服务端回退读取 ENCRYPTION_SECRET。
const SECRET =
  process.env.NEXT_PUBLIC_ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET;

// 验证密钥
if (!SECRET) {
  throw new Error('ENCRYPTION_SECRET environment variable is required');
}

if (SECRET.length !== 64) {
  throw new Error('ENCRYPTION_SECRET must be 32 bytes (64 hex characters)');
}

const KEY = CryptoJS.enc.Hex.parse(SECRET);

/**
 * 加密API Key
 * 采用 AES-256-CBC + HMAC-SHA256（encrypt-then-MAC）
 * @param apiKey 原始API Key
 * @returns 加密后的字符串 (格式: iv:authTag:encrypted)
 */
export function encryptApiKey(apiKey: string): string {
  try {
    // 生成随机IV
    const iv = CryptoJS.lib.WordArray.random(16);
    const ivHex = iv.toString(CryptoJS.enc.Hex);

    // 加密
    const encrypted = CryptoJS.AES.encrypt(apiKey, KEY, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const cipherHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);

    // 计算认证标签（HMAC-SHA256）
    const authTag = CryptoJS.HmacSHA256(ivHex + cipherHex, KEY).toString(
      CryptoJS.enc.Hex
    );

    // 返回格式: iv:authTag:encrypted
    return `${ivHex}:${authTag}:${cipherHex}`;
  } catch (error) {
    console.error('[Encryption] Failed to encrypt API key:', error);
    throw new Error('Failed to encrypt API key');
  }
}

/**
 * 解密API Key
 * @param encrypted 加密的字符串 (格式: iv:authTag:encrypted)
 * @returns 原始API Key
 */
export function decryptApiKey(encrypted: string): string {
  try {
    // 分割加密数据
    const parts = encrypted.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, cipherHex] = parts;

    // 校验认证标签
    const expectedTag = CryptoJS.HmacSHA256(ivHex + cipherHex, KEY).toString(
      CryptoJS.enc.Hex
    );
    if (expectedTag !== authTagHex) {
      throw new Error('Invalid encrypted format');
    }

    // 解密
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Hex.parse(cipherHex),
    });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, KEY, {
      iv: CryptoJS.enc.Hex.parse(ivHex),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('[Encryption] Failed to decrypt API key:', error);
    throw new Error('Failed to decrypt API key');
  }
}

/**
 * 测试加密解密是否正常工作
 */
export function testEncryption(): boolean {
  try {
    const testKey = 'test-api-key-12345';
    const encrypted = encryptApiKey(testKey);
    const decrypted = decryptApiKey(encrypted);
    return decrypted === testKey;
  } catch {
    return false;
  }
}
