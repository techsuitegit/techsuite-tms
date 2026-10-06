import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { isCostCentreId, parseCreateBody, parseUpdateBody } from "../services/cost-centre-validation";
import type { CostCentreService } from "../services/cost-centre.service";
import { parseCsv, readJsonBody, readRaw, sendJson, sendText } from "../../../server/http/io";

export class CostCentreController {
  constructor(private readonly costCentreService: CostCentreService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.costCentreService.lookups());
  }

  async exportCsv(_req: AuthedRequest, res: ServerResponse) {
    const csv = await this.costCentreService.exportCsv();
    res.setHeader("Content-Disposition", "attachment; filename=cost-centres.csv");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.costCentreService.importRows(await readImportRows(req), req.actor));
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.costCentreService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.costCentreService.create(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.costCentreService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.costCentreService.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.costCentreService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.costCentreService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.costCentreService.reject(requireId(params.id), note, req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.costCentreService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.costCentreService.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !isCostCentreId(id)) throw new MdmError("NOT_FOUND", "Cost Centre was not found", 404);
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
