import mongoose from "mongoose";

// سلة واحدة لكل مستخدم
const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, required: true, min: 0.001, max: 99 },
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true },
);

export default mongoose.models.Cart || mongoose.model("Cart", cartSchema);
