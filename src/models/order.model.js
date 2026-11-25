import mongoose from "mongoose";
import { ORDER_STATUSES } from "../config/shop.js";

// الطلب بيحفظ نسخة (snapshot) من المنتجات والأسعار وقت الطلب
// عشان لو المنتج اتعدل أو اتمسح الفاتورة القديمة تفضل زي ما هي
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: Number, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        image: { type: String, default: "" },
        unit: { type: String, default: "" },
        unitPrice: { type: Number, required: true }, // بعد الخصم وقت الطلب
        quantity: { type: Number, required: true, min: 0.001, max: 99 },
        lineTotal: { type: Number, required: true },
      },
    ],
    courier: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedAt: Date,
    routeSequence: { type: Number, min: 1, max: 10000 },
    courierDeliveredAt: Date,
    collectedAmount: { type: Number, min: 0 },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    checkoutKey: { type: String, maxlength: 128, select: false },
    deliveryDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    paymentMethod: { type: String, enum: ["cod"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    delivery: {
      city: String,
      governorate: String,
      neighborhood: Number,
      building: String,
      apartment: String,
      floor: String,
      street: String,
      landmark: String,
      phone1: String,
      phone2: String,
    },
    customer: { username: String, email: String }, // للعرض عند الـ admin
    status: { type: String, enum: ORDER_STATUSES, default: "placed", index: true },
    statusHistory: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
    cancelledBy: { type: String, enum: ["customer", "admin", ""], default: "" },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({courier:1,deliveryDate:1,status:1});
orderSchema.index({user:1,checkoutKey:1},{unique:true,partialFilterExpression:{checkoutKey:{$type:"string"}}});
orderSchema.set("toJSON",{transform(doc,ret){delete ret.checkoutKey;return ret;}});

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
