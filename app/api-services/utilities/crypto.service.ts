import { ValidationError } from "@/app/api-services/exceptions";
import type { ITokenVerifier } from "@/app/api-services/interfaces/i-authorization.service";
import type {
  CryptoDecryptResult,
  CryptoEncryptResult,
  ICryptoService,
} from "@/app/api-services/interfaces/i-crypto.service";
import type { IEncryptionService } from "@/app/api-services/interfaces/i-encryption.service";

/**
 * Encrypt / decrypt payloads using AES_LEGACY_PASSWORD.
 * Requires a valid Identity access Bearer token; does not log plaintext or cipher text.
 */
export class CryptoService implements ICryptoService {
  constructor(
    private readonly encryption: IEncryptionService,
    private readonly tokens: ITokenVerifier,
  ) {}

  async encrypt(request: Request, body: Record<string, unknown>): Promise<CryptoEncryptResult> {
    this.tokens.requireBearer(request);
    const payload = this.requireData(body);

    if (typeof payload === "string") {
      return { cipher: this.encryption.encrypt(payload) };
    }

    return { cipher: this.encryption.encryptObject(payload) };
  }

  async decrypt(request: Request, body: Record<string, unknown>): Promise<CryptoDecryptResult> {
    this.tokens.requireBearer(request);
    const cipherText = this.requireCipherText(body);

    const plain = this.encryption.encryptionDecryption("D", cipherText);
    if (plain == null) {
      throw new ValidationError("Unable to decrypt the given data");
    }

    try {
      const parsed: unknown = JSON.parse(plain);
      if (parsed !== null && typeof parsed === "object") {
        return { plain: parsed as Record<string, unknown> | unknown[] };
      }
    } catch {
      // plaintext string
    }

    return { plain };
  }

  private requireData(body: Record<string, unknown>): string | Record<string, unknown> | unknown[] {
    if (!("data" in body)) {
      throw new ValidationError("data is required");
    }
    const value = body.data;
    if (typeof value === "string") {
      if (!value.trim()) throw new ValidationError("data must not be empty");
      return value;
    }
    if (value !== null && typeof value === "object") {
      return value as Record<string, unknown> | unknown[];
    }
    throw new ValidationError("data must be a string or a JSON object/array");
  }

  private requireCipherText(body: Record<string, unknown>): string {
    if (!("data" in body)) {
      throw new ValidationError("data is required");
    }
    const value = body.data;
    if (typeof value !== "string" || !value.trim()) {
      throw new ValidationError("data must be a non-empty cipher string");
    }
    return value.trim();
  }
}
