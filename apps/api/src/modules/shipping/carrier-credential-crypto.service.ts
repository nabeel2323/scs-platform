import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';

/**
 * CarrierCredentialCryptoService — AES-256-GCM encryption for carrier secrets.
 *
 * Carrier API keys, account numbers, and webhook secrets are encrypted at rest
 * using a master key from the CARRIER_CREDENTIALS_MASTER_KEY environment
 * variable.  The encrypted payload is stored as a hex string containing:
 *
 *   iv (12 bytes) + authTag (16 bytes) + ciphertext
 *
 * All three components are concatenated so a single TEXT column suffices.
 *
 * SECURITY INVARIANTS:
 *   - Plaintext credentials NEVER appear in API responses.
 *   - Plaintext credentials NEVER appear in log output.
 *   - Plaintext credentials NEVER appear in shipment/order metadata.
 *   - Decryption only happens inside the backend process boundary.
 *   - The service fails fast if the master key is missing or invalid.
 */
@Injectable()
export class CarrierCredentialCryptoService {
  private readonly logger = new Logger(CarrierCredentialCryptoService.name);
  private readonly masterKey: Buffer;

  /** AES-256-GCM initialization vector length (96 bits). */
  private static readonly IV_LENGTH = 12;

  /** AES-256-GCM authentication tag length (128 bits). */
  private static readonly AUTH_TAG_LENGTH = 16;

  /** Algorithm identifier stored alongside ciphertext for future-proofing. */
  private static readonly ALGORITHM = 'aes-256-gcm';

  constructor() {
    const rawKey = process.env['CARRIER_CREDENTIALS_MASTER_KEY'];

    if (!rawKey) {
      // Fail fast: the application cannot safely handle carrier credentials
      // without a configured master key.  We throw at construction time so the
      // NestJS bootstrap fails loudly rather than at first credential access.
      throw new Error(
        'CARRIER_CREDENTIALS_MASTER_KEY is required. ' +
        'Generate a 32-byte hex key: openssl rand -hex 32',
      );
    }

    // The master key must be a 64-character hex string (32 bytes).
    if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new Error(
        'CARRIER_CREDENTIALS_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
        `Received ${rawKey.length} characters.`,
      );
    }

    this.masterKey = Buffer.from(rawKey, 'hex');
    this.logger.log('Carrier credential encryption initialised (AES-256-GCM).');
  }

  /**
   * Encrypt a plaintext string (typically a JSON-serialised credential blob).
   *
   * @returns Hex-encoded string: iv + authTag + ciphertext.
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(CarrierCredentialCryptoService.IV_LENGTH);

    const cipher = crypto.createCipheriv(
      CarrierCredentialCryptoService.ALGORITHM,
      this.masterKey,
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Concatenate iv + authTag + ciphertext into a single hex blob.
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('hex');
  }

  /**
   * Decrypt a hex-encoded ciphertext blob produced by {@link encrypt}.
   *
   * @throws Error if the ciphertext is malformed or the authentication tag
   *         does not match (tampered data or wrong key).
   */
  decrypt(hexCiphertext: string): string {
    const combined = Buffer.from(hexCiphertext, 'hex');

    const minLen =
      CarrierCredentialCryptoService.IV_LENGTH +
      CarrierCredentialCryptoService.AUTH_TAG_LENGTH +
      1; // at least 1 byte of ciphertext

    if (combined.length < minLen) {
      throw new Error('Carrier credential ciphertext is too short (malformed or truncated).');
    }

    const iv = combined.subarray(
      0,
      CarrierCredentialCryptoService.IV_LENGTH,
    );
    const authTag = combined.subarray(
      CarrierCredentialCryptoService.IV_LENGTH,
      CarrierCredentialCryptoService.IV_LENGTH + CarrierCredentialCryptoService.AUTH_TAG_LENGTH,
    );
    const ciphertext = combined.subarray(
      CarrierCredentialCryptoService.IV_LENGTH + CarrierCredentialCryptoService.AUTH_TAG_LENGTH,
    );

    const decipher = crypto.createDecipheriv(
      CarrierCredentialCryptoService.ALGORITHM,
      this.masterKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Encrypt an optional value.  Returns null if the input is null/undefined.
   */
  encryptOptional(plaintext: string | null | undefined): string | null {
    if (plaintext == null) return null;
    return this.encrypt(plaintext);
  }

  /**
   * Decrypt an optional value.  Returns null if the input is null/undefined.
   */
  decryptOptional(hexCiphertext: string | null | undefined): string | null {
    if (hexCiphertext == null) return null;
    return this.decrypt(hexCiphertext);
  }
}
