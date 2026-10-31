import mongoose from "mongoose";

// إشعار داخل التطبيق (بيظهر في شاشة الإشعارات وعداد الجرس)
// audience = "user": لمستخدم محدد | "admin": لكل الـ admins
const notificationSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ["user", "admin"], default: "user", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    data: {
      type: { type: String, default: "" }, // order
      orderId: { type: String, default: "" },
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
