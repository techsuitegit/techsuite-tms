import type { JwtPayload } from "jsonwebtoken";

import { MdmError } from "../errors/mdm-error";

export type MdmPermission = "mdm.master.read" | "mdm.master.write" | "mdm.master.approve";

export function requirePermission(claims: JwtPayload, permission: MdmPermission) {
  const listed = readPermissions(claims);
  if (listed.length === 0) return;
  if (!listed.includes(permission) && !listed.includes("*")) {
    throw new MdmError("FORBIDDEN", "You do not have permission for this action", 403);
  }
}

function readPermissions(claims: JwtPayload): string[] {
  const raw = claims.permissions ?? claims.permission ?? claims.roles ?? claims.role;
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return [];
}
