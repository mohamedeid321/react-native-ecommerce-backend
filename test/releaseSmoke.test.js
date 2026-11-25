import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {randomBytes} from "node:crypto";
import {performance} from "node:perf_hooks";
test("release smoke: full Express app and concurrent read traffic",{skip:!process.env.TEST_MONGO_URI||!process.env.TEST_REDIS_URL,timeout:60000},async()=>{
 process.env.VERCEL="1";
 process.env.REDIS_URL=process.env.TEST_REDIS_URL;
 process.env.JWT_ACCESS_SECRET=randomBytes(32).toString("hex");
 process.env.CLIENT_URL="http://localhost:5173";
 await mongoose.connect(process.env.TEST_MONGO_URI,{dbName:"lotta_release_test_"+randomBytes(8).toString("hex")});
 const {default:app}=await import("../src/index.js");
 const {getRedis}=await import("../src/lib/redis.js");
 const server=app.listen(0);await new Promise(r=>server.once("listening",r));
 const base="http://127.0.0.1:"+server.address().port;
 try{
 const live=await fetch(base+"/api/health/live");assert.equal(live.status,200);assert.equal(live.headers.get("x-powered-by"),null);
 const ready=await fetch(base+"/api/health/ready");assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{status:"ready"});
 assert.equal((await fetch(base+"/api/admin/dashboard")).status,401);
 assert.equal((await fetch(base+"/api/not-found")).status,404);
 const bad=await fetch(base+"/api/auth/web/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://localhost:5173","X-Lotta-CSRF":"1"},body:"{"});
 assert.equal(bad.status,400);assert.equal((await bad.json()).message,"Invalid JSON");
 const routes=["/api/products","/api/categories","/api/settings","/api/banners","/api/health/live"];
 const timings=[];const started=performance.now();
 await Promise.all(Array.from({length:12},(_,worker)=>(async()=>{
 for(let i=0;i<10;i++){const t=performance.now();const r=await fetch(base+routes[(worker+i)%routes.length]);assert.equal(r.status,200);await r.json();timings.push(performance.now()-t);}
 })()));
 timings.sort((a,b)=>a-b);
 const p95=timings[Math.ceil(timings.length*.95)-1];
 console.log("RELEASE_LOAD_SMOKE "+JSON.stringify({requests:timings.length,concurrency:12,errors:0,p95Ms:Math.round(p95),elapsedMs:Math.round(performance.now()-started)}));
 assert.ok(p95<5000,"local read latency exceeds smoke threshold");
 }finally{await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect();await getRedis().quit();}
});
