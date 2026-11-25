import test from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import {randomBytes} from "node:crypto";
import {createPublicCache} from "../src/lib/publicCache.js";
test("Redis cache respects keys, invalidation and TTL",{skip:!process.env.TEST_REDIS_URL},async()=>{
 process.env.PUBLIC_CACHE_NAMESPACE="test-cache-"+randomBytes(8).toString("hex");
 const redis=new Redis(process.env.TEST_REDIS_URL);
 const cache=createPublicCache({redis:()=>redis,enabled:()=>true,timeoutMs:1000});
 try{
  let calls=0;
  const load=async()=>({value:++calls});
  assert.deepEqual(await cache.read("catalog","a",1000,load),{value:1});
  assert.deepEqual(await cache.read("catalog","a",1000,load),{value:1});
  assert.deepEqual(await cache.read("catalog","b",1000,load),{value:2});
  await cache.invalidate("catalog");
  assert.deepEqual(await cache.read("catalog","a",1000,load),{value:3});
  let start,release;
  const started=new Promise(r=>{start=r;});
  const inFlight=cache.read("search","race",1000,()=>{start();return new Promise(r=>{release=r;});});
  await started;await cache.invalidate("search");release({old:true});await inFlight;
  assert.deepEqual(await cache.read("search","race",1000,()=>({fresh:true})),{fresh:true});
  await cache.read("categories","ttl",30,()=>1);
  await new Promise(r=>setTimeout(r,60));
  assert.equal(await cache.read("categories","ttl",30,()=>2),2);
  assert.ok(cache.stats().hits>=1);
 }finally{await redis.quit();}
});
test("public cache failure bypasses Redis and returns authoritative data",async()=>{
 const cache=createPublicCache({redis:()=>({eval:async()=>{throw Error("offline");}}),enabled:()=>true});
 assert.equal(await cache.read("catalog","a",1000,()=>42),42);
 assert.equal(await cache.read("catalog","b",1000,()=>43),43);
 assert.equal(cache.stats().errors,1);
 assert.equal(cache.stats().bypasses,2);
});
test("disabled cache does not connect to Redis",async()=>{
 const cache=createPublicCache({redis:()=>{throw Error("unexpected connection");},enabled:()=>false});
 assert.equal(await cache.read("catalog","a",1000,()=>42),42);
 assert.equal(cache.stats().bypasses,1);
});
