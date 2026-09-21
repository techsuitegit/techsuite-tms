import type { IncomingMessage, ServerResponse } from "node:http";

import { MdmError } from "../mdm/mdm-error";
import { readJsonBody, sendJson } from "../http/io";
import { IamApiError } from "./iam-client";
import { loginWithJwt } from "./login-service";

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function handleLogin(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJsonBody(req);
    const session = await loginWithJwt({
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
