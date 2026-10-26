import express from "express";
import protectRoute from "../middleware/auth.middleware.js";
import {
  createProduct,
  getAllProducts,
} from "../controllers/product.controller.js";

import multer from "multer";

const router = express.Router();
//
// إعداد Multer لتخزين الصورة مؤقتاً في الذاكرة
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
//
router.post("/", protectRoute, upload.single("image"), createProduct);
router.get("/", protectRoute, getAllProducts);

export default router;
