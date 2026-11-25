import test from "node:test";
import assert from "node:assert/strict";
import {newSessionId,newRefreshToken,parseRefreshToken,signAccessToken,verifyAccessToken} from "../src/utils/sessionTokens.js";
process.env.JWT_ACCESS_SECRET="test-only-secret-not-for-production-123456789";
const userId="507f1f77bcf86cd799439011";
test("refresh tokens are opaque, unique and hashed",()=>{
 const sid=newSessionId(), a=newRefreshToken(sid), b=newRefreshToken(sid);
 assert.notEqual(a,b);
 assert.equal(parseRefreshToken(a).sessionId,sid);
 assert.match(parseRefreshToken(a).hash,/^[a-f0-9]{64}$/);
 assert.notEqual(parseRefreshToken(a).hash,parseRefreshToken(b).hash);
 for(const value of [null,undefined,"bad",{},a+"x"]) assert.equal(parseRefreshToken(value),null);
});
test("access tokens have a 15 minute lifetime and valid claims",()=>{
 const sid=newSessionId(), token=signAccessToken(userId,sid), claims=verifyAccessToken(token);
 assert.equal(claims.userId,userId);
 assert.equal(claims.sid,sid);
 assert.equal(claims.exp-claims.iat,900);
 assert.throws(()=>verifyAccessToken(token+"x"));
 assert.throws(()=>verifyAccessToken(newRefreshToken(sid)));
});
