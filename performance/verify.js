import mongoose from "mongoose";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import Order from "../src/models/order.model.js";
import Product from "../src/models/product.model.js";
import Cart from "../src/models/cart.model.js";
if(process.env.CI!=="true"||process.env.MONGO_URI!=="mongodb://127.0.0.1:27017/lotta_performance")throw Error("Isolated CI database only");
const f=JSON.parse(await readFile("performance/fixture.json","utf8"));
await mongoose.connect(process.env.MONGO_URI);
try{
 const orders=await Order.find().lean();
 const stock=(await Product.findById(f.productId)).stock;
 const carts=await Cart.find({user:{$in:f.accounts.slice(0,60).map(a=>a.id)}}).lean();
 assert.equal(orders.length,30);
 assert.equal(new Set(orders.map(o=>String(o.user))).size,30);
 assert.equal(new Set(orders.map(o=>o.orderNumber)).size,30);
 assert.ok(orders.every(o=>o.items.length===1&&o.items[0].quantity===1&&String(o.items[0].product)===f.productId&&o.total===30));
 assert.equal(stock,0);
 assert.equal(carts.filter(c=>c.items.length===0).length,30);
 assert.equal(carts.filter(c=>c.items.length===1&&c.items[0].quantity===1).length,30);
 console.log("PERF_INVARIANTS "+JSON.stringify({orders:orders.length,uniqueCustomers:30,duplicateOrders:0,remainingStock:stock,clearedCarts:30,preservedRejectedCarts:30}));
}finally{await mongoose.disconnect();}
