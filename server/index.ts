import "dotenv/config";
import { createServer } from "node:http";

import { handleLogin } from "./auth/login-http";
import { createAppPool } from "./db/pool";
import { sendJson } from "./http/io";
import { createShippingPointRoutes, dispatch } from "./mdm/shipping-point-http";
import { ShippingPointService } from "./mdm/shipping-point-service";

const port = Number(process.env.API_PORT ?? 3001);
const pool = createAppPool();
const routes = [
  {
    method: "POST",
    match: (path: string) => (path === "/api/v1/jwt/login" ? {} : null),
    handle: async (req, res) => {
      await handleLogin(req, res);
    },
  },
  ...createShippingPointRoutes(new ShippingPointService(pool)),
];

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
