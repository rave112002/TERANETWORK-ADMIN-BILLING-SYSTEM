// Importing Express framework
import {Router} from "express";
import authController from "../../controllers/v1/auth/auth.controller"

// Creating a new router instance
const router = Router();

router.use("/auth", authController);

// Exporting the router to be used in the main app
export default router;