import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import User from "../models/user.model.js";
import { getRedis } from "../lib/redis.js";
import { createSessionStore } from "../lib/sessionStore.js";
import { signAccessToken } from "../utils/sessionTokens.js";
import { setAuthCookies } from "../utils/authCookies.js";

export async function googleLogin(req,res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({message:"Google sign-in unavailable"});
  const credential = req.body?.credential;
  if (typeof credential !== "string" || credential.length > 12000) return res.status(400).json({message:"Invalid Google credential"});
  let p;
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({idToken:credential,audience:clientId});
    p = ticket.getPayload();
  } catch { return res.status(401).json({message:"Invalid Google credential"}); }
  if (!p?.sub || !p.email || p.email_verified !== true) return res.status(401).json({message:"Verified Google email required"});
  const email = p.email.trim().toLowerCase();
  let user = await User.findOne({googleSub:p.sub});
  if (!user) {
    if (await User.exists({email})) return res.status(409).json({message:"Sign in to your existing account first"});
    try {
      user = await User.create({googleSub:p.sub,email,username:"google-"+randomBytes(12).toString("hex"),displayName:String(p.name || "").slice(0,80),password:randomBytes(32).toString("hex"),role:"customer"});
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({message:"Account already exists; retry sign-in"});
      throw error;
    }
  }
  if (user.role !== "customer") return res.status(403).json({message:"Google sign-in restricted to customer accounts"});
  const session = await createSessionStore(getRedis()).create(user.id);
  setAuthCookies(res,signAccessToken(user.id,session.sessionId),session.refreshToken);
  return res.json({user:{id:user.id,username:user.username,displayName:user.displayName,email:user.email,phone:user.phone,role:user.role},profileIncomplete:!user.phone});
}

export async function linkGoogle(req,res) {
  if (req.user.role !== "customer") return res.sendStatus(403);
  const {credential,password} = req.body || {};
  if (!process.env.GOOGLE_CLIENT_ID) return res.sendStatus(503);
  if (typeof credential !== "string" || credential.length > 12000 || typeof password !== "string" || Buffer.byteLength(password)>72) return res.sendStatus(400);
  const user = await User.findById(req.user.id).select("+googleSub");
  if (!user || !(await user.comparePassword(password))) return res.sendStatus(401);
  let p;
  try { p = (await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({idToken:credential,audience:process.env.GOOGLE_CLIENT_ID})).getPayload(); }
  catch { return res.sendStatus(401); }
  if (!p?.sub || p.email_verified !== true || p.email?.trim().toLowerCase() !== user.email.trim().toLowerCase()) return res.sendStatus(403);
  if (user.googleSub === p.sub) return res.sendStatus(204);
  if (user.googleSub) return res.sendStatus(409);
  try {
    const result = await User.updateOne({_id:user.id,googleSub:{$exists:false}},{$set:{googleSub:p.sub}});
    return res.sendStatus(result.modifiedCount === 1 ? 204 : 409);
  } catch(error) { if(error.code===11000) return res.sendStatus(409); throw error; }
}
