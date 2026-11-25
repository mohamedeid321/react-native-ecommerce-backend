const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
export function allowedOrigins() {
  return new Set((process.env.CLIENT_URL || "http://localhost:5173").split(",").map(v => v.trim()).filter(Boolean));
}
export const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins().has(origin));
  },
  allowedHeaders: ["Content-Type", "Authorization", "X-Lotta-CSRF", "Idempotency-Key"],
};
export function browserSecurity(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get("Origin");
  const hasCookie = /(?:^|;\s*)lotta_(?:access|refresh)=/.test(req.headers.cookie || "");
  if (!origin && !hasCookie) return next();
  if (!origin || !allowedOrigins().has(origin) || req.get("X-Lotta-CSRF") !== "1") {
    return res.status(403).json({ success: false, message: "Request origin or CSRF header rejected" });
  }
  next();
}
