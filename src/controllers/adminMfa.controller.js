import {timingSafeEqual,createHmac} from "node:crypto";
import User from "../models/user.model.js";
import { getRedis } from "../lib/redis.js";
import { createTotp, encryptTotp, decryptTotp, verifyTotp } from "../utils/adminTotp.js";
const validEnrollmentToken=(provided)=>{const expected=process.env.MFA_ENROLLMENT_TOKEN;if(typeof provided!=="string"||!expected||expected.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected))return false;return timingSafeEqual(Buffer.from(provided),Buffer.from(expected));};
export async function checkAdminCode(user,code) {
  if (!user.mfaSecret || !verifyTotp(decryptTotp(user.mfaSecret),code)) return false;
  return (await getRedis().set("lotta:mfa:used:"+user.id+":"+createHmac("sha256",process.env.MFA_ENCRYPTION_KEY).update(code).digest("hex"),"1","EX",90,"NX")) === "OK";
}
async function adminWithPassword(req) {
  const {email,password}=req.body || {};
  if(typeof email!=="string" || typeof password!=="string" || Buffer.byteLength(password)>72) return null;
  const user=await User.findOne({email:email.trim().toLowerCase(),role:"admin"}).select("+mfaSecret");
  return user && !user.disabled && await user.comparePassword(password) ? user : null;
}
export async function enrollAdminMfa(req,res) {
  const user=await adminWithPassword(req);
  if(!user) return res.sendStatus(401);
  if(user.mfaSecret) return res.sendStatus(409);
  // Enrollment requires an out-of-band operator authorization.
  if(!validEnrollmentToken(req.body?.enrollmentToken)) return res.sendStatus(403);
  const {secret,uri}=createTotp(user.email);
  await getRedis().set("lotta:mfa:pending:"+user.id,encryptTotp(secret),"EX",300);
  res.set("Cache-Control","no-store");
  return res.json({uri});
}
export async function confirmAdminMfa(req,res) {
  const user=await adminWithPassword(req);
  if(!user) return res.sendStatus(401);
  if(!validEnrollmentToken(req.body?.enrollmentToken)) return res.sendStatus(403);
  const pending=await getRedis().get("lotta:mfa:pending:"+user.id);
  if(!pending || !verifyTotp(decryptTotp(pending),req.body.code)) return res.sendStatus(400);
  const result=await User.updateOne({_id:user.id,mfaSecret:{$exists:false}},{$set:{mfaSecret:pending}});
  if(result.modifiedCount!==1) return res.sendStatus(409);
  await getRedis().del("lotta:mfa:pending:"+user.id);
  return res.sendStatus(204);
}
