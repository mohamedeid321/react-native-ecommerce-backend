import Product from "../models/product.model.js";
import cloudinary from "../lib/cloudinary.js";
import streamifier from "streamifier";
import mongoose from "mongoose";
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
    const { name, description, price, category, discount, unit, stock } =
      req.body;

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
    await Product.create({
      name,
      description,
      price,
      category,
      discount,
      unit,
      stock,
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
      {
        $sample: { size: 4 },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          image: 1,
          price: 1,
        },
      },
    ]);

    res.json(products);
  } catch (error) {
    console.log("Error in getRecommendedProducts controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      try {
        await deleteCloudinaryImage(product.image);
        console.log("deleted image from cloduinary");
      } catch (error) {
        console.log("error deleting image from cloduinary", error);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.log("Error in deleteProduct controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      product.isFeatured = !product.isFeatured;
      const updatedProduct = await product.save();
      await updateFeaturedProductsCache();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.log("Error in toggleFeaturedProduct controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

async function updateFeaturedProductsCache() {
  try {
    // The lean() method  is used to return plain JavaScript objects instead of full Mongoose documents. This can significantly improve performance

    const featuredProducts = await Product.find({ isFeatured: true }).lean();
    await redis.set("featured_products", JSON.stringify(featuredProducts));
  } catch (error) {
    console.log("error in update cache function");
  }
}

// دالة مساعدة: مسح صورة من Cloudinary بالـ URL
const deleteCloudinaryImage = async (url) => {
  if (!url) return;
  try {
    const publicId = url.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(`products/${publicId}`);
  } catch (error) {
    console.log("error deleting image from cloudinary", error.message);
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
    const allowed = [
      "name",
      "description",
      "price",
      "category",
      "discount",
      "unit",
      "stock",
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) product[key] = req.body[key];
    });

    // صورة جديدة اختيارية: نرفعها ونمسح القديمة
    if (req.file) {
      const uploadResponse = await streamUpload(req);
      await deleteCloudinaryImage(product.image);
      product.image = uploadResponse.secure_url;
    }

    const updated = await product.save();
    res.json({
      success: true,
      message: "Product updated successfully",
      product: updated,
    });
  } catch (error) {
    console.error("Error in updateProduct controller:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
