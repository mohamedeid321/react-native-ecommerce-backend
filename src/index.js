import express from "express";
import cors from "cors";
import helmet from "helmet";
import { corsOptions, browserSecurity } from "./middleware/browserSecurity.js";
import mongoose from "mongoose";
import "dotenv/config";

import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";

import bannerRoutes from "./routes/bannerRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import deliveryInfoRoutes from "./routes/deliveryInfoRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

import {getRedis} from "./lib/redis.js";
import { connectDB } from "./lib/db.js";

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors(corsOptions));
app.use(browserSecurity);
app.use(express.json({ limit: "100kb" }));

app.get("/api/health/live", (req,res)=>res.json({status:"ok"}));
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (error) {
    console.error("Database connection failed");
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.get("/api/health/ready",async(req,res)=>{
 try{await mongoose.connection.db.admin().ping();await getRedis().ping();res.set("Cache-Control","no-store");return res.json({status:"ready"});}
 catch{res.set("Cache-Control","no-store");return res.status(503).json({status:"unavailable"});}
});
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
//
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/delivery-info", deliveryInfoRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((req,res)=>res.status(404).json({success:false,message:"Not found"}));
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error.type==="entity.too.large"?413:error.type==="entity.parse.failed"?400:500;
 if(status===500)console.error("Unhandled request error",error?.name);
 res.status(status).json({success:false,message:status===413?"Request too large":status===400?"Invalid JSON":"Internal server error"});
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
