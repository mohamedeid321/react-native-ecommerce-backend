import express from "express";
import Order from "../models/order.model.js";
import Purchase from "../models/purchase.model.js";
import OrderCost from "../models/orderCost.model.js";
import InventoryMovement from "../models/inventoryMovement.model.js";
import Expense from "../models/expense.model.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {fail,isValidId,serverError} from "../utils/http.js";
import {round2} from "../utils/pricing.js";
import {cairoDate,validDate,shiftDay,financeRange} from "../utils/financeDates.js";
const router=express.Router();
router.use(protectRoute,adminRoute);
const categories=["transport","packaging","labor","rent","utilities","marketing","other"];
router.get("/",async(req,res)=>{
 try{
 const range=financeRange(req.query);if(!range)return fail(res,400,"Invalid report range");
 const {from,to,start,end}=range,instant={$gte:start,$lt:end},dayRange={$gte:from,$lte:to};
 const [booked,delivered,collected,purchases,expenses,waste]=await Promise.all([
 Order.find({createdAt:instant,status:{$ne:"cancelled"}}).select("createdAt total").lean(),
 Order.find({approvedAt:instant,status:"delivered"}).select("approvedAt deliveryDate items subtotal deliveryFee total").lean(),
 Order.find({courierDeliveredAt:instant,collectedAmount:{$type:"number"}}).select("courierDeliveredAt collectedAmount approvedAt").lean(),
 Purchase.find({date:dayRange}).lean(),
 Expense.find({date:dayRange,voided:{$ne:true}}).lean(),
 InventoryMovement.find({date:dayRange,type:"waste"}).select("date quantity unitCost").lean()
 ]);
 const deliveryDays=[...new Set(delivered.map(o=>o.deliveryDate).filter(validDate))];
 const actualCosts=await Purchase.find({date:{$in:deliveryDays}}).lean();
 const costMap=new Map(actualCosts.map(p=>[p.date+":"+p.product,p]));
 const snapshots=await OrderCost.find({order:{$in:delivered.map(o=>o._id)}}).lean();
 const snapshotMap=new Map(snapshots.map(s=>[String(s.order),s]));
 const rows=new Map();
 for(let d=from;d<=to;d=shiftDay(d,1))rows.set(d,{date:d,bookedSales:0,bookedOrders:0,realizedRevenue:0,productRevenue:0,deliveryRevenue:0,deliveredOrders:0,cashCollected:0,pendingApprovalCash:0,purchaseSpend:0,operatingExpenses:0,knownEstimatedCogs:0,missingCostLines:0,frozenCostOrders:0,provisionalCostOrders:0,knownWasteCost:0,wasteMovements:0,missingWasteCosts:0});
 const add=(row,key,n)=>{row[key]+=n;};
 for(const o of booked){const r=rows.get(cairoDate(o.createdAt));add(r,"bookedSales",o.total);r.bookedOrders++;}
 for(const o of collected){const r=rows.get(cairoDate(o.courierDeliveredAt));add(r,"cashCollected",o.collectedAmount);if(!o.approvedAt)add(r,"pendingApprovalCash",o.collectedAmount);}
 for(const p of purchases)add(rows.get(p.date),"purchaseSpend",round2(p.quantity*p.unitCost));
 for(const e of expenses)add(rows.get(e.date),"operatingExpenses",e.amount);
 for(const w of waste){const r=rows.get(w.date);r.wasteMovements++;if(!Number.isFinite(w.unitCost)){r.missingWasteCosts++;continue;}add(r,"knownWasteCost",round2(w.quantity*w.unitCost));}
 for(const o of delivered){
 const r=rows.get(cairoDate(o.approvedAt));r.deliveredOrders++;add(r,"realizedRevenue",o.total);add(r,"productRevenue",o.subtotal);add(r,"deliveryRevenue",o.deliveryFee);
 const snapshot=snapshotMap.get(String(o._id));
 if(snapshot){r.frozenCostOrders++;add(r,"knownEstimatedCogs",snapshot.total);continue;}
 r.provisionalCostOrders++;
 for(const i of o.items){const p=costMap.get(o.deliveryDate+":"+i.product);if(!p||p.quantity<=0){r.missingCostLines++;continue;}add(r,"knownEstimatedCogs",round2(i.quantity*p.unitCost));}
 }
 const keys=Object.keys(rows.values().next().value).filter(k=>k!=="date");
 const totals=Object.fromEntries(keys.map(k=>[k,0]));
 const finish=r=>{for(const k of keys)r[k]=round2(r[k]);r.estimatedCogs=r.missingCostLines?null:r.knownEstimatedCogs;r.estimatedGrossProfit=r.estimatedCogs===null?null:round2(r.realizedRevenue-r.estimatedCogs);r.wasteCost=r.missingWasteCosts?null:r.knownWasteCost;r.estimatedNetProfit=r.estimatedGrossProfit===null||r.wasteCost===null?null:round2(r.estimatedGrossProfit-r.operatingExpenses-r.wasteCost);return r;};
 for(const r of rows.values())for(const k of keys)totals[k]+=r[k];
 res.set("Cache-Control","no-store");
 res.json({success:true,from,to,currency:"EGP",costBasis:"estimated_same_scheduled_day_purchase_unit_cost",inventoryCostingComplete:false,legacyDeliveredWithoutApprovalExcluded:true,totals:finish(totals),daily:[...rows.values()].map(finish)});
 }catch(e){serverError(res,e,"financeReport");}
});
// Lock the estimated acquisition cost for an approved delivery. Never overwrite a snapshot.
router.post("/orders/:id/freeze-cost",async(req,res)=>{
 try{
 if(!isValidId(req.params.id))return fail(res,400,"Invalid order ID");
 const order=await Order.findOne({_id:req.params.id,status:"delivered",approvedAt:{$type:"date"}}).lean();
 if(!order)return fail(res,404,"Approved order not found");
 const existing=await OrderCost.findOne({order:order._id});if(existing)return res.json({success:true,snapshot:existing});
 if(!validDate(order.deliveryDate)||!order.items.length)return fail(res,409,"Order cost unavailable");
 const purchases=await Purchase.find({date:order.deliveryDate,product:{$in:order.items.map(i=>i.product).filter(Boolean)}}).lean();
 const costs=new Map(purchases.map(p=>[String(p.product),p]));
 const lines=[];
 for(const i of order.items){const p=costs.get(String(i.product));if(!p||p.quantity<=0)return fail(res,409,"Missing purchase cost");lines.push({product:i.product,quantity:i.quantity,unitCost:p.unitCost,cost:round2(i.quantity*p.unitCost),purchase:p._id});}
 try{const snapshot=await OrderCost.create({order:order._id,lines,total:round2(lines.reduce((s,l)=>s+l.cost,0)),basis:"scheduled_day_purchase_estimate",recordedBy:req.user._id});return res.status(201).json({success:true,snapshot});}
 catch(e){if(e.code!==11000)throw e;const snapshot=await OrderCost.findOne({order:order._id});return res.json({success:true,snapshot});}
 }catch(e){serverError(res,e,"freezeOrderCost");}
});
router.get("/expenses",async(req,res)=>{
 try{const range=financeRange(req.query);if(!range)return fail(res,400,"Invalid report range");const page=Math.min(10000,Math.max(1,parseInt(req.query.page)||1));const filter={date:{$gte:range.from,$lte:range.to},voided:{$ne:true}};const [expenses,count]=await Promise.all([Expense.find(filter).sort({date:-1,createdAt:-1}).skip((page-1)*50).limit(50),Expense.countDocuments(filter)]);res.set("Cache-Control","no-store");res.json({success:true,expenses,count,page});}catch(e){serverError(res,e,"listExpenses");}
});
router.post("/expenses",async(req,res)=>{
 try{const {date=cairoDate(),category,amount,description}=req.body??{};if(!validDate(date)||!categories.includes(category)||typeof amount!=="number"||!Number.isFinite(amount)||amount<0.01||amount>10000000||Math.abs(amount-round2(amount))>1e-8||typeof description!=="string"||!description.trim()||description.length>300)return fail(res,400,"Invalid expense");const expense=await Expense.create({date,category,amount,description:description.trim(),recordedBy:req.user._id});res.status(201).json({success:true,expense});}catch(e){serverError(res,e,"createExpense");}
});
router.patch("/expenses/:id/void",async(req,res)=>{
 try{if(!isValidId(req.params.id))return fail(res,400,"Invalid expense ID");const expense=await Expense.findOneAndUpdate({_id:req.params.id,voided:{$ne:true}},{$set:{voided:true,voidedAt:new Date(),voidedBy:req.user._id}},{new:true});if(!expense)return fail(res,409,"Expense unavailable");res.json({success:true,expense});}catch(e){serverError(res,e,"voidExpense");}
});
export default router;
