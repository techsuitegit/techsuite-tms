import { decode, type JwtPayload } from "jsonwebtoken";

import { UnauthorizedError } from "@/app/api-services/exceptions";
import type { ITokenVerifier } from "@/app/api-services/interfaces/i-authorization.service";

export function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError("Bearer token is required");
  }
  return token;
}

export function readBearerClaims(request: Request): JwtPayload {
  const token = readBearerToken(request);
  const claims = decode(token);
  if (!claims || typeof claims === "string") {
    throw new UnauthorizedError("Invalid access token");
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
    throw new UnauthorizedError("Access token expired");
  }
  return claims;
}

export class BearerTokenVerifier implements ITokenVerifier {
  requireBearer(request: Request): void {
    readBearerClaims(request);
  }
}
