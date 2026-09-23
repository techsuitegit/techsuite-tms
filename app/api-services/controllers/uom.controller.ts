import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { parseCreateBody, parseSapUpsertBody, parseUpdateBody } from "../services/uom-validation";
import type { UomService } from "../services/uom.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UomController {
  constructor(private readonly uomService: UomService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.uomService.lookups());
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.uomService.list(url.searchParams));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.uomService.getById(requireId(params.id)));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.uomService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.uomService.auditLog(requireId(params.id)));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.uomService.create(input, req.actor));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.uomService.update(requireId(params.id), input, req.actor));
  }

  async sapUpsert(req: AuthedRequest, res: ServerResponse) {
    const input = parseSapUpsertBody(await readJsonBody(req));
    sendJson(res, 200, await this.uomService.sapUpsert(input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !UUID_RE.test(id)) throw new MdmError("NOT_FOUND", "UOM was not found", 404);
  return id;
}
