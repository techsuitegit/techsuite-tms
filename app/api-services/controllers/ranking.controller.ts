import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import type { ReorderInput } from "../services/ranking-types";
import type { RankingService } from "../services/ranking.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

export class RankingController {
  constructor(private readonly service: RankingService) {}

  async queue(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.queue(url.searchParams));
  }

  async run(req: AuthedRequest, res: ServerResponse) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await this.service.run(req.actor, {
        trigger: body.trigger === "AFTER_QUALIFICATION" || body.trigger === "SCHEDULE" || body.trigger === "API"
          ? body.trigger
          : "ON_DEMAND",
        divisionId: typeof body.divisionId === "string" ? body.divisionId : null,
        dueBefore: typeof body.dueBefore === "string" ? body.dueBefore : null,
        orderingStrategyOverride:
          body.orderingStrategy === "BAND_THEN_SCORE" || body.orderingStrategy === "ADDITIVE"
            ? body.orderingStrategy
            : null,
      }),
    );
  }

  async listRuns(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.listRuns(url.searchParams));
  }

  async getRun(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.getRun(requireId(params.id)));
  }

  async orderScores(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.orderScores(requireId(params.id)));
  }

  async reorder(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const input = parseReorder(body);
    sendJson(res, 200, await this.service.reorder(requireId(params.id), input, req.actor));
  }

  async pool(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.pool(url.searchParams));
  }

  async weightSets(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.weightSets(url.searchParams));
  }

  async weightSet(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.weightSet(requireId(params.id)));
  }

  async simulate(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await this.service.simulate(requireId(params.id), {
        divisionId: typeof body.divisionId === "string" ? body.divisionId : null,
        dueBefore: typeof body.dueBefore === "string" ? body.dueBefore : null,
      }),
    );
  }

  async customerClasses(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.service.customerClasses());
  }
}

function requireId(id: string | undefined) {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new MdmError("NOT_FOUND", "Resource was not found", 404);
  return id;
}

function parseReorder(body: Record<string, unknown>): ReorderInput {
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) throw new MdmError("VALIDATION", "orderId is required", 400, "orderId");
  const toPosition = Number(body.toPosition);
  if (!Number.isInteger(toPosition)) {
    throw new MdmError("VALIDATION", "toPosition must be an integer", 400, "toPosition");
  }
  return {
    orderId,
    toPosition,
    reasonCode: typeof body.reasonCode === "string" ? body.reasonCode.trim() : "",
    grounds: typeof body.grounds === "string" ? body.grounds : "",
    reference: typeof body.reference === "string" ? body.reference : "",
  };
}
