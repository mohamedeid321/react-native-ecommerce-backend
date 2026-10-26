import Product from "../models/product.model.js";
import cloudinary from "../lib/cloudinary.js";
import streamifier from "streamifier";

//
// دالة مساعدة لرفع الـ Buffer كـ Stream إلى Cloudinary
const streamUpload = (req) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" }, // اسم المجلد في Cloudinary
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      },
    );

    // استخدام streamifier لتحويل الـ buffer إلى تدفق بيانات وإرساله
    streamifier.createReadStream(req.file.buffer).pipe(stream);
  });
};
//
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, category } = req.body;

    // 1 checking from all data exists
    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: "All fields is required",
      });
    }

    // 2. making sure there was an image from multer
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }
    const uploadResponse = await streamUpload(req);

    // 5. create and store the product in our database
    const newProduct = await Product.create({
      name,
      description,
      price,
      category,
      image: uploadResponse.secure_url,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error in createProduct controller:", error);
    return res.status(500).json({
      success: false,
      message: "server error",
      error: error.message,
    });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 6, category } = req.query;

    // بناء كائن البحث (Query Filter)
    const filter = {};
    if (category && category !== "all") {
      filter.category = category;
    }

    // حساب عدد المنتجات المراد تخطيها للـ Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // جلب المنتجات من قاعدة البيانات مع الترتيب (الأحدث أولاً) والفلترة والـ Pagination
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // إجمالي عدد المنتجات المطابقة للفلتر (مفيد لو حابب تعرف إخلصت ولا لأ)
    const totalProducts = await Product.countDocuments(filter);

    return res.status(200).json({
      success: true,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      products,
    });
  } catch (error) {
    console.error("Error in getAllProducts controller:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
