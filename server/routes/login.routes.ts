import type { LoginController } from "../controllers/login.controller";
import { exact, type Route } from "../http/router";

export function createLoginRoutes(controller: LoginController): Route[] {
  return [
    {
      method: "POST",
      match: exact("/api/v1/jwt/login"),
      handle: async (req, res) => {
        await controller.login(req, res);
      },
    },
  ];
}
