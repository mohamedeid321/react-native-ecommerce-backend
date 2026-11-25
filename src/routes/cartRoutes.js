import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getCart,
  mergeGuestCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cart.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/", getCart);
router.post("/merge", mergeGuestCart);
router.post("/", addToCart); // { productId, quantity }
router.put("/:productId", updateCartItem); // { quantity }
router.delete("/:productId", removeFromCart);
router.delete("/", clearCart);

export default router;
