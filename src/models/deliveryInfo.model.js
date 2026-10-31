import mongoose from "mongoose";
import { CITIES, GOVERNORATE, MAX_NEIGHBORHOOD } from "../config/shop.js";

// معلومات التوصيل: جزء من حساب العميل (واحدة لكل مستخدم)
const deliveryInfoSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    city: { type: String, enum: CITIES, required: true },
    governorate: { type: String, default: GOVERNORATE, enum: [GOVERNORATE] },
    neighborhood: { type: Number, required: true, min: 1, max: MAX_NEIGHBORHOOD }, // المجاورة
    building: { type: String, required: true, trim: true }, // عمارة
    apartment: { type: String, required: true, trim: true }, // شقة
    floor: { type: String, required: true, trim: true }, // الدور
    street: { type: String, trim: true, default: "" }, // اختياري
    landmark: { type: String, trim: true, default: "" }, // اختياري
    phone1: { type: String, required: true, trim: true },
    phone2: { type: String, trim: true, default: "" }, // اختياري
  },
  { timestamps: true },
);

export default mongoose.models.DeliveryInfo || mongoose.model("DeliveryInfo", deliveryInfoSchema);
