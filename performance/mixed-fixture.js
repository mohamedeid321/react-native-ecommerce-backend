import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import Product from '../src/models/product.model.js';
import Cart from '../src/models/cart.model.js';
import Order from '../src/models/order.model.js';
if(process.env.CI!=='true'||process.env.MONGO_URI!=='mongodb://127.0.0.1:27017/lotta_performance')throw Error('CI only');
const f=JSON.parse(await readFile('performance/fixture.json','utf8'));
await mongoose.connect(process.env.MONGO_URI);
try{
if(process.argv[2]==='prepare'){
assert.equal(await Order.countDocuments(),0);
const p=await Product.find({stock:1000}).sort({_id:1}).limit(20).lean();
assert.equal(p.length,20);
f.mixedProducts=p.map(x=>String(x._id));
await Cart.updateMany({},{$set:{items:[]}});
await writeFile('performance/fixture.json',JSON.stringify(f),{mode:0o600});
}else if(process.argv[2]==='verify'){
const orders=await Order.find().lean();assert.equal(orders.length,50);
assert.equal(new Set(orders.map(o=>o.orderNumber)).size,50);
assert.equal(new Set(orders.map(o=>String(o.user))).size,50);
const buyers=new Map(f.accounts.slice(0,50).map((a,i)=>[a.id,f.mixedProducts[i%20]]));
const expected=new Map(f.mixedProducts.map(id=>[id,1000]));
for(const o of orders){const p=buyers.get(String(o.user));assert.ok(p);assert.equal(o.items.length,1);assert.equal(String(o.items[0].product),p);assert.equal(o.items[0].quantity,2);assert.equal(o.total,60);assert.equal(o.deliveryFee,0);expected.set(p,expected.get(p)-2);}
for(const p of await Product.find({_id:{$in:f.mixedProducts}}))assert.equal(p.stock,expected.get(String(p._id)));
assert.equal(await Cart.countDocuments({user:{$in:[...buyers.keys()]},items:{$size:0}}),50);
console.log('MIXED_INVARIANTS: 50 unique orders, 100 units sold, stock reconciled, 50 cleared carts');
}else throw Error('Invalid mode');
}finally{await mongoose.disconnect();}
