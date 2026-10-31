import mongoose from "mongoose";

// توكن إشعارات الموبايل (Expo push token) لكل جهاز مسجل دخول
const pushTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer", index: true },
    platform: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.models.PushToken || mongoose.model("PushToken", pushTokenSchema);
