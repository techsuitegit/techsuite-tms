import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import {
  isDgRestrictionZoneId,
  parseCreateBody,
  parseUpdateBody,
} from "../services/dg-restriction-validation";
import type { DgRestrictionService } from "../services/dg-restriction.service";
import { readJsonBody, readRaw, sendJson } from "../../../server/http/io";

export class DgRestrictionController {
  constructor(private readonly service: DgRestrictionService) {}

  async lookups(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.lookups(url.searchParams));
  }

  async feed(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.feed(url.searchParams));
  }

  async exportGeoJson(_req: AuthedRequest, res: ServerResponse) {
    const body = await this.service.exportGeoJson();
    res.setHeader("Content-Disposition", "attachment; filename=dg-restriction-zones.geojson");
    sendJson(res, 200, body);
  }

  async importRows(req: AuthedRequest, res: ServerResponse) {
    const raw = await readRaw(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      throw new MdmError("VALIDATION", "Invalid JSON", 400);
    }
    sendJson(res, 200, await this.service.importFeatureCollection(parsed, req.actor));
  }

  async list(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.list(url.searchParams));
  }

  async create(req: AuthedRequest, res: ServerResponse) {
    const input = parseCreateBody(await readJsonBody(req));
    sendJson(res, 201, await this.service.create(input, req.actor));
  }

  async versions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.versions(requireId(params.id)));
  }

  async auditLog(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.auditLog(requireId(params.id)));
  }

  async submit(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.service.submit(requireId(params.id), reason, req.actor));
  }

  async approve(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : null;
    sendJson(res, 200, await this.service.approve(requireId(params.id), note, req.actor));
  }

  async reject(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const note = typeof body.note === "string" ? body.note : "";
    sendJson(res, 200, await this.service.reject(requireId(params.id), note, req.actor));
  }

  async archive(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const reason = typeof body.reason === "string" ? body.reason : "";
    sendJson(res, 200, await this.service.archive(requireId(params.id), reason, req.actor));
  }

  async remove(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.remove(requireId(params.id), req.actor));
  }

  async getById(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.getById(requireId(params.id)));
  }

  async update(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const input = parseUpdateBody(await readJsonBody(req));
    sendJson(res, 200, await this.service.update(requireId(params.id), input, req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !isDgRestrictionZoneId(id)) {
    throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
  }
  return id;
}
