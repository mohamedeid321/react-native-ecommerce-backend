import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";

export const ACCESS_SECONDS = 900;
export const REFRESH_SECONDS = 604800;
export const newSessionId = () => randomBytes(24).toString("hex");
export const newRefreshToken = (sessionId) => {
  if (!/^[a-f0-9]{48}$/.test(sessionId)) throw new Error("Invalid session ID");
  return sessionId + "." + randomBytes(32).toString("hex");
};
export const parseRefreshToken = (token) => {
  if (typeof token !== "string" || !/^[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return null;
  return { sessionId: token.split(".")[0], hash: createHash("sha256").update(token).digest("hex") };
};
const secret = () => {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes");
  return value;
};
export const signAccessToken = (userId, sessionId) => jwt.sign(
  { userId: String(userId), sid: sessionId, tokenType: "access" }, secret(),
  { algorithm: "HS256", expiresIn: ACCESS_SECONDS, issuer: "lotta", audience: "lotta-api" }
);
export const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, secret(), { algorithms: ["HS256"], issuer: "lotta", audience: "lotta-api" });
  if (payload.tokenType !== "access" || !/^[a-f0-9]{48}$/.test(payload.sid || "") || !/^[a-f0-9]{24}$/i.test(payload.userId || "")) throw new Error("Invalid access claims");
  return payload;
};
