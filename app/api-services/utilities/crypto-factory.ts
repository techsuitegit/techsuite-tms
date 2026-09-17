import { CryptoService } from "@/app/api-services/utilities/crypto.service";
import { BearerTokenVerifier } from "@/app/api-services/utilities/bearer-token-verifier";
import { EncryptionService } from "@/app/api-services/utilities/encryption.service";

export function createCryptoService() {
  return new CryptoService(
    new EncryptionService(process.env.AES_LEGACY_PASSWORD ?? ""),
    new BearerTokenVerifier(),
  );
}
