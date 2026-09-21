import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import { parseCsv, readJsonBody, readRaw, sendJson, sendText } from "../http/io";
import type { AuthedRequest } from "../middleware/jwt.middleware";
import { parseCreateBody, parseStatusFilter, parseUpdateBody } from "../mdm/shipping-point-validation";
import type { ShippingPointService } from "../services/shipping-point.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ShippingPointController {
  constructor(private readonly shippingPointService: ShippingPointService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.shippingPointService.lookups());
  }

  async exportCsv(_req: AuthedRequest, res: ServerResponse) {
    const csv = await this.shippingPointService.exportCsv();
    res.setHeader("Content-Disposition", "attachment; filename=shipping-points.csv");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    const rows = await readImportRows(req);
    sendJson(res, 200, await this.shippingPointService.importRows(rows, req.actor));
  }

  async list(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    parseStatusFilter(url.searchParams.get("status"));
    sendJson(res, 200, await this.shippingPointService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.shippingPointService.create(input, req.actor));
  }

  async versions(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.shippingPointService.versions(requireId(params.id)));
  }

  async auditLog(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.shippingPointService.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.shippingPointService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.shippingPointService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.shippingPointService.reject(requireId(params.id), note, req.actor));
  }

  async getById(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.shippingPointService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.shippingPointService.update(requireId(params.id), input, req.actor));
  }
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
