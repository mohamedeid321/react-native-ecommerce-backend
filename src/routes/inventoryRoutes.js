import express from "express";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import Purchase from "../models/purchase.model.js";
import InventoryMovement from "../models/inventoryMovement.model.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {fail,isValidId,serverError} from "../utils/http.js";
import {cairoDate,validDate,cairoDayStart,shiftDay} from "../utils/financeDates.js";
import {round2} from "../utils/pricing.js";
const router=express.Router();
router.use(protectRoute,adminRoute);
const types=["opening","adjustment_in","adjustment_out","waste"];
const roundQty=n=>Math.round(n*1000)/1000;
router.get("/",async(req,res)=>{
 try{
 const date=req.query.date??cairoDate();
 if(!validDate(date))return fail(res,400,"Invalid date");
 const end=cairoDayStart(shiftDay(date,1));
 const [purchases,deliveries,movements]=await Promise.all([
 Purchase.aggregate([{$match:{date:{$lte:date}}},{$group:{_id:"$product",quantity:{$sum:"$quantity"}}}]),
 Order.aggregate([{$match:{courierDeliveredAt:{$type:"date",$lt:end},status:{$in:["out_for_delivery","delivered"]}}},{$unwind:"$items"},{$group:{_id:"$items.product",quantity:{$sum:"$items.quantity"}}}]),
 InventoryMovement.aggregate([{$match:{date:{$lte:date}}},{$group:{_id:{product:"$product",type:"$type"},quantity:{$sum:"$quantity"}}}])
 ]);
 const ids=[...new Set([...purchases.map(p=>String(p._id)),...deliveries.map(p=>String(p._id)),...movements.map(m=>String(m._id.product))])].filter(isValidId);
 const products=await Product.find({$or:[{isActive:{$ne:false}},{_id:{$in:ids}}]}).select("name unit stock isActive").lean();
 const pMap=new Map(purchases.map(p=>[String(p._id),p.quantity])),dMap=new Map(deliveries.map(p=>[String(p._id),p.quantity]));
 const mMap=new Map(movements.map(m=>[String(m._id.product)+":"+m._id.type,m.quantity]));
 const byId=new Map(products.map(p=>[String(p._id),p]));
 const all=[...new Set([...byId.keys(),...ids])];
 const items=all.map(id=>{
 const p=byId.get(id),purchased=roundQty(pMap.get(id)??0),delivered=roundQty(dMap.get(id)??0);
 const opening=roundQty(mMap.get(id+":opening")??0),adjustmentIn=roundQty(mMap.get(id+":adjustment_in")??0),adjustmentOut=roundQty(mMap.get(id+":adjustment_out")??0),waste=roundQty(mMap.get(id+":waste")??0);
 const physicalBalance=roundQty(opening+purchased+adjustmentIn-delivered-adjustmentOut-waste);
 return {product:id,name:p?.name??"Unknown",unit:p?.unit??"",currentAvailableStock:p?.stock??null,opening,purchased,delivered,adjustmentIn,adjustmentOut,waste,physicalBalance,needsReconciliation:physicalBalance<0};
 }).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
 res.set("Cache-Control","no-store");res.json({success:true,date,basis:"recorded_purchases_minus_reported_deliveries_plus_adjustments",includesUndeliveredStockInTransit:true,requiresOpeningBalanceReconciliation:true,items,unlinkedDeliveredQuantity:roundQty(deliveries.filter(p=>!isValidId(p._id)).reduce((s,p)=>s+p.quantity,0))});
 }catch(e){serverError(res,e,"inventoryReport");}
});
router.get("/movements",async(req,res)=>{
 try{
 const date=req.query.date??cairoDate();if(!validDate(date))return fail(res,400,"Invalid date");
 const page=Math.min(10000,Math.max(1,parseInt(req.query.page)||1)),filter={date};
 if(req.query.product!==undefined){if(typeof req.query.product!=="string"||!isValidId(req.query.product))return fail(res,400,"Invalid product");filter.product=req.query.product;}
 const [movements,count]=await Promise.all([InventoryMovement.find(filter).sort({createdAt:-1}).skip((page-1)*50).limit(50),InventoryMovement.countDocuments(filter)]);
 res.set("Cache-Control","no-store");res.json({success:true,date,movements,count,page});
 }catch(e){serverError(res,e,"listInventoryMovements");}
});
router.post("/movements",async(req,res)=>{
 try{
 const key=req.get("Idempotency-Key"),{date=cairoDate(),product,type,quantity,unitCost,reason}=req.body??{};
 if(!key||!/^[a-zA-Z0-9_-]{16,128}$/.test(key)||!validDate(date)||date>cairoDate()||typeof product!=="string"||!isValidId(product)||!types.includes(type)||typeof quantity!=="number"||!Number.isFinite(quantity)||quantity<0.001||quantity>1000000||Math.abs(quantity-roundQty(quantity))>1e-9||typeof reason!=="string"||!reason.trim()||reason.length>300||(unitCost!==undefined&&(typeof unitCost!=="number"||!Number.isFinite(unitCost)||unitCost<0||unitCost>1000000||Math.abs(unitCost-round2(unitCost))>1e-9)))return fail(res,400,"Invalid inventory movement");
 const same=m=>m.date===date&&String(m.product)===product&&m.type===type&&m.quantity===quantity&&m.unitCost===unitCost&&m.reason===reason.trim();
 const replay=async()=>{const m=await InventoryMovement.findOne({requestKey:key});if(!m||!same(m))return fail(res,409,"Idempotency key conflict");return res.json({success:true,movement:m});};
 if(await InventoryMovement.exists({requestKey:key}))return replay();
 if(!await Product.exists({_id:product}))return fail(res,404,"Product not found");
 try{const movement=await InventoryMovement.create({date,product,type,quantity,unitCost,reason:reason.trim(),recordedBy:req.user._id,requestKey:key});return res.status(201).json({success:true,movement});}
 catch(e){if(e.code===11000)return replay();throw e;}
 }catch(e){serverError(res,e,"recordInventoryMovement");}
});
export default router;
