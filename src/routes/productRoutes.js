import express from "express";
import multer from "multer";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createProduct,
  updateProduct,
  getAllProducts,
  getProductById,
  toggleFeaturedProduct,
  deleteProduct,
  getRecommendedProducts,
  getProductsByCategory,
} from "../controllers/product.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed")),
});

// ---------- عام (guest يقدر يشوفها) ----------
router.get("/", getAllProducts);
router.get("/recommendations", getRecommendedProducts);
router.get("/category/:category", getProductsByCategory);
router.get("/:id", getProductById); // لازم بعد الـ routes اللي فوقها

// ---------- admin ----------
router.post(
  "/",
  protectRoute,
  adminRoute,
  upload.single("image"),
  createProduct,
);
router.put(
  "/:id",
  protectRoute,
  adminRoute,
  upload.single("image"),
  updateProduct,
);
router.patch("/:id/featured", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);

export default router;
