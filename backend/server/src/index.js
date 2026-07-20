// Importing the Express framework
import express from "express";

// Importing the main route file (can contain multiple sub-routes like auth, users, etc.)
import route from "./routes/route.js";

// Creating a new router instance
const router = express.Router();

// Mounting all routes under the /api prefix
// This means all routes inside route.js will be accessible under /api/...
router.use('/api', route);

// Exporting the configured router to be used in the main server file (e.g., app.js or index.js)
export default router;