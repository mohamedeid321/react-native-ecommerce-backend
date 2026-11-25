import { newSessionId, newRefreshToken, parseRefreshToken, REFRESH_SECONDS } from "../utils/sessionTokens.js";

const key = id => "lotta:auth:session:" + id;
const ROTATE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'missing' end
local s = cjson.decode(raw)
if s.hash ~= ARGV[1] then
  if s.used and s.used[ARGV[1]] then
    redis.call('DEL', KEYS[1])
    return 'reuse'
  end
  return 'invalid'
end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 'missing' end
s.used = s.used or {}
local count = 0
for _ in pairs(s.used) do count = count + 1 end
if count >= 1000 then redis.call('DEL', KEYS[1]); return 'missing' end
s.used[s.hash] = true
s.hash = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(s), 'EX', ttl)
return s.userId
`;

export function createSessionStore(redis) {
  return {
    async create(userId) {
      const sessionId = newSessionId();
      const refreshToken = newRefreshToken(sessionId);
      const { hash } = parseRefreshToken(refreshToken);
      const result = await redis.set(key(sessionId), JSON.stringify({ userId: String(userId), hash }), "EX", REFRESH_SECONDS, "NX");
      if (result !== "OK") throw new Error("Session creation failed");
      return { sessionId, refreshToken };
    },
    async rotate(token) {
      const parsed = parseRefreshToken(token);
      if (!parsed) return null;
      const refreshToken = newRefreshToken(parsed.sessionId);
      const result = await redis.eval(ROTATE, 1, key(parsed.sessionId), parsed.hash, parseRefreshToken(refreshToken).hash);
      if (!/^[a-f0-9]{24}$/i.test(String(result))) return null;
      return { userId: String(result), sessionId: parsed.sessionId, refreshToken };
    },
    async active(sessionId, userId) {
      const raw = await redis.get(key(sessionId));
      return !!raw && JSON.parse(raw).userId === String(userId);
    },
    async revoke(sessionId) { await redis.del(key(sessionId)); }
  };
}
