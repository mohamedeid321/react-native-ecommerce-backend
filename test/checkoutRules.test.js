import test from "node:test";
import assert from "node:assert/strict";
import {scheduledDeliveryDate} from "../src/utils/deliverySchedule.js";
import {computeTotals} from "../src/utils/pricing.js";
test("Cairo delivery cutoff in winter and summer",()=>{
 assert.equal(scheduledDeliveryDate(new Date("2026-11-25T19:59:59Z")),"2026-11-26");
 assert.equal(scheduledDeliveryDate(new Date("2026-11-25T20:00:00Z")),"2026-11-27");
 assert.equal(scheduledDeliveryDate(new Date("2026-07-01T18:59:59Z")),"2026-07-02");
 assert.equal(scheduledDeliveryDate(new Date("2026-07-01T19:00:00Z")),"2026-07-03");
 assert.equal(scheduledDeliveryDate(new Date("2026-12-31T20:00:00Z")),"2027-01-02");
});
test("delivery fee boundaries",()=>{
 assert.equal(computeTotals([{unitPrice:699.99,quantity:1}]).deliveryFee,30);
 assert.equal(computeTotals([{unitPrice:700,quantity:1}]).deliveryFee,0);
 assert.equal(computeTotals([{unitPrice:20,quantity:1}],{firstOrder:true}).deliveryFee,0);
 assert.equal(computeTotals([]).deliveryFee,0);
});
