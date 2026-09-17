import { createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";

import type { EncryptionOperation, IEncryptionService } from "@/app/api-services/interfaces/i-encryption.service";
import { ConfigurationError } from "@/app/api-services/exceptions";

const DERIVE_SALT = Buffer.from([
  0x49, 0x76, 0x61, 0x6e, 0x20, 0x4d, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76,
]);

const PBKDF2_ITERATIONS = 1000;
const KEY_BYTES = 32;
const IV_BYTES = 16;
const ALGORITHM = "aes-256-cbc";

type DerivedKeyMaterial = {
  key: Buffer;
  iv: Buffer;
};

/**
 * Legacy-compatible AES encrypt/decrypt (PBKDF2 SHA-1 + AES-256-CBC + UTF-16LE).
 * Key is taken only from `AES_LEGACY_PASSWORD` in `.env`.
 */
export class EncryptionService implements IEncryptionService {
  constructor(private readonly password: string) {
    if (!this.password.trim()) {
      throw new ConfigurationError("AES_LEGACY_PASSWORD is not configured in .env");
    }
  }

  encrypt(plainText: string): string {
    const { key, iv } = this.deriveKeyAndIv();
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plain = Buffer.from(plainText, "utf16le");
    return Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
  }

  decrypt(cipherText: string): string {
    const { key, iv } = this.deriveKeyAndIv();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    const cipherBytes = Buffer.from(cipherText.replace(/ /g, "+"), "base64");
    return Buffer.concat([decipher.update(cipherBytes), decipher.final()]).toString("utf16le");
  }

  encryptionDecryption(type: EncryptionOperation, data: string): string | null {
    try {
      return type === "E" ? this.encrypt(data) : this.decrypt(data);
    } catch {
      return null;
    }
  }

  encryptObject(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptObject<T>(cipherText: string): T {
    return JSON.parse(this.decrypt(cipherText)) as T;
  }

  private deriveKeyAndIv(): DerivedKeyMaterial {
    const derived = pbkdf2Sync(
      this.password,
      DERIVE_SALT,
      PBKDF2_ITERATIONS,
      KEY_BYTES + IV_BYTES,
      "sha1",
    );
    return {
      key: derived.subarray(0, KEY_BYTES),
      iv: derived.subarray(KEY_BYTES, KEY_BYTES + IV_BYTES),
    };
  }
}
