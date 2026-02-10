import crypto from 'crypto';

// Get encryption key from environment or generate a warning
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn('WARNING: ENCRYPTION_KEY not set. API keys will be stored in plain text!');
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * Derive a key from the encryption key string using PBKDF2
 */
function deriveKey(keyString: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(keyString, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt an API key
 * @param text - The plaintext API key
 * @returns A string containing salt:iv:tag:encrypted (hex encoded)
 */
export function encryptApiKey(text: string): string {
  if (!ENCRYPTION_KEY) {
    // If no encryption key, return base64 encoded (obfuscated but not encrypted)
    return Buffer.from(text).toString('base64');
  }

  // Generate a random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive the key
  const key = deriveKey(ENCRYPTION_KEY, salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const tag = cipher.getAuthTag();

  // Return salt:iv:tag:encrypted
  return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an API key
 * @param encryptedText - The encrypted string (salt:iv:tag:encrypted or base64)
 * @returns The plaintext API key
 */
export function decryptApiKey(encryptedText: string): string {
  if (!ENCRYPTION_KEY) {
    // If no encryption key, treat as base64
    try {
      return Buffer.from(encryptedText, 'base64').toString('utf8');
    } catch {
      return encryptedText; // Return as-is if not base64
    }
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted text format');
  }

  const [saltHex, ivHex, tagHex, encrypted] = parts;

  // Convert from hex
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  // Derive the key
  const key = deriveKey(ENCRYPTION_KEY, salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a secure random encryption key
 * @returns A hex-encoded random key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validate if a string is properly encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!ENCRYPTION_KEY) return false;
  const parts = text.split(':');
  return parts.length === 4;
}
