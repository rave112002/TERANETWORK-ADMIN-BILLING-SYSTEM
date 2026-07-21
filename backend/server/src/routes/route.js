// Importing Express framework
import { Router } from "express";

const router = Router();

// Importing route modules
import authRoute from "./v1/auth.route.js";
import cmsRoute from "./v1/cms.route.js";
import networkRoute from "./v1/network.route.js";

// Mounting user-related routes (login, register, upload)
router.use("/v1/auth", authRoute);

// Mounting order-related routes (CMS)
router.use("/v1/cms", cmsRoute);

// Mounting network inventory routes (OLTs, PON ports, splitters, NAPs, ONUs)
router.use("/v1/network", networkRoute);

// Exporting the router to be used in the main app
export default router;
