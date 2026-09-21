import "dotenv/config";
import { createServer } from "node:http";

import { LoginController } from "./controllers/login.controller";
import { ShippingPointController } from "./controllers/shipping-point.controller";
import { createAppPool } from "./db/pool";
import { sendJson } from "./http/io";
import { dispatch } from "./http/router";
import { IamRepository } from "./repositories/iam.repository";
import { ShippingPointRepository } from "./repositories/shipping-point.repository";
import { createLoginRoutes } from "./routes/login.routes";
import { createShippingPointRoutes } from "./routes/shipping-point.routes";
import { LoginService } from "./services/login.service";
import { ShippingPointService } from "./services/shipping-point.service";

const port = Number(process.env.API_PORT ?? 3001);
const pool = createAppPool();

const iamRepository = new IamRepository();
const loginService = new LoginService(iamRepository);
const loginController = new LoginController(loginService);

const shippingPointRepository = new ShippingPointRepository(pool);
const shippingPointService = new ShippingPointService(shippingPointRepository);
const shippingPointController = new ShippingPointController(shippingPointService);

const routes = [...createLoginRoutes(loginController), ...createShippingPointRoutes(shippingPointController)];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, name: "tms-api" });
    return;
  }
  await dispatch(routes, req, res);
});

server.listen(port, () => {
  process.stdout.write(`TMS API listening on http://localhost:${port}\n`);
});
