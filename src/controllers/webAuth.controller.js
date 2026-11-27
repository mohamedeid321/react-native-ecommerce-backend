import { checkAdminCode } from "./adminMfa.controller.js";
import User from "../models/user.model.js";
import { getRedis } from "../lib/redis.js";
import { createSessionStore } from "../lib/sessionStore.js";
import { signAccessToken, verifyAccessToken } from "../utils/sessionTokens.js";
import { setAuthCookies, clearAuthCookies, readCookie } from "../utils/authCookies.js";
export function normalizePhone(value) {
  if (typeof value !== "string" || value.length > 32) return null;
  const p = value.replace(/[\s()-]/g, "").replace(/^0020/, "+20").replace(/^01/, "+201");
  return /^\+201[0125]\d{8}$/.test(p) ? p : null;
}
export async function webRegister(req,res) {
  const {username,email,phone,password} = req.body || {};
  const normalized = normalizePhone(phone);
  if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 80 ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !normalized || typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 72)
    return res.status(400).json({message:"Invalid registration details"});
  try {
    const user = await User.create({username:username.trim(),email:email.trim().toLowerCase(),phone:normalized,password,role:"customer"});
    const session = await store().create(user.id);
    setAuthCookies(res,signAccessToken(user.id,session.sessionId),session.refreshToken);
    return res.status(201).json({user:publicUser(user)});
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({message:"Account details already in use"});
    throw error;
  }
}
const store = () => createSessionStore(getRedis());
export const publicUser = u => ({ id: u.id, username: u.username, displayName:u.displayName, email: u.email, phone: u.phone, role: u.role, ...(u.role==="admin"?{adminPermissions:u.adminPermissions,adminJob:u.adminJob}:{}), profileImage: u.profileImage || ("https://api.dicebear.com/9.x/shapes/svg?seed="+u.id) });
export async function webLogin(req,res,adminOnly=false) {
  const { email, phone, identifier, password } = req.body || {};
  const loginId = identifier ?? email ?? phone;
  if (typeof loginId !== "string" || typeof password !== "string" || loginId.length > 254 || Buffer.byteLength(password) > 72) return res.status(400).json({message:"Invalid credentials"});
  const normalized = normalizePhone(loginId);
  const user = await User.findOne(normalized ? {phone:normalized} : {email:loginId.trim().toLowerCase()}).select("+mfaSecret");
  if (!user || user.disabled || (user.role === "admin") !== adminOnly || !(await user.comparePassword(password))) return res.status(401).json({message:"Invalid credentials"});
  if (user.role === "admin") {
    if (!user.mfaSecret) return res.status(403).json({message:"Admin MFA enrollment required"});
    if (!(await checkAdminCode(user,req.body.code))) return res.status(401).json({message:"MFA code required or invalid"});
  }
  const session = await store().create(user.id, user.role === "admin");
  setAuthCookies(res, signAccessToken(user.id, session.sessionId), session.refreshToken);
  return res.json({user:publicUser(user)});
}
export async function webRefresh(req,res) {
  const session = await store().rotate(readCookie(req,"lotta_refresh"));
  if (!session) { clearAuthCookies(res); return res.status(401).json({message:"Session expired"}); }
  const user = await User.findById(session.userId);
  if (!user || user.disabled || (user.role === "admin" && !(await store().active(session.sessionId,user.id,true)))) { await store().revoke(session.sessionId); clearAuthCookies(res); return res.status(401).json({message:"Session expired"}); }
  setAuthCookies(res,signAccessToken(user.id,session.sessionId),session.refreshToken);
  return res.json({user:publicUser(user)});
}
export async function webLogout(req,res) {
  let claims;
  try { claims = verifyAccessToken(readCookie(req,"lotta_access")); } catch {}
  if (claims) await store().revoke(claims.sid);
  else {
    const session = await store().rotate(readCookie(req,"lotta_refresh"));
    if (session) await store().revoke(session.sessionId);
  }
  clearAuthCookies(res);
  return res.sendStatus(204);
}
export function webMe(req,res) { res.set("Cache-Control","no-store"); return res.json({user:publicUser(req.user)}); }

export async function webLogoutAll(req,res) {
  await store().revokeAll(req.user.id);
  clearAuthCookies(res);
  return res.sendStatus(204);
}
export async function webCompleteProfile(req,res) {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({message:"Invalid phone"});
  if (req.user.phone) return res.status(409).json({message:"Phone already set"});
  try {
    const user = await User.findOneAndUpdate({_id:req.user.id,phone:{$exists:false}},{$set:{phone}},{new:true,runValidators:true});
    if (!user) return res.status(409).json({message:"Profile already updated"});
    return res.json({user:publicUser(user),phoneVerified:false});
  } catch(error) {
    if(error.code===11000) return res.status(409).json({message:"Phone already in use"});
    throw error;
  }
}
