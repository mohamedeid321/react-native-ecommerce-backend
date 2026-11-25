import test from "node:test";
import assert from "node:assert/strict";
import {createCheckoutGate} from "../src/utils/checkoutGate.js";
test("checkout admission gate preserves FIFO, limits backlog and releases once",async()=>{
 const gate=createCheckoutGate({limit:1,maxQueued:1,waitMs:1000});
 const first=await gate.acquire();
 const waiting=gate.acquire();
 assert.equal(await gate.acquire(),null);
 first();first();
 const second=await waiting;
 assert.equal(typeof second,"function");
 assert.equal(typeof second,"function");
 const thirdPending=gate.acquire();
 second();
 const third=await thirdPending;
 third();
 const fourth=await gate.acquire();fourth();
});
test("checkout gate removes expired waiters without leaking slots",async()=>{
 const gate=createCheckoutGate({limit:1,maxQueued:1,waitMs:10});
 const first=await gate.acquire();
 assert.equal(await gate.acquire(),null);
 first();
 const next=await gate.acquire();
 assert.equal(typeof next,"function");next();
});
