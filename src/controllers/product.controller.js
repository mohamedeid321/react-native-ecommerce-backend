import Product, { CATEGORY_IDS } from "../models/product.model.js";
import cloudinary from "../lib/cloudinary.js";
import streamifier from "streamifier";
import mongoose from "mongoose";

// ---------- دوال مساعدة ----------

// رفع ملف (Buffer) على Cloudinary
const uploadFile = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" }, // اسم المجلد في Cloudinary
      (error, result) => (result ? resolve(result) : reject(error)),
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });

// مسح صورة من Cloudinary بالـ URL (مبترميش error)
const deleteCloudinaryImage = async (url) => {
  if (!url) return;
  try {
    const publicId = url.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(`products/${publicId}`);
  } catch (error) {
    console.log("error deleting image from cloudinary", error.message);
  }
};

// "" أو undefined => undefined، غير كده => رقم (ممكن يبقى NaN لو الكلام مش رقم)
const parseNumber = (value) =>
  value === undefined || value === null || String(value).trim() === ""
    ? undefined
    : Number(value);

// بيتحقق من القيم اللي اتبعتت بس (الرسائل بالعربي لأنها بتظهر للـ admin)
const validateFields = ({ price, discount, stock, category }) => {
  if (price !== undefined && !(Number.isFinite(price) && price > 0)) {
    return "السعر لازم يكون رقم أكبر من صفر";
  }
  if (
    discount !== undefined &&
    !(Number.isFinite(discount) && discount >= 0 && discount <= 100)
  ) {
    return "نسبة الخصم لازم تكون رقم من 0 إلى 100";
  }
  if (
    stock !== undefined &&
    !(Number.isInteger(stock) && stock >= 0)
  ) {
    return "المخزون لازم يكون رقم صحيح من صفر فأكتر";
  }
  if (category !== undefined && !CATEGORY_IDS.includes(category)) {
    return "القسم غير صحيح";
  }
  return null;
};

// رد موحد للأخطاء
const sendError = (res, error, label) => {
  if (error?.name === "ValidationError") {
    const first = Object.values(error.errors)[0];
    return res
      .status(400)
      .json({ success: false, message: first?.message || "بيانات غير صحيحة" });
  }
  console.error(`Error in ${label} controller:`, error);
  return res
    .status(500)
    .json({ success: false, message: "Server error", error: error.message });
};

// ---------- الـ controllers ----------

export const createProduct = async (req, res) => {
  const uploadedUrls = []; // لو حصل خطأ بعد الرفع نمسح الصور من Cloudinary
  try {
    const { name, description, category } = req.body;
    const unit = (req.body.unit || "").trim();
    const price = parseNumber(req.body.price);
    const discount = parseNumber(req.body.discount) ?? 0;
    const stock = parseNumber(req.body.stock) ?? 0;

    const imageFile = req.files?.image?.[0];
    const detailFile = req.files?.detailImage?.[0];

    // 1. كل البيانات الأساسية موجودة
    if (!name?.trim() || !description?.trim() || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: "كل البيانات مطلوبة (الاسم والوصف والسعر والقسم)",
      });
    }

    // 2. القيم صحيحة
    const invalid = validateFields({ price, discount, stock, category });
    if (invalid) {
      return res.status(400).json({ success: false, message: invalid });
    }

    // 3. صورة الكارت إجبارية (صورة التفاصيل اختيارية)
    if (!imageFile) {
      return res
        .status(400)
        .json({ success: false, message: "صورة المنتج مطلوبة" });
    }

    // 4. رفع الصور
    const imageUpload = await uploadFile(imageFile);
    uploadedUrls.push(imageUpload.secure_url);

    let detailImageUrl = "";
    if (detailFile) {
      const detailUpload = await uploadFile(detailFile);
      detailImageUrl = detailUpload.secure_url;
      uploadedUrls.push(detailImageUrl);
    }

    // 5. تخزين المنتج
    const newProduct = await Product.create({
      name: name.trim(),
      description: description.trim(),
      price,
      discount,
      category,
      unit,
      stock,
      image: imageUpload.secure_url,
      detailImage: detailImageUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    await Promise.all(uploadedUrls.map(deleteCloudinaryImage));
    return sendError(res, error, "createProduct");
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const { category } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 6, 50); // حد أقصى 50

    // بناء كائن البحث (Query Filter)
    const filter = {};
    if (category && category !== "all") {
      filter.category = category;
    }

    const skip = (page - 1) * limit;

    // الأحدث أولاً مع الفلترة والـ Pagination
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(filter);

    return res.status(200).json({
      success: true,
      currentPage: page,
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

export const getProductsByCategory = async (req, res) => {
  const { category } = req.params;
  try {
    const products = await Product.find({ category });
    res.json({ products });
  } catch (error) {
    console.log("Error in getProductsByCategory controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getRecommendedProducts = async (req, res) => {
  try {
    const products = await Product.aggregate([
      { $sample: { size: 4 } },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          image: 1,
          price: 1,
          discount: { $ifNull: ["$discount", 0] },
          unit: 1,
          // الـ aggregate مبيحسبش الـ virtuals فبنحسب finalPrice هنا
          finalPrice: {
            $round: [
              {
                $multiply: [
                  "$price",
                  {
                    $subtract: [
                      1,
                      { $divide: [{ $ifNull: ["$discount", 0] }, 100] },
                    ],
                  },
                ],
              },
              2,
            ],
          },
        },
      },
    ]);

    res.json(products);
  } catch (error) {
    console.log("Error in getRecommendedProducts controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, product });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  const newUrls = []; // صور اترفعت في الطلب ده (نمسحها لو حصل خطأ)
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // الحقول المسموح تتعدل فقط (مش بنثق في أي حاجة تانية جاية من الـ body)
    const fields = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim(),
      category: req.body.category,
      unit: req.body.unit?.trim(),
      price: parseNumber(req.body.price),
      discount: parseNumber(req.body.discount),
      stock: parseNumber(req.body.stock),
    };

    const invalid = validateFields(fields);
    if (invalid) {
      return res.status(400).json({ success: false, message: invalid });
    }

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== "") product[key] = value;
    });

    // صور جديدة اختيارية: نرفعها ونمسح القديمة بعد نجاح الحفظ
    const oldUrls = [];
    const imageFile = req.files?.image?.[0];
    const detailFile = req.files?.detailImage?.[0];

    if (imageFile) {
      const upload = await uploadFile(imageFile);
      newUrls.push(upload.secure_url);
      oldUrls.push(product.image);
      product.image = upload.secure_url;
    }
    if (detailFile) {
      const upload = await uploadFile(detailFile);
      newUrls.push(upload.secure_url);
      oldUrls.push(product.detailImage);
      product.detailImage = upload.secure_url;
    }

    const updated = await product.save();
    await Promise.all(oldUrls.map(deleteCloudinaryImage));

    res.json({
      success: true,
      message: "Product updated successfully",
      product: updated,
    });
  } catch (error) {
    await Promise.all(newUrls.map(deleteCloudinaryImage));
    return sendError(res, error, "updateProduct");
  }
};

export const deleteProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await deleteCloudinaryImage(product.image);
    await deleteCloudinaryImage(product.detailImage);

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.log("Error in deleteProduct controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    product.isFeatured = !product.isFeatured;
    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    console.log("Error in toggleFeaturedProduct controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
