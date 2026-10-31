import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getDeliveryInfo, saveDeliveryInfo } from "../controllers/deliveryInfo.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/", getDeliveryInfo);
router.put("/", saveDeliveryInfo);

export default router;
