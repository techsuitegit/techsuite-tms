import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import { attachJwt } from "../middleware/jwt.middleware";
import { requirePermission, type MdmPermission } from "../middleware/rbac.middleware";
import { sendError } from "./io";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  url: URL,
) => Promise<void>;

export type Route = {
  method: string;
  match: (path: string) => Record<string, string> | null;
  auth?: boolean;
  permission?: MdmPermission;
  handle: RouteHandler;
};

export async function dispatch(routes: Route[], req: IncomingMessage, res: ServerResponse) {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const route = routes.find((item) => item.method === method && item.match(url.pathname));
    if (!route) {
      const allowed = routes.some((item) => item.match(url.pathname));
      if (allowed) throw new MdmError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
      throw new MdmError("NOT_FOUND", "Not found", 404);
    }

    if (route.auth) {
      const authed = attachJwt(req);
      if (route.permission) requirePermission(authed.claims, route.permission);
    }

    const params = route.match(url.pathname) ?? {};
    Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    await route.handle(req, res, params, url);
  } catch (error) {
    Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    sendError(res, error);
  }
}

export function exact(path: string) {
  return (incoming: string) => (incoming === path ? {} : null);
}

export function one(pattern: string) {
  const [prefix, suffix] = pattern.split(":id");
  return (incoming: string) => {
    if (!incoming.startsWith(prefix ?? "")) return null;
    const rest = incoming.slice((prefix ?? "").length);
    if (suffix) {
      const id = rest.endsWith(suffix) ? rest.slice(0, -suffix.length) : "";
      return id ? { id } : null;
    }
    if (!rest || rest.includes("/")) return null;
    return { id: rest };
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS?.trim() || "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  };
}
