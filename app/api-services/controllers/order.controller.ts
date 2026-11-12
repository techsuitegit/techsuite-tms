import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { isOrderId, parseCreateBody, parseUpdateBody } from "../services/order-validation";
import type { OrderService } from "../services/order.service";
import { parseCsv, readJsonBody, readRaw, sendJson, sendText } from "../../../server/http/io";

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.orderService.lookups());
  }

  async exportCsv(_req: AuthedRequest, res: ServerResponse) {
    const csv = await this.orderService.exportCsv();
    res.setHeader("Content-Disposition", "attachment; filename=orders.csv");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.orderService.importRows(await readImportRows(req), req.actor));
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.orderService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.orderService.create(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.orderService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.orderService.auditLog(requireId(params.id)));
  }

  async cancel(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.orderService.cancel(requireId(params.id), reason, req.actor));
  }

  async softDelete(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.orderService.softDelete(requireId(params.id), req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.orderService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.orderService.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !isOrderId(id)) throw new MdmError("NOT_FOUND", "Order was not found", 404);
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
