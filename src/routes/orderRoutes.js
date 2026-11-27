import {requestGuestTracking} from '../controllers/guestTrackingRecovery.controller.js';
import {getCourierProfile,updateCourierProfile} from "../controllers/courierProfile.controller.js";
import {authRateLimit} from "../middleware/authRateLimit.js";
import {updateCourier,setCourierDisabled,removeCourier,createCourier,listCouriers,assignCourier,listCourierOrders,reportDelivered,approveDelivery} from "../controllers/delivery.controller.js";
import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createOrder,quoteOrder,createGuestOrder,quoteGuestOrder,getGuestTracking,cancelGuestOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/order.controller.js";

const router = express.Router();
router.post("/guest/quote",authRateLimit("guest-quote",30),quoteGuestOrder);
router.post("/guest",authRateLimit("guest-order",12),createGuestOrder);
router.post("/guest/track",authRateLimit("guest-tracking",120),getGuestTracking);
router.post("/guest/cancel",authRateLimit("guest-cancel",20),cancelGuestOrder);
router.post("/guest/recover",authRateLimit("guest-recover",5),requestGuestTracking);
router.use(protectRoute);
const courierOnly=(req,res,next)=>req.user.role==="delivery"?next():res.status(403).json({message:"Courier only"});
router.get("/couriers",adminRoute,listCouriers);
router.post("/couriers",adminRoute,createCourier);
router.patch("/couriers/:id",adminRoute,updateCourier);
router.patch("/couriers/:id/disabled",adminRoute,setCourierDisabled);
router.delete("/couriers/:id",adminRoute,removeCourier);
router.get("/courier/profile",courierOnly,getCourierProfile);
router.patch("/courier/profile",courierOnly,authRateLimit("courier-profile",20),updateCourierProfile);
router.get("/courier/my",courierOnly,listCourierOrders);
router.patch("/:id/assign",adminRoute,assignCourier);
router.patch("/:id/report-delivered",courierOnly,reportDelivered);
router.patch("/:id/approve-delivery",adminRoute,approveDelivery);

// العميل
const customerOnly=(req,res,next)=>req.user.role==="customer"?next():res.status(403).json({message:"Customer only"});
router.post("/quote",customerOnly,quoteOrder);
router.post("/",customerOnly,createOrder);
router.get("/my", getMyOrders); // لازم قبل "/:id"
router.patch("/:id/cancel", cancelOrder);

// الـ admin
router.get("/", adminRoute, getAllOrders); // ?scope=current|finished&page&limit
router.patch("/:id/status", adminRoute, updateOrderStatus); // { status }

// طلب واحد (صاحبه أو الـ admin)
router.get("/:id", getOrderById);

export default router;
