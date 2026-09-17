export type EncryptionOperation = "E" | "D";

export interface IEncryptionService {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
  encryptionDecryption(type: EncryptionOperation, data: string): string | null;
  encryptObject(value: unknown): string;
  decryptObject<T>(cipherText: string): T;
}
