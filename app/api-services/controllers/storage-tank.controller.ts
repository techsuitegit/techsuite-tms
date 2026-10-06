import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { isStorageTankId, parseCreateBody, parseUpdateBody } from "../services/storage-tank-validation";
import type { StorageTankService } from "../services/storage-tank.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

export class StorageTankController {
  constructor(private readonly storageTankService: StorageTankService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.storageTankService.lookups());
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.storageTankService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.storageTankService.create(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.storageTankService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.storageTankService.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.storageTankService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.storageTankService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.storageTankService.reject(requireId(params.id), note, req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.storageTankService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.storageTankService.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !isStorageTankId(id)) throw new MdmError("NOT_FOUND", "Storage Tank was not found", 404);
  return id;
}
