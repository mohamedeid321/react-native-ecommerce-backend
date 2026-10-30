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

// الحد الأقصى لكل صورة 2MB: الصورتين مع بعض لازم يفضلوا تحت حد Vercel للـ request (حوالي 4.5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed")),
});

// صورة الكارت (image) + صورة التفاصيل (detailImage)
const productImages = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "detailImage", maxCount: 1 },
]);

// ---------- عام (guest يقدر يشوفها) ----------
router.get("/", getAllProducts);
router.get("/recommendations", getRecommendedProducts);
router.get("/category/:category", getProductsByCategory);
router.get("/:id", getProductById); // لازم بعد الـ routes اللي فوقها

// ---------- admin ----------
router.post("/", protectRoute, adminRoute, productImages, createProduct);
router.put("/:id", protectRoute, adminRoute, productImages, updateProduct);
router.patch("/:id/featured", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);

// أخطاء الرفع (حجم كبير / ملف مش صورة) ترجع 400 برسالة واضحة بدل 500
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "حجم الصورة كبير، الحد الأقصى 2MB لكل صورة"
        : "مشكلة في رفع الصور";
    return res.status(400).json({ success: false, message });
  }
  if (error?.message === "Only image files are allowed") {
    return res
      .status(400)
      .json({ success: false, message: "الملف لازم يكون صورة" });
  }
  next(error);
});

export default router;
