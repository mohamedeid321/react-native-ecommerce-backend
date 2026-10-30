import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    // 1. التأكد من وجود الـ Header وأنه يبدأ بكلمة Bearer
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No authentication token, access denied",
      });
    }

    // 2. استخراج التوكن بأمان من غير مشاكل الـ replace
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No authentication token, access denied",
      });
    }

    // 3. فك تشفير التوكن والتحقق منه
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. البحث عن المستخدم وإرفاقه بـ req
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is not valid - User not found",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Token is not valid",
      error: error.message,
    });
  }
};
export const adminRoute = (req, res, next) => {
  if (req.user && req.user?.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Access denied - Admin only" });
  }
};
