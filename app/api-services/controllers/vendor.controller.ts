import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { parseSapUpsertBody } from "../services/vendor-validation";
import type { VendorService } from "../services/vendor.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  async lookups(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.vendorService.lookups(url.searchParams.get("type")));
  }

  async list(req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.vendorService.list(url.searchParams));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.vendorService.getById(requireId(params.id)));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.vendorService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.vendorService.auditLog(requireId(params.id)));
  }

  async sapUpsert(req: AuthedRequest, res: ServerResponse) {
    const input = parseSapUpsertBody(await readJsonBody(req));
    sendJson(res, 200, await this.vendorService.sapUpsert(input, req.actor));
  }

  forbiddenWrite(_req: AuthedRequest, res: ServerResponse) {
    throw new MdmError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
}

function requireId(id: string | undefined) {
  if (!id || !UUID_RE.test(id)) throw new MdmError("NOT_FOUND", "Vendor was not found", 404);
  return id;
}
