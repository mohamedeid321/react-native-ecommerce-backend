import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { authenticator } from "otplib";
function key() {
  const value = process.env.MFA_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("MFA encryption key missing or invalid");
  return Buffer.from(value,"hex");
}
export function encryptTotp(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key(),iv);
  const data = Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(x=>x.toString("hex")).join(".");
}
export function decryptTotp(value) {
  const [iv,tag,data] = value.split(".").map(x=>Buffer.from(x,"hex"));
  const cipher = createDecipheriv("aes-256-gcm",key(),iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8");
}
export function createTotp(email) {
  const secret = authenticator.generateSecret(20);
  return {secret,uri:authenticator.keyuri(email,"Lotta Admin",secret)};
}
export function verifyTotp(secret,code) {
  return typeof code === "string" && /^\d{6}$/.test(code) && authenticator.check(code,secret);
}
