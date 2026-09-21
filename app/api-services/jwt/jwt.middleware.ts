import { decode, type JwtPayload } from "jsonwebtoken";
import type { IncomingMessage } from "node:http";

import { MdmError } from "../errors/mdm-error";

export type AuthedRequest = IncomingMessage & {
  claims: JwtPayload;
  actor: string;
};

export class JwtMiddleware {
  verify(req: IncomingMessage): JwtPayload {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new MdmError("UNAUTHORIZED", "Bearer token is required", 401);
    }

    const claims = decode(token);
    if (!claims || typeof claims === "string") {
      throw new MdmError("UNAUTHORIZED", "Invalid access token", 401);
    }
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
      throw new MdmError("UNAUTHORIZED", "Access token expired", 401);
    }
    return claims;
  }

  actorFromClaims(claims: JwtPayload) {
    const keys = ["login", "email", "preferred_username", "unique_name", "sub"];
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "unknown";
  }

  attach(req: IncomingMessage): AuthedRequest {
    const claims = this.verify(req);
    const authed = req as AuthedRequest;
    authed.claims = claims;
    authed.actor = this.actorFromClaims(claims);
    return authed;
  }
}
