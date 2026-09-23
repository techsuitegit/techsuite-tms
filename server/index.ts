import "dotenv/config";
import { createServer } from "node:http";

import { LoginController } from "@/app/api-services/controllers/login.controller";
import { ShippingPointController } from "@/app/api-services/controllers/shipping-point.controller";
import { GeoController } from "@/app/api-services/controllers/geo.controller";
import { TerminalController } from "@/app/api-services/controllers/terminal.controller";
import { VendorController } from "@/app/api-services/controllers/vendor.controller";
import { JwtMiddleware } from "@/app/api-services/jwt/jwt.middleware";
import { RbacMiddleware } from "@/app/api-services/jwt/rbac.middleware";
import { IamRepository } from "@/app/api-services/repositories/iam.repository";
import { ShippingPointRepository } from "@/app/api-services/repositories/shipping-point.repository";
import { GeoRepository } from "@/app/api-services/repositories/geo.repository";
import { TerminalRepository } from "@/app/api-services/repositories/terminal.repository";
import { VendorRepository } from "@/app/api-services/repositories/vendor.repository";
import { LoginRoutes } from "@/app/api-services/routes/login.routes";
import { ShippingPointRoutes } from "@/app/api-services/routes/shipping-point.routes";
import { GeoRoutes } from "@/app/api-services/routes/geo.routes";
import { TerminalRoutes } from "@/app/api-services/routes/terminal.routes";
import { VendorRoutes } from "@/app/api-services/routes/vendor.routes";
import { LoginService } from "@/app/api-services/services/login-service";
import { ShippingPointService } from "@/app/api-services/services/shipping-point.service";
import { GeoService } from "@/app/api-services/services/geo.service";
import { TerminalService } from "@/app/api-services/services/terminal.service";
import { VendorService } from "@/app/api-services/services/vendor.service";
import { createAppPool } from "./db/pool";
import { sendJson } from "./http/io";
import { HttpRouter } from "./http/router";

const port = Number(process.env.API_PORT ?? 3001);
const pool = createAppPool();

const jwtMiddleware = new JwtMiddleware();
const rbacMiddleware = new RbacMiddleware();
const router = new HttpRouter(jwtMiddleware, rbacMiddleware);

const loginController = new LoginController(new LoginService(new IamRepository()));
const shippingPointController = new ShippingPointController(
  new ShippingPointService(new ShippingPointRepository(pool)),
);
const vendorController = new VendorController(new VendorService(new VendorRepository(pool)));
const geoRepository = new GeoRepository(pool);
const geoController = new GeoController(new GeoService(geoRepository));
const terminalController = new TerminalController(
  new TerminalService(new TerminalRepository(pool), geoRepository),
);

const routes = [
  ...new LoginRoutes(loginController).register(),
  ...new ShippingPointRoutes(shippingPointController).register(),
  ...new VendorRoutes(vendorController).register(),
  ...new GeoRoutes(geoController).register(),
  ...new TerminalRoutes(terminalController).register(),
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, name: "tms-api" });
    return;
  }
  await router.dispatch(routes, req, res);
});

server.listen(port, () => {
  process.stdout.write(`TMS API listening on http://localhost:${port}\n`);
});
