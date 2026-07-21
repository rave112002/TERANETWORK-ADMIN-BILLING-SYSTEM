// Importing Express framework
import { Router } from "express";
// NOTE: the .js extension is REQUIRED — this is native ESM, not bundled.
import authController from "../../controllers/v1/auth/auth.controller.js";

// Creating a new router instance
const router = Router();

// This router is already mounted at /api/v1/auth by route.js, so we mount the
// controller at the root here. Final path: POST /api/v1/auth/login
router.use("/", authController);

// Exporting the router to be used in the main app
export default router;
