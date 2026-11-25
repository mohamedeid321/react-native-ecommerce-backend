import { ACCESS_SECONDS, REFRESH_SECONDS } from "./sessionTokens.js";

const production = () => process.env.NODE_ENV === "production";
const base = () => ({ httpOnly: true, secure: production(), sameSite: "lax" });
const accessOptions = () => ({ ...base(), path: "/api" });
const refreshOptions = () => ({ ...base(), path: "/api/auth" });

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("lotta_access", accessToken, { ...accessOptions(), maxAge: ACCESS_SECONDS * 1000 });
  res.cookie("lotta_refresh", refreshToken, { ...refreshOptions(), maxAge: REFRESH_SECONDS * 1000 });
  res.set("Cache-Control", "no-store");
}
export function clearAuthCookies(res) {
  res.clearCookie("lotta_access", accessOptions());
  res.clearCookie("lotta_refresh", refreshOptions());
  res.set("Cache-Control", "no-store");
}
export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const entry of raw.split(";")) {
    const i = entry.indexOf("=");
    if (i < 0 || entry.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(entry.slice(i + 1).trim()); } catch { return null; }
  }
  return null;
}
