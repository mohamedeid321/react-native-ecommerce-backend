import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { readCookie } from "../utils/authCookies.js";
import { verifyAccessToken } from "../utils/sessionTokens.js";
import { getRedis } from "../lib/redis.js";
import { createSessionStore } from "../lib/sessionStore.js";

export const protectRoute = async (req,res,next) => {
  const cookie = readCookie(req,"lotta_access");
  const bearer = req.get("Authorization");
  let decoded;
  try {
    if (cookie) decoded = verifyAccessToken(cookie);
    else if (bearer?.startsWith("Bearer ")) decoded = jwt.verify(bearer.slice(7),process.env.JWT_SECRET,{algorithms:["HS256"]});
    else return res.status(401).json({message:"Authentication required"});
    if (!/^[a-f0-9]{24}$/i.test(decoded.userId || "")) throw new Error("Invalid claims");
  } catch { return res.status(401).json({message:"Invalid or expired token"}); }
  try {
    if (cookie && !(await createSessionStore(getRedis()).active(decoded.sid,decoded.userId))) return res.status(401).json({message:"Session expired"});
    const user = await User.findById(decoded.userId).select("-password");
    if (!user || user.disabled) return res.status(401).json({message:"Authentication required"});
    if (user.role === "admin" && (!cookie || !(await createSessionStore(getRedis()).active(decoded.sid,decoded.userId,true)))) return res.status(403).json({message:"Admin MFA web login required"});
    if (user.role === "delivery" && !cookie) return res.status(403).json({message:"Courier web login required"});
    req.user = user;
    next();
  } catch { return res.status(503).json({message:"Authentication service unavailable"}); }
};
export const adminRoute = (req,res,next) => req.user?.role === "admin" ? next() : res.status(403).json({message:"Access denied - Admin only"});
