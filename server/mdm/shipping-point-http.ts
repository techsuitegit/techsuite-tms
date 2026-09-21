import type { IncomingMessage, ServerResponse } from "node:http";

import { actorFromClaims, readBearerClaims } from "../auth/bearer";
import { requirePermission } from "../auth/rbac";
import { MdmError } from "../mdm/mdm-error";
import { ShippingPointService } from "../mdm/shipping-point-service";
import { parseCreateBody, parseStatusFilter, parseUpdateBody } from "../mdm/shipping-point-validation";
import { parseCsv, readJsonBody, readRaw, sendError, sendJson, sendText } from "../http/io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Route = {
  method: string;
  match: (path: string) => Record<string, string> | null;
  handle: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, url: URL) => Promise<void>;
};

export function createShippingPointRoutes(service: ShippingPointService): Route[] {
  return [
    {
      method: "GET",
      match: exact("/api/v1/mdm/lookups/shipping-points"),
      handle: async (req, res) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        sendJson(res, 200, await service.lookups());
      },
    },
    {
      method: "GET",
      match: exact("/api/v1/mdm/shipping-points/export"),
      handle: async (req, res) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        const csv = await service.exportCsv();
        res.setHeader("Content-Disposition", "attachment; filename=shipping-points.csv");
        sendText(res, 200, csv, "text/csv; charset=utf-8");
      },
    },
    {
      method: "POST",
      match: exact("/api/v1/mdm/shipping-points/import"),
      handle: async (req, res) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.write");
        const rows = await readImportRows(req);
        sendJson(res, 200, await service.importRows(rows, actorFromClaims(claims)));
      },
    },
    {
      method: "GET",
      match: exact("/api/v1/mdm/shipping-points"),
      handle: async (req, res, _params, url) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        parseStatusFilter(url.searchParams.get("status"));
        sendJson(res, 200, await service.list(url.searchParams));
      },
    },
    {
      method: "POST",
      match: exact("/api/v1/mdm/shipping-points"),
      handle: async (req, res) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.write");
        const input = parseCreateBody(await readJsonBody(req));
        sendJson(res, 201, await service.create(input, actorFromClaims(claims)));
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id/versions"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        sendJson(res, 200, await service.versions(requireId(params.id)));
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id/audit"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        sendJson(res, 200, await service.auditLog(requireId(params.id)));
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/submit"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.write");
        const body = await readJsonBody(req);
        const reason = typeof body.reason === "string" ? body.reason : "";
        sendJson(res, 200, await service.submit(requireId(params.id), reason, actorFromClaims(claims)));
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/approve"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.approve");
        const body = await readJsonBody(req);
        const note = typeof body.note === "string" ? body.note : null;
        sendJson(res, 200, await service.approve(requireId(params.id), note, actorFromClaims(claims)));
      },
    },
    {
      method: "POST",
      match: one("/api/v1/mdm/shipping-points/:id/reject"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.approve");
        const body = await readJsonBody(req);
        const note = typeof body.note === "string" ? body.note : "";
        sendJson(res, 200, await service.reject(requireId(params.id), note, actorFromClaims(claims)));
      },
    },
    {
      method: "GET",
      match: one("/api/v1/mdm/shipping-points/:id"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.read");
        sendJson(res, 200, await service.getById(requireId(params.id)));
      },
    },
    {
      method: "PATCH",
      match: one("/api/v1/mdm/shipping-points/:id"),
      handle: async (req, res, params) => {
        const claims = readBearerClaims(req);
        requirePermission(claims, "mdm.master.write");
        const input = parseUpdateBody(await readJsonBody(req));
        sendJson(res, 200, await service.update(requireId(params.id), input, actorFromClaims(claims)));
      },
    },
  ];
}

export async function dispatch(
  routes: Route[],
  req: IncomingMessage,
  res: ServerResponse,
) {
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
    const params = route.match(url.pathname) ?? {};
    Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    await route.handle(req, res, params, url);
  } catch (error) {
    Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    sendError(res, error);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS?.trim() || "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  };
}

function exact(path: string) {
  return (incoming: string) => (incoming === path ? {} : null);
}

function one(pattern: string) {
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

function requireId(id: string | undefined) {
  if (!id || !UUID_RE.test(id)) throw new MdmError("NOT_FOUND", "Shipping Point was not found", 404);
  return id;
}

async function readImportRows(req: IncomingMessage): Promise<Record<string, unknown>[]> {
  const contentType = req.headers["content-type"] ?? "";
  const raw = await readRaw(req);
  if (contentType.includes("text/csv") || contentType.includes("spreadsheet") || contentType.includes("excel")) {
    if (contentType.includes("excel") || contentType.includes("spreadsheet")) {
      throw new MdmError("VALIDATION", "CSV template mismatch", 400);
    }
    return parseCsv(raw);
  }
  if (!raw.trim()) throw new MdmError("VALIDATION", "CSV template mismatch", 400);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) {
      return (parsed as { rows: Record<string, unknown>[] }).rows;
    }
  } catch {
    return parseCsv(raw);
  }
  throw new MdmError("VALIDATION", "CSV template mismatch", 400);
}
