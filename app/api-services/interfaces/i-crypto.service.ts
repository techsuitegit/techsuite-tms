export type CryptoEncryptResult = {
  cipher: string;
};

export type CryptoDecryptResult = {
  plain: string | Record<string, unknown> | unknown[];
};

export interface ICryptoService {
  encrypt(request: Request, body: Record<string, unknown>): Promise<CryptoEncryptResult>;
  decrypt(request: Request, body: Record<string, unknown>): Promise<CryptoDecryptResult>;
}
