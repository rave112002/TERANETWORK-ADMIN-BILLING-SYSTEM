// Network inventory routes (OSS): OLTs, PON ports, splitters, NAPs, ONUs.
import { Router } from "express";
import passport from "passport";

import oltsController from "../../controllers/v1/cms/olts.controller.js";
import ponPortsController from "../../controllers/v1/cms/ponPorts.controller.js";
import splittersController from "../../controllers/v1/cms/splitters.controller.js";
import napsController from "../../controllers/v1/cms/naps.controller.js";
import onusController from "../../controllers/v1/cms/onus.controller.js";
import provisioningController from "../../controllers/v1/cms/provisioning.controller.js";

const router = Router();
const requireAuth = passport.authenticate("jwt", { session: false });

// Every network route requires a valid JWT; per-route role checks (super_admin /
// noc for writes) live inside each controller via requireRole(...).
// Final paths: /api/v1/network/olts
router.use("/olts", requireAuth, oltsController);
// Final paths: /api/v1/network/pon-ports
router.use("/pon-ports", requireAuth, ponPortsController);
// Final paths: /api/v1/network/splitters
router.use("/splitters", requireAuth, splittersController);
// Final paths: /api/v1/network/naps
router.use("/naps", requireAuth, napsController);
// Final paths: /api/v1/network/onus
router.use("/onus", requireAuth, onusController);
// Manual ONU provisioning controls (enqueue jobs + read action logs).
// Mounted at the same /onus base; its sub-paths (/:id/deactivate, /:id/activate,
// /:id/status, /:id/action-logs) don't collide with the CRUD routes above.
router.use("/onus", requireAuth, provisioningController);

export default router;
