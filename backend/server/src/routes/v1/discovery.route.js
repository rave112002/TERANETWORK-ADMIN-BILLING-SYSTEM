// Device Discovery routes (§3.1.1): run sweeps, review staged items, import.
import { Router } from "express";
import passport from "passport";

import discoveryController from "../../controllers/v1/cms/discovery.controller.js";

const router = Router();
const requireAuth = passport.authenticate("jwt", { session: false });

// All discovery routes require a valid JWT; per-route role checks (super_admin /
// noc for running sweeps) live inside the controller.
// Final paths: /api/v1/discovery/run, /api/v1/discovery/runs, /api/v1/discovery/runs/:id/items
router.use("/", requireAuth, discoveryController);

export default router;
