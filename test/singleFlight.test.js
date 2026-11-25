import test from "node:test";
import assert from "node:assert/strict";
import {createSingleFlight} from "../src/utils/singleFlight.js";
test("identical pending reads share work but completed values are not cached",async()=>{
 const run=createSingleFlight();let calls=0,release;
 const load=()=>{calls++;return new Promise(r=>{release=r;});};
 const a=run("public:1",load),b=run("public:1",load);
 assert.equal(a,b);
 await Promise.resolve();assert.equal(calls,1);
 release("first");assert.deepEqual(await Promise.all([a,b]),["first","first"]);
 assert.equal(await run("public:1",()=>{calls++;return "fresh";}),"fresh");assert.equal(calls,2);
});
test("different keys never share a result; errors are evicted and capacity is bounded",async()=>{
 const run=createSingleFlight(1);let release;
 const a=run("a",()=>new Promise(r=>{release=r;}));
 assert.equal(await run("b",()=>2),2);
 release(1);assert.equal(await a,1);
 await assert.rejects(run("a",()=>{throw Error("temporary");}));
 assert.equal(await run("a",()=>3),3);
});
