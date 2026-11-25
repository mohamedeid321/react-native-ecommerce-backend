import { createHash } from "node:crypto";
import { getRedis } from "../lib/redis.js";
const increment = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
export function authRateLimit(scope, limit=20, seconds=900) {
  return async (req,res,next) => {
    const digest = createHash("sha256").update(String(req.ip || "unknown")).digest("hex");
    try {
      const count = await getRedis().eval(increment,1,"lotta:rate:"+scope+":"+digest,seconds);
      if (Number(count)>limit) {
        res.set("Retry-After",String(seconds));
        return res.status(429).json({message:"Too many requests"});
      }
      next();
    } catch { return res.status(503).json({message:"Authentication service unavailable"}); }
  };
}
