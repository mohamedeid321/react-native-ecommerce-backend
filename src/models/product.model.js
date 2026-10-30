import mongoose from "mongoose";

// الأقسام المسموحة (نفس الـ ids الموجودة في constants/categories.js في الموبايل)
// لما تضيف قسم جديد في التطبيق ضيفه هنا كمان
export const CATEGORY_IDS = [
  "fruits",
  "vegetables",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "home",
  "fashion",
  "personal-care",
  "toys",
];

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "name is required"],
    },
    description: {
      type: String,
      required: [true, "description is required"],
    },
    // السعر قبل الخصم
    price: {
      type: Number,
      min: 0,
      required: [true, "price is required"],
    },
    // نسبة الخصم % (السعر بعد الخصم بيتحسب في finalPrice)
    discount: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // صورة الكارت (PNG من غير خلفية)
    image: {
      type: String,
      required: [true, "Image is required"],
    },
    // صورة صفحة التفاصيل (لو فاضية التطبيق بيستخدم image)
    detailImage: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: [true, "category is required"],
      enum: {
        values: CATEGORY_IDS,
        message: "category is not valid",
      },
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    unit: {
      type: String,
      default: "", // كجم، قطعة، علبة...
    },
    stock: {
      type: Number,
      min: 0,
      default: 0,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    reviewsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    // عشان finalPrice يظهر في الـ JSON اللي بيرجع للتطبيق
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  },
);

// السعر بعد الخصم (بيتحسب في الباك عشان كل الشاشات والسلة والطلبات تستخدم نفس الرقم)
productSchema.virtual("finalPrice").get(function () {
  const discount = this.discount || 0;
  return Math.round(this.price * (1 - discount / 100) * 100) / 100;
});

const Product = mongoose.model("Product", productSchema);

export default Product;
