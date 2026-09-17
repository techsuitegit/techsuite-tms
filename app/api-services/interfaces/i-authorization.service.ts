export interface ITokenVerifier {
  requireBearer(request: Request): void;
}
