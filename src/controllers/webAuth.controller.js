import User from "../models/user.model.js";
import { getRedis } from "../lib/redis.js";
import { createSessionStore } from "../lib/sessionStore.js";
import { signAccessToken, verifyAccessToken } from "../utils/sessionTokens.js";
import { setAuthCookies, clearAuthCookies, readCookie } from "../utils/authCookies.js";
const store = () => createSessionStore(getRedis());
const publicUser = u => ({ id: u.id, username: u.username, email: u.email, phone: u.phone, role: u.role, profileImage: u.profileImage });
export async function webLogin(req,res) {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || Buffer.byteLength(password) > 72) return res.status(400).json({message:"Invalid credentials"});
  const user = await User.findOne({email:email.trim().toLowerCase()});
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({message:"Invalid credentials"});
  const session = await store().create(user.id);
  setAuthCookies(res, signAccessToken(user.id, session.sessionId), session.refreshToken);
  return res.json({user:publicUser(user)});
}
export async function webRefresh(req,res) {
  const session = await store().rotate(readCookie(req,"lotta_refresh"));
  if (!session) { clearAuthCookies(res); return res.status(401).json({message:"Session expired"}); }
  const user = await User.findById(session.userId);
  if (!user) { await store().revoke(session.sessionId); clearAuthCookies(res); return res.status(401).json({message:"Session expired"}); }
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
