import type { LoginController } from "../controllers/login.controller";
import { exact, type Route } from "../../../server/http/router";

export class LoginRoutes {
  constructor(private readonly controller: LoginController) {}

  register(): Route[] {
    return [
      {
        method: "POST",
        match: exact("/api/v1/jwt/login"),
        handle: async (req, res) => {
          await this.controller.login(req, res);
        },
      },
    ];
  }
}
