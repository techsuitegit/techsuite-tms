import type { ServerResponse } from "node:http";

import { MdmError } from "../errors/mdm-error";
import type { AuthedRequest } from "../jwt/jwt.middleware";
import type { ManualDecisionInput } from "../services/qualification-types";
import type { QualificationService } from "../services/qualification.service";
import { readJsonBody, sendJson } from "../../../server/http/io";

export class QualificationController {
  constructor(private readonly service: QualificationService) {}

  async listOrders(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.listOrders(url.searchParams));
  }

  async getOrder(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.getOrder(requireId(params.id)));
  }

  async listDecisions(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.listDecisions(requireId(params.id)));
  }

  async evaluateOne(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.evaluateOne(requireId(params.id), req.actor));
  }

  async run(req: AuthedRequest, res: ServerResponse) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await this.service.runEngine(req.actor, {
        dueBefore: typeof body.dueBefore === "string" ? body.dueBefore : null,
        divisionId: typeof body.divisionId === "string" ? body.divisionId : null,
      }),
    );
  }

  async listRuns(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.listRuns(url.searchParams));
  }

  async getRun(_req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    sendJson(res, 200, await this.service.getRun(requireId(params.id)));
  }

  async manualDecision(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const input = parseManualDecision(body);
    sendJson(res, 200, await this.service.manualDecision(requireId(params.id), input, req.actor));
  }

  async amendQuantity(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const body = await readJsonBody(req);
    const qualifiedQty = Number(body.qualifiedQty);
    const reason = typeof body.reason === "string" ? body.reason : "";
    const versionNo = Number(body.versionNo);
    if (!Number.isFinite(versionNo)) throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
    sendJson(
      res,
      200,
      await this.service.amendQuantity(requireId(params.id), { qualifiedQty, reason, versionNo }, req.actor),
    );
  }

  async pool(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.pool(url.searchParams));
  }

  async policy(_req: AuthedRequest, res: ServerResponse) {
    sendJson(res, 200, await this.service.policy());
  }

  async reasonCodes(_req: AuthedRequest, res: ServerResponse, _params: Record<string, string>, url: URL) {
    sendJson(res, 200, await this.service.reasonCodes(url.searchParams.get("appliesTo")));
  }

  async upsertReading(req: AuthedRequest, res: ServerResponse, params: Record<string, string>) {
    const tankId = requireId(params.tankId);
    sendJson(res, 200, await this.service.upsertReading(tankId, await readJsonBody(req), req.actor));
  }
}

function requireId(id: string | undefined) {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new MdmError("NOT_FOUND", "Resource was not found", 404);
  return id;
}

function parseManualDecision(body: Record<string, unknown>): ManualDecisionInput {
  const outcome = body.outcome;
  if (outcome !== "QUALIFIED" && outcome !== "REJECTED") {
    throw new MdmError("VALIDATION", "outcome must be QUALIFIED or REJECTED", 400, "outcome");
  }
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  if (!reasonCode) throw new MdmError("VALIDATION", "reasonCode is required", 400, "reasonCode");
  const grounds = typeof body.grounds === "string" ? body.grounds : "";
  const reference = typeof body.reference === "string" ? body.reference : "";
  const versionNo = Number(body.versionNo);
  if (!Number.isInteger(versionNo)) throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  let qualifiedQty: number | null = null;
  if (body.qualifiedQty != null && body.qualifiedQty !== "") {
    qualifiedQty = Number(body.qualifiedQty);
    if (!Number.isFinite(qualifiedQty)) {
      throw new MdmError("VALIDATION", "qualifiedQty must be a number", 400, "qualifiedQty");
    }
  }
  return { outcome, reasonCode, grounds, reference, versionNo, qualifiedQty };
}
