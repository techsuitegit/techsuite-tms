import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import { parseCreateBody, parseSapUpsertBody, parseUpdateBody } from "../services/material-validation";
import type { MaterialService } from "../services/material.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.materialService.lookups());
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.materialService.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.materialService.create(input, req.actor));
  }

  async sapUpsert(req: AuthedRequest, res: ServerResponse) {
    const input = parseSapUpsertBody(await readJsonBody(req));
    sendJson(res, 200, await this.materialService.sapUpsert(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.materialService.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.materialService.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.materialService.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.materialService.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.materialService.reject(requireId(params.id), note, req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.materialService.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.materialService.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !UUID_RE.test(id)) throw new MdmError("NOT_FOUND", "Material was not found", 404);
  return id;
}
