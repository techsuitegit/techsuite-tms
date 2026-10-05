import "dotenv/config";
import { createServer } from "node:http";

import { LoginController } from "@/app/api-services/controllers/login.controller";
import { ShippingPointController } from "@/app/api-services/controllers/shipping-point.controller";
import { GeoController } from "@/app/api-services/controllers/geo.controller";
import { TerminalController } from "@/app/api-services/controllers/terminal.controller";
import { FeeController } from "@/app/api-services/controllers/fee.controller";
import { PricingProcedureController } from "@/app/api-services/controllers/pricing-procedure.controller";
import { MaterialController } from "@/app/api-services/controllers/material.controller";
import { StorageTankController } from "@/app/api-services/controllers/storage-tank.controller";
import { VehicleController } from "@/app/api-services/controllers/vehicle.controller";
import { PtlThresholdController } from "@/app/api-services/controllers/ptl-threshold.controller";
import { CylinderController } from "@/app/api-services/controllers/cylinder.controller";
import { TelemetryDeviceController } from "@/app/api-services/controllers/telemetry-device.controller";
import { HaulierController } from "@/app/api-services/controllers/haulier.controller";
import { ZoneController } from "@/app/api-services/controllers/zone.controller";
import { UomController } from "@/app/api-services/controllers/uom.controller";
import { VendorController } from "@/app/api-services/controllers/vendor.controller";
import { JwtMiddleware } from "@/app/api-services/jwt/jwt.middleware";
import { RbacMiddleware } from "@/app/api-services/jwt/rbac.middleware";
import { IamRepository } from "@/app/api-services/repositories/iam.repository";
import { ShippingPointRepository } from "@/app/api-services/repositories/shipping-point.repository";
import { GeoRepository } from "@/app/api-services/repositories/geo.repository";
import { TerminalRepository } from "@/app/api-services/repositories/terminal.repository";
import { FeeRepository } from "@/app/api-services/repositories/fee.repository";
import { PricingProcedureRepository } from "@/app/api-services/repositories/pricing-procedure.repository";
import { MaterialRepository } from "@/app/api-services/repositories/material.repository";
import { StorageTankRepository } from "@/app/api-services/repositories/storage-tank.repository";
import { VehicleRepository } from "@/app/api-services/repositories/vehicle.repository";
import { PtlThresholdRepository } from "@/app/api-services/repositories/ptl-threshold.repository";
import { CylinderRepository } from "@/app/api-services/repositories/cylinder.repository";
import { TelemetryDeviceRepository } from "@/app/api-services/repositories/telemetry-device.repository";
import { HaulierRepository } from "@/app/api-services/repositories/haulier.repository";
import { ZoneRepository } from "@/app/api-services/repositories/zone.repository";
import { UomRepository } from "@/app/api-services/repositories/uom.repository";
import { VendorRepository } from "@/app/api-services/repositories/vendor.repository";
import { LoginRoutes } from "@/app/api-services/routes/login.routes";
import { ShippingPointRoutes } from "@/app/api-services/routes/shipping-point.routes";
import { GeoRoutes } from "@/app/api-services/routes/geo.routes";
import { TerminalRoutes } from "@/app/api-services/routes/terminal.routes";
import { FeeRoutes } from "@/app/api-services/routes/fee.routes";
import { PricingProcedureRoutes } from "@/app/api-services/routes/pricing-procedure.routes";
import { MaterialRoutes } from "@/app/api-services/routes/material.routes";
import { StorageTankRoutes } from "@/app/api-services/routes/storage-tank.routes";
import { VehicleRoutes } from "@/app/api-services/routes/vehicle.routes";
import { PtlThresholdRoutes } from "@/app/api-services/routes/ptl-threshold.routes";
import { CylinderRoutes } from "@/app/api-services/routes/cylinder.routes";
import { TelemetryDeviceRoutes } from "@/app/api-services/routes/telemetry-device.routes";
import { HaulierRoutes } from "@/app/api-services/routes/haulier.routes";
import { ZoneRoutes } from "@/app/api-services/routes/zone.routes";
import { UomRoutes } from "@/app/api-services/routes/uom.routes";
import { VendorRoutes } from "@/app/api-services/routes/vendor.routes";
import { LoginService } from "@/app/api-services/services/login-service";
import { ShippingPointService } from "@/app/api-services/services/shipping-point.service";
import { GeoService } from "@/app/api-services/services/geo.service";
import { TerminalService } from "@/app/api-services/services/terminal.service";
import { FeeService } from "@/app/api-services/services/fee.service";
import { PricingProcedureService } from "@/app/api-services/services/pricing-procedure.service";
import { MaterialService } from "@/app/api-services/services/material.service";
import { StorageTankService } from "@/app/api-services/services/storage-tank.service";
import { VehicleService } from "@/app/api-services/services/vehicle.service";
import { PtlThresholdService } from "@/app/api-services/services/ptl-threshold.service";
import { CylinderService } from "@/app/api-services/services/cylinder.service";
import { TelemetryDeviceService } from "@/app/api-services/services/telemetry-device.service";
import { HaulierService } from "@/app/api-services/services/haulier.service";
import { ZoneService } from "@/app/api-services/services/zone.service";
import { UomService } from "@/app/api-services/services/uom.service";
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
const uomRepository = new UomRepository(pool);
const uomController = new UomController(new UomService(uomRepository));
const materialController = new MaterialController(
  new MaterialService(new MaterialRepository(pool), uomRepository),
);
const storageTankController = new StorageTankController(
  new StorageTankService(new StorageTankRepository(pool)),
);
const ptlThresholdRepository = new PtlThresholdRepository(pool);
const ptlThresholdController = new PtlThresholdController(
  new PtlThresholdService(ptlThresholdRepository),
);
const vehicleController = new VehicleController(
  new VehicleService(new VehicleRepository(pool), ptlThresholdRepository),
);
const cylinderController = new CylinderController(new CylinderService(new CylinderRepository(pool)));
const telemetryDeviceController = new TelemetryDeviceController(
  new TelemetryDeviceService(new TelemetryDeviceRepository(pool)),
);
const haulierController = new HaulierController(new HaulierService(new HaulierRepository(pool)));
const zoneController = new ZoneController(new ZoneService(new ZoneRepository(pool)));
const feeController = new FeeController(new FeeService(new FeeRepository(pool)));
const pricingProcedureController = new PricingProcedureController(
  new PricingProcedureService(new PricingProcedureRepository(pool)),
);
const geoRepository = new GeoRepository(pool);
const geoController = new GeoController(new GeoService(geoRepository));
const terminalController = new TerminalController(
  new TerminalService(new TerminalRepository(pool), geoRepository),
);

const routes = [
  ...new LoginRoutes(loginController).register(),
  ...new ShippingPointRoutes(shippingPointController).register(),
  ...new VendorRoutes(vendorController).register(),
  ...new UomRoutes(uomController).register(),
  ...new MaterialRoutes(materialController).register(),
  ...new StorageTankRoutes(storageTankController).register(),
  ...new VehicleRoutes(vehicleController).register(),
  ...new PtlThresholdRoutes(ptlThresholdController).register(),
  ...new CylinderRoutes(cylinderController).register(),
  ...new TelemetryDeviceRoutes(telemetryDeviceController).register(),
  ...new HaulierRoutes(haulierController).register(),
  ...new ZoneRoutes(zoneController).register(),
  ...new FeeRoutes(feeController).register(),
  ...new PricingProcedureRoutes(pricingProcedureController).register(),
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
