// Importing Express framework
import { Router } from "express";
import passport from "passport";

import userController from "../../controllers/v1/cms/users.controller.js";
import plansController from "../../controllers/v1/cms/plans.controller.js";
import customersController from "../../controllers/v1/cms/customers.controller.js";
import subscriptionsController from "../../controllers/v1/cms/subscriptions.controller.js";

// Creating a new router instance
const router = Router();
const requireAuth = passport.authenticate("jwt", { session: false });

router.use("/users", requireAuth, userController);
// Every /plans route requires a valid JWT; per-route role checks live in the
// controller via requireRole(...). Final paths: /api/v1/cms/plans
router.use("/plans", requireAuth, plansController);
// Final paths: /api/v1/cms/customers
router.use("/customers", requireAuth, customersController);
// Final paths: /api/v1/cms/subscriptions
router.use("/subscriptions", requireAuth, subscriptionsController);
// Exporting the router to be used in the main app
export default router;
