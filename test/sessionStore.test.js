import test from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import {createSessionStore} from "../src/lib/sessionStore.js";
import {randomBytes} from "node:crypto";
test("Redis rotation, replay detection and logout all",{skip:!process.env.TEST_REDIS_URL},async()=>{
 const redis=new Redis(process.env.TEST_REDIS_URL,{maxRetriesPerRequest:1});
 const store=createSessionStore(redis), userId=randomBytes(12).toString("hex");
 const sessions=[];
 try {
  const a=await store.create(userId), b=await store.create(userId);
  sessions.push(a.sessionId,b.sessionId);
  assert.equal(await store.active(a.sessionId,userId),true);
  const rotated=await store.rotate(a.refreshToken);
  assert.ok(rotated);
  assert.notEqual(rotated.refreshToken,a.refreshToken);
  assert.equal(await store.rotate(a.refreshToken),null);
  assert.equal(await store.active(a.sessionId,userId),false);
  assert.equal(await store.active(b.sessionId,userId),true);
  await store.revokeAll(userId);
  assert.equal(await store.active(b.sessionId,userId),false);
  assert.equal(await store.rotate(b.refreshToken),null);
 } finally {
  for(const sid of sessions) await store.revoke(sid);
  await redis.del("lotta:auth:generation:"+userId);
  await redis.quit();
 }
});
