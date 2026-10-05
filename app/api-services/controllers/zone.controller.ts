import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { parseCreateBody, parseUpdateBody } from "../services/zone-validation";
import type { ZoneService } from "../services/zone.service";
import { parseCsv, readJsonBody, readRaw, sendJson, sendText } from "../../../server/http/io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ZoneController {
  constructor(private readonly zoneService: ZoneService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.zoneService.lookups());
  }

  async exportCsv(_req: AuthedRequest, res: ServerResponse) {
    const csv = await this.zoneService.exportCsv();
    res.setHeader("Content-Disposition", "attachment; filename=zones.csv");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.zoneService.importRows(await readImportRows(req), req.actor));
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.zoneService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.zoneService.create(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.zoneService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.zoneService.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.zoneService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.zoneService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.zoneService.reject(requireId(params.id), note, req.actor));
  }

  async remove(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.zoneService.remove(requireId(params.id), req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.zoneService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.zoneService.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !UUID_RE.test(id)) throw new MdmError("NOT_FOUND", "Zone was not found", 404);
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
