// Importing Express framework
import { Router } from 'express';
import passport from 'passport';

import userController from "../../controllers/v1/cms/users.controller.js"

// Creating a new router instance
const router = Router()
const requireAuth = passport.authenticate('jwt', { session: false });

router.use("/users", requireAuth, userController);
// Exporting the router to be used in the main app
export default router;