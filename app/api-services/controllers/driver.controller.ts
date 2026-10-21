import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { isDriverId, parseCreateBody, parseUpdateBody } from "../services/driver-validation";
import type { DriverService } from "../services/driver.service";
import { parseCsv, readJsonBody, readRaw, sendJson, sendText } from "../../../server/http/io";

export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  async lookups(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.driverService.lookups(url.searchParams));
  }

  async exportCsv(req: AuthedRequest, res: ServerResponse) {
    const csv = await this.driverService.exportCsv(canReadPii(req));
    res.setHeader("Content-Disposition", "attachment; filename=drivers.csv");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.driverService.importRows(await readImportRows(req), req.actor));
  }

  async list(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.driverService.list(url.searchParams, canReadPii(req)));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.driverService.create(input, req.actor));
  }

  async versions(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.driverService.versions(requireId(params.id), canReadPii(req)));
  }

  async auditLog(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.driverService.auditLog(requireId(params.id), canReadPii(req)));
  }

  async dispatchEligibility(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.driverService.dispatchEligibility(requireId(params.id), url.searchParams));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.driverService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.driverService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.driverService.reject(requireId(params.id), note, req.actor));
  }

  async archive(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.driverService.archive(requireId(params.id), reason, req.actor));
  }

  async remove(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.driverService.remove(requireId(params.id), req.actor));
  }

  async getById(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.driverService.getById(requireId(params.id), canReadPii(req)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.driverService.update(requireId(params.id), input, req.actor));
  }
}

function canReadPii(req: AuthedRequest) {
  const raw = req.claims.permissions ?? req.claims.permission ?? req.claims.roles ?? req.claims.role;
  const listed =
    typeof raw === "string" && raw.trim()
      ? [raw.trim()]
      : Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
  if (listed.length === 0) return true;
  return listed.includes("mdm.driver.pii.read") || listed.includes("*");
}

function requireId(id: string | undefined) {
  if (!id || !isDriverId(id)) throw new MdmError("NOT_FOUND", "Driver was not found", 404);
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
