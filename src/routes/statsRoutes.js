import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { getStats } from "../controllers/stats.controller.js";

const router = express.Router();
router.get("/", protectRoute, adminRoute, getStats); // ?range=7|30

export default router;
