// System configuration routes: runtime settings (e.g. the DRY_RUN kill switch).
import { Router } from "express";
import passport from "passport";

import settingsController from "../../controllers/v1/cms/settings.controller.js";

const router = Router();
const requireAuth = passport.authenticate("jwt", { session: false });

// Every setting requires a valid JWT; per-route role checks live in the
// controller (e.g. only super_admin may change DRY_RUN).
// Final paths: /api/v1/system/settings/dry-run
router.use("/settings", requireAuth, settingsController);

export default router;
