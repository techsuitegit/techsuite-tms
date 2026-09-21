import type { IncomingMessage, ServerResponse } from "node:http";

import { IamApiError } from "../repositories/iam.repository";
import { MdmError } from "../errors/mdm-error";
import type { LoginService } from "../services/login-service";
import { readJsonBody, sendJson } from "../../../server/http/io";

export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  async login(req: IncomingMessage, res: ServerResponse) {
    try {
      const body = await readJsonBody(req);
      const session = await this.loginService.login({
        producttype: readString(body.producttype),
        enviroment: readString(body.enviroment),
        login: readString(body.login),
        password: readString(body.password),
      });
      sendJson(res, 200, session);
    } catch (error) {
      if (error instanceof IamApiError) {
        sendJson(res, error.status, { message: error.message });
        return;
      }
      if (error instanceof MdmError && error.errorCode === "VALIDATION") {
        sendJson(res, 400, { message: "Invalid Arguments" });
        return;
      }
      throw error;
    }
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}
