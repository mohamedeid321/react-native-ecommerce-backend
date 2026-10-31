import mongoose from "mongoose";

// المنتجات اللي عجبت المستخدم (القلب)
const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true },
);

export default mongoose.models.Wishlist || mongoose.model("Wishlist", wishlistSchema);
