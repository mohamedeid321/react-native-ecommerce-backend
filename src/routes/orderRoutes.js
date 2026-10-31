import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/order.controller.js";

const router = express.Router();
router.use(protectRoute);

// العميل
router.post("/", createOrder);
router.get("/my", getMyOrders); // لازم قبل "/:id"
router.patch("/:id/cancel", cancelOrder);

// الـ admin
router.get("/", adminRoute, getAllOrders); // ?scope=current|finished&page&limit
router.patch("/:id/status", adminRoute, updateOrderStatus); // { status }

// طلب واحد (صاحبه أو الـ admin)
router.get("/:id", getOrderById);

export default router;
